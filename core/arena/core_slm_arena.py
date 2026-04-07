"""CoreSlmArena — main game loop orchestrator. Zero game logic."""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any

from core.ai.ai_service import AIService
from core.arena.api_models import ArenaMatchConfig
from core.arena.models import (
    PlayerReplayInfo,
    PlayerStats,
    ReplayJSON,
    ReplayMetadata,
    ReplayResult,
    ReplayTurn,
)
from core.games.interface import GameServiceInterface

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


class CoreSlmArena:
    """Pure orchestrator. Calls GameServiceInterface methods in order."""

    def __init__(
        self,
        game_service: GameServiceInterface,
        ai_services: dict[str, AIService],
        config: ArenaMatchConfig,
    ):
        self.game = game_service
        self.ai = ai_services
        self.config = config

    def run_match(self) -> ReplayJSON:
        cfg = self.config
        game_cfg = cfg.game_config
        seed = cfg.seed

        # Resolve first player
        if cfg.first_player == "random":
            first = random.Random(seed).choice(["player_1", "player_2"])
        else:
            first = cfg.first_player

        # Init game
        state = self.game.init_game(game_cfg, seed)
        state["turn_order"] = [first, "player_2" if first == "player_1" else "player_1"]
        initial_state = _sanitize_state(state)

        rules = self.game.get_rules_prompt(game_cfg)
        schema = self.game.get_state_schema()
        max_turns = self.game.get_max_turns(game_cfg)

        # Build player info mapping
        player_map = {p.id: p for p in cfg.players}
        player_numbers = {"player_1": 1, "player_2": 2}
        game_name = cfg.game_type.replace("_", " ").title()

        # Init replay
        started_at = datetime.now(timezone.utc)
        players_replay = [
            PlayerReplayInfo(
                id=p.id,
                model_name=p.model_id.split("/", 1)[1] if "/" in p.model_id else p.model_id,
                model_params=p.llm_params,
                display_name=p.display_name,
                display_sub=p.display_sub,
                avatar_color=p.avatar_color,
            )
            for p in cfg.players
        ]

        metadata = ReplayMetadata(
            game_id=str(uuid.uuid4()),
            game_type=cfg.game_type,
            started_at=started_at,
            seed=seed,
            players=players_replay,
            first_player=first,
            initial_state=initial_state,
            game_config=game_cfg,
        )

        turns: list[ReplayTurn] = []
        strategies: dict[str, str | None] = {"player_1": None, "player_2": None}
        history: list[dict[str, Any]] = []
        total_retries: dict[str, int] = {"player_1": 0, "player_2": 0}
        total_skips: dict[str, int] = {"player_1": 0, "player_2": 0}
        total_response_ms: dict[str, int] = {"player_1": 0, "player_2": 0}
        total_turns_per_player: dict[str, int] = {"player_1": 0, "player_2": 0}
        strategy_updates: dict[str, int] = {"player_1": 0, "player_2": 0}

        turn_number = 0
        game_over_result = None

        logger.info("Match started: %s (seed=%d, first=%s)", cfg.game_type, seed, first)

        while turn_number < max_turns:
            turn_number += 1
            player_id = self.game.get_next_player(state)

            # Check for automatic action (e.g., dealer in blackjack)
            auto_action = self.game.get_auto_action(state, player_id)
            if auto_action is not None:
                state, outcome = self.game.apply_action(state, player_id, auto_action)
                logger.info("Turn %d: %s (auto) → %s (%s)", turn_number, player_id, auto_action, outcome.result)

                turns.append(ReplayTurn(
                    turn_number=turn_number,
                    player_id=player_id,
                    response_time_ms=0,
                    retries=0,
                    skipped=False,
                    action=auto_action,
                    action_result="valid",
                    state_after=_sanitize_state(state),
                ))

                history.append({
                    "turn": turn_number,
                    "player": player_id,
                    "action": auto_action,
                    "result": outcome.result,
                })

                game_over_result = self.game.is_game_over(state)
                if game_over_result.over:
                    logger.info("Game over: winner=%s, reason=%s", game_over_result.winner_id, game_over_result.reason)
                    break
                continue

            pcfg = player_map[player_id]

            player_view = self.game.get_player_view(state, player_id)
            action_info = self.game.get_available_actions(state, player_id)

            if not action_info.actions:
                logger.debug("Turn %d: %s has no actions, skipping", turn_number, player_id)
                continue

            strategy_before = strategies[player_id]

            # First attempt
            try:
                response, elapsed_ms, prompt_sent, raw_response = self.ai[player_id].play_turn(
                    rules=rules,
                    schema=schema,
                    player_view=player_view,
                    action_info=action_info,
                    strategy=strategies[player_id],
                    history=history,
                    turn_number=turn_number,
                    player_number=player_numbers[player_id],
                    player_symbol=str(player_numbers[player_id]),
                    game_name=game_name,
                )
            except Exception as e:
                logger.error("Turn %d: %s LLM call failed: %s", turn_number, player_id, e)
                _log_skip(turns, turn_number, player_id, state, strategy_before, cfg)
                total_skips[player_id] += 1
                continue

            # Validate + retry loop
            action = response.action
            retries = 0
            valid = False
            total_elapsed = elapsed_ms

            validation = self.game.validate_action(state, player_id, action)
            if validation.valid:
                valid = True
            else:
                while retries < MAX_RETRIES and not valid:
                    retries += 1
                    logger.debug("Turn %d: %s retry %d — %s", turn_number, player_id, retries, validation.error)
                    try:
                        response, retry_ms, _, raw_response = self.ai[player_id].retry(
                            error=validation.error,
                            action_info=action_info,
                        )
                        total_elapsed += retry_ms
                        action = response.action
                        validation = self.game.validate_action(state, player_id, action)
                        if validation.valid:
                            valid = True
                    except Exception as e:
                        logger.error("Turn %d: %s retry %d parse failed: %s", turn_number, player_id, retries, e)

            total_retries[player_id] += retries

            if not valid:
                logger.warning("Turn %d: %s skipped after %d retries", turn_number, player_id, MAX_RETRIES)
                _log_skip(turns, turn_number, player_id, state, strategy_before, cfg)
                total_skips[player_id] += 1
                continue

            # Apply action
            state, outcome = self.game.apply_action(state, player_id, action)
            logger.info("Turn %d: %s → %s (%s)", turn_number, player_id, action, outcome.result)

            # Update strategy
            strategy_after = strategies[player_id]
            if response.strategy:
                strategies[player_id] = response.strategy
                strategy_after = response.strategy
                strategy_updates[player_id] += 1

            # Track stats
            total_response_ms[player_id] += total_elapsed
            total_turns_per_player[player_id] += 1

            # Log turn
            turn = ReplayTurn(
                turn_number=turn_number,
                player_id=player_id,
                prompt_sent=prompt_sent if cfg.include_prompts_in_replay else None,
                raw_response=raw_response if cfg.include_prompts_in_replay else None,
                response_time_ms=total_elapsed,
                retries=retries,
                skipped=False,
                action=action,
                action_result="valid",
                state_after=_sanitize_state(state),
                strategy_before=strategy_before,
                strategy_after=strategy_after,
            )
            turns.append(turn)

            # Update history
            history.append({
                "turn": turn_number,
                "player": player_id,
                "action": action,
                "result": outcome.result,
            })

            # Check game over
            game_over_result = self.game.is_game_over(state)
            if game_over_result.over:
                logger.info("Game over: winner=%s, reason=%s", game_over_result.winner_id, game_over_result.reason)
                break

        # If max turns reached without game over
        if game_over_result is None or not game_over_result.over:
            game_over_result = self.game.is_game_over(state)
            if not game_over_result.over:
                logger.info("Max turns (%d) reached — draw", max_turns)
                game_over_result.over = True
                game_over_result.reason = "max_turns"

        ended_at = datetime.now(timezone.utc)
        metadata.ended_at = ended_at
        duration_ms = int((ended_at - started_at).total_seconds() * 1000)

        # Build player stats
        player_stats = []
        for pid in ["player_1", "player_2"]:
            t_count = total_turns_per_player[pid]
            game_stats = self.game.get_player_stats(state, pid)
            player_stats.append(PlayerStats(
                player_id=pid,
                total_retries=total_retries[pid],
                total_skips=total_skips[pid],
                avg_response_ms=total_response_ms[pid] // t_count if t_count > 0 else 0,
                strategy_updates=strategy_updates[pid],
                game_stats=game_stats,
            ))

        result = ReplayResult(
            winner_id=game_over_result.winner_id,
            reason=game_over_result.reason or "unknown",
            total_turns=turn_number,
            duration_ms=duration_ms,
            player_stats=player_stats,
        )

        return ReplayJSON(metadata=metadata, turns=turns, result=result)


def _sanitize_state(state: dict[str, Any]) -> dict[str, Any]:
    """Remove internal fields not needed in the replay (like the deck)."""
    exclude = {"deck", "config", "turn_order", "turn_index", "draw_pile", "rounds_deals"}
    return {k: v for k, v in state.items() if k not in exclude}


def _log_skip(
    turns: list[ReplayTurn],
    turn_number: int,
    player_id: str,
    state: dict[str, Any],
    strategy_before: str | None,
    cfg: ArenaMatchConfig,
) -> None:
    turns.append(ReplayTurn(
        turn_number=turn_number,
        player_id=player_id,
        response_time_ms=0,
        retries=MAX_RETRIES,
        skipped=True,
        action=None,
        action_result="skipped",
        state_after=_sanitize_state(state),
        strategy_before=strategy_before,
    ))
