"""Chicken Game — two players face each other on a 10-cell track and advance toward each other.

Simultaneous play (phase-based like Prisoner's Dilemma).
Best of 3 rounds, cumulative scoring.
"""

from __future__ import annotations

from typing import Any

from core.arena.models import ActionInfo, ActionOutcome, GameOverResult, ValidationResult
from core.games.game_server import register_game
from core.games.interface import GameServiceInterface

DEFAULT_CONFIG = {
    "track_length": 10,
    "max_advance": 6,
    "num_rounds": 3,
    "exit_collision_distance": 2,
}


@register_game("chicken_game")
class ChickenGameService(GameServiceInterface):

    def init_game(self, config: dict[str, Any], seed: int) -> dict[str, Any]:
        cfg = {**DEFAULT_CONFIG, **config}
        track = cfg["track_length"]
        return {
            "config": cfg,
            "current_round": 1,
            "phase": "player_1_choosing",
            "player_1_position": 1,
            "player_2_position": track,
            "player_1_current_action": None,
            "player_2_current_action": None,
            "player_1_exited": False,
            "player_2_exited": False,
            "player_1_exit_side": None,
            "player_2_exit_side": None,
            "player_1_round_score": 0,
            "player_2_round_score": 0,
            "round_scores": [],
            "cumulative_scores": {"player_1": 0, "player_2": 0},
            "current_turn_in_round": 0,
            "turn_history": [],
            "game_over": False,
            "winner": None,
            "reason": None,
        }

    def get_rules_prompt(self, config: dict[str, Any]) -> str:
        cfg = {**DEFAULT_CONFIG, **config}
        track = cfg["track_length"]
        max_adv = cfg["max_advance"]
        rounds = cfg["num_rounds"]
        exit_dist = cfg["exit_collision_distance"]
        return f"""You are playing a game of Chicken on a {track}-cell track.

## Setup
Two players face each other on a straight track of {track} cells.
Player 1 starts at position 1 (moves toward position {track}).
Player 2 starts at position {track} (moves toward position 1).
You are driving toward each other.

## Actions (simultaneous — you do NOT see your opponent's choice for the current turn)
Each turn, you choose ONE action:
- **advance(1-{max_adv})**: Move 1 to {max_adv} cells toward your opponent. Your score increases by that amount.
- **exit_left**: Swerve off the track to the left. Locks your current score.
- **exit_right**: Swerve off the track to the right. Locks your current score.

## Scoring
Your score = the sum of ALL your advances in the current round.
Example: advance 3, then advance 4 = score of 7.

## Collision (CRASH)
If after both players move, their positions have **crossed or landed on the same cell**, it's a CRASH.
Both players' scores for this round become **0**.
Example: You are at position 4, opponent at position 7 (distance 3). You advance 4 (new pos 8), opponent advances 3 (new pos 4). Positions crossed → CRASH → both get 0.

## Exiting
When you exit, you immediately leave the track and lock your current round score.
If your opponent hasn't exited, they continue advancing freely (no crash risk) and accumulate the remaining distance as bonus points.

## Exit collision
If BOTH players exit on the SAME turn:
- Distance between them > {exit_dist} → no collision, both keep their scores
- Distance ≤ {exit_dist} AND same exit side (both left or both right) → collision, both scores = 0
- Distance ≤ {exit_dist} AND different sides → no collision, both keep scores

## Best of {rounds}
The game is played over {rounds} rounds. Scores are CUMULATIVE across rounds.
The player with the highest total score after {rounds} rounds wins.

## The dilemma
- Exit early = low score but safe
- Exit late = high score but risk of crash (both get 0)
- If you crash, your opponent's total score stays ahead
- If your opponent exits and you don't, you get bonus points for the remaining track

## Good example
State: You at position 3, opponent at 8, distance 5, your round score 2.
Action: {{"type": "advance", "value": 3}}
Result: You move to position 6, distance shrinks to 2. Score becomes 5. Risky but high reward.

## Bad example
State: You at position 5, opponent at 7, distance 2.
Action: {{"type": "advance", "value": 4}}
Result: You move to position 9, past opponent at 7. Positions crossed → CRASH → score 0.
Better: advance 1 or exit to lock your score."""

    def get_state_schema(self) -> str:
        return """- "round": integer, the current round number (1-3).
- "total_rounds": integer, number of rounds in this best-of series (3).
- "your_position": integer, your current position on the track (1-10).
- "opponent_position": integer, opponent's current position (1-10).
- "distance_between": integer, distance between you and your opponent. DANGER: if this reaches 0 or below after moves, you CRASH and both scores reset to 0.
- "track_length": integer, total length of the track (10).
- "your_round_score": integer, your accumulated score in the current round. This is the sum of all your advances so far.
- "opponent_round_score": integer, opponent's accumulated score in the current round.
- "your_cumulative_score": integer, your total score across all rounds.
- "opponent_cumulative_score": integer, opponent's total score across all rounds.
- "opponent_exited": boolean, true if your opponent has exited the track. If true, you can advance freely without risk of collision.
- "previous_turns_this_round": array of turn objects showing what happened in earlier turns of this round.
- "round_history": array of completed rounds with scores and outcomes."""

    def get_player_view(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        cfg = state["config"]
        other = "player_2" if player_id == "player_1" else "player_1"

        my_pos = state[f"{player_id}_position"]
        opp_pos = state[f"{other}_position"]
        distance = abs(my_pos - opp_pos)

        # Build turn history for this round
        prev_turns = []
        for t in state.get("turn_history", []):
            if t["round"] == state["current_round"]:
                prev_turns.append({
                    "turn": t["turn"],
                    "your_action": t[f"{player_id}_action"],
                    "opponent_action": t[f"{other}_action"],
                    "your_position_after": t[f"{player_id}_position_after"],
                    "opponent_position_after": t[f"{other}_position_after"],
                    "distance_after": abs(t[f"{player_id}_position_after"] - t[f"{other}_position_after"]),
                })

        # Build round history
        round_hist = []
        for r in state["round_scores"]:
            round_hist.append({
                "round": r["round"],
                "your_score": r[f"{player_id}_score"],
                "opponent_score": r[f"{other}_score"],
                "outcome": r["outcome"],
            })

        return {
            "round": state["current_round"],
            "total_rounds": cfg["num_rounds"],
            "your_position": my_pos,
            "opponent_position": opp_pos,
            "distance_between": distance,
            "track_length": cfg["track_length"],
            "your_round_score": state[f"{player_id}_round_score"],
            "opponent_round_score": state[f"{other}_round_score"],
            "your_cumulative_score": state["cumulative_scores"][player_id],
            "opponent_cumulative_score": state["cumulative_scores"][other],
            "opponent_exited": state[f"{other}_exited"],
            "previous_turns_this_round": prev_turns,
            "round_history": round_hist,
        }

    def get_available_actions(self, state: dict[str, Any], player_id: str) -> ActionInfo:
        cfg = state["config"]
        track = cfg["track_length"]
        max_adv = cfg["max_advance"]

        pos = state[f"{player_id}_position"]

        # Calculate max advance (can't go past end of track)
        if player_id == "player_1":
            remaining = track - pos
        else:
            remaining = pos - 1

        effective_max = min(max_adv, remaining)

        actions: list[dict[str, Any]] = []
        for v in range(1, effective_max + 1):
            actions.append({"type": "advance", "value": v})
        actions.append({"type": "exit", "side": "left"})
        actions.append({"type": "exit", "side": "right"})

        return ActionInfo(
            format="Choose advance with a value (1-{}) OR exit with a side (left/right)".format(effective_max),
            actions=actions,
        )

    def validate_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> ValidationResult:
        cfg = state["config"]
        track = cfg["track_length"]
        max_adv = cfg["max_advance"]

        if state[f"{player_id}_exited"]:
            return ValidationResult(valid=False, error="You have already exited the track.")

        atype = action.get("type")
        if atype not in ("advance", "exit"):
            return ValidationResult(valid=False, error="action.type must be 'advance' or 'exit'.")

        if atype == "advance":
            val = action.get("value")
            if not isinstance(val, int) or val < 1:
                return ValidationResult(valid=False, error="advance value must be an integer >= 1.")
            pos = state[f"{player_id}_position"]
            remaining = (track - pos) if player_id == "player_1" else (pos - 1)
            effective_max = min(max_adv, remaining)
            if val > effective_max:
                return ValidationResult(valid=False, error=f"advance value must be between 1 and {effective_max}.")
            return ValidationResult(valid=True)

        if atype == "exit":
            side = action.get("side")
            if side not in ("left", "right"):
                return ValidationResult(valid=False, error="exit side must be 'left' or 'right'.")
            return ValidationResult(valid=True)

        return ValidationResult(valid=False, error="Invalid action.")

    def apply_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> tuple[dict[str, Any], ActionOutcome]:
        s = {**state, "cumulative_scores": {**state["cumulative_scores"]}}

        if player_id == "player_1":
            s["player_1_current_action"] = action
            s["phase"] = "player_2_choosing"
            return s, ActionOutcome(result="action_stored", details={"waiting_for": "player_2"})

        # Player 2 played — resolve the turn
        s["player_2_current_action"] = action
        return self._resolve_turn(s)

    def _resolve_turn(self, state: dict[str, Any]) -> tuple[dict[str, Any], ActionOutcome]:
        s = state
        cfg = s["config"]
        track = cfg["track_length"]
        exit_dist = cfg["exit_collision_distance"]

        a1 = s["player_1_current_action"]
        a2 = s["player_2_current_action"]

        p1_exits = a1["type"] == "exit"
        p2_exits = a2["type"] == "exit"

        s["current_turn_in_round"] += 1

        # ─── Case 1: Both advance ───
        if not p1_exits and not p2_exits:
            adv1 = a1["value"]
            adv2 = a2["value"]

            new_p1 = s["player_1_position"] + adv1
            new_p2 = s["player_2_position"] - adv2

            # Check crash: positions crossed or same cell
            crashed = new_p1 >= new_p2

            if crashed:
                # Crash — scores to 0
                outcome = self._end_round(s, "crash", 0, 0, new_p1, new_p2, a1, a2)
                return s, outcome
            else:
                # No crash — update positions and scores
                s["player_1_position"] = new_p1
                s["player_2_position"] = new_p2
                s["player_1_round_score"] += adv1
                s["player_2_round_score"] += adv2
                self._record_turn(s, a1, a2, new_p1, new_p2)
                s["player_1_current_action"] = None
                s["player_2_current_action"] = None
                s["phase"] = "player_1_choosing"
                return s, ActionOutcome(result="both_advanced", details={
                    "player_1_position": new_p1,
                    "player_2_position": new_p2,
                    "distance": new_p2 - new_p1,
                })

        # ─── Case 2: Both exit ───
        if p1_exits and p2_exits:
            distance = abs(s["player_1_position"] - s["player_2_position"])
            same_side = a1["side"] == a2["side"]

            if distance <= exit_dist and same_side:
                outcome = self._end_round(s, "exit_collision", 0, 0,
                                          s["player_1_position"], s["player_2_position"], a1, a2)
                return s, outcome
            else:
                p1_score = s["player_1_round_score"]
                p2_score = s["player_2_round_score"]
                outcome = self._end_round(s, "both_exited", p1_score, p2_score,
                                          s["player_1_position"], s["player_2_position"], a1, a2)
                return s, outcome

        # ─── Case 3: One exits, one advances ───
        if p1_exits and not p2_exits:
            exiter, advancer = "player_1", "player_2"
            exit_action, adv_action = a1, a2
        else:
            exiter, advancer = "player_2", "player_1"
            exit_action, adv_action = a2, a1

        # The advancer gets their advance for this turn
        adv_val = adv_action["value"]
        if advancer == "player_1":
            new_adv_pos = s["player_1_position"] + adv_val
            remaining_bonus = track - new_adv_pos
        else:
            new_adv_pos = s["player_2_position"] - adv_val
            remaining_bonus = new_adv_pos - 1

        s[f"{advancer}_position"] = new_adv_pos
        s[f"{advancer}_round_score"] += adv_val + max(0, remaining_bonus)
        s[f"{exiter}_exited"] = True
        s[f"{exiter}_exit_side"] = exit_action["side"]

        exiter_score = s[f"{exiter}_round_score"]
        advancer_score = s[f"{advancer}_round_score"]

        p1_score = exiter_score if exiter == "player_1" else advancer_score
        p2_score = exiter_score if exiter == "player_2" else advancer_score

        outcome = self._end_round(s, f"{exiter}_exited", p1_score, p2_score,
                                  s["player_1_position"], s["player_2_position"], a1, a2)
        return s, outcome

    def _record_turn(self, state: dict[str, Any], a1: dict, a2: dict, p1_pos: int, p2_pos: int):
        state.setdefault("turn_history", []).append({
            "round": state["current_round"],
            "turn": state["current_turn_in_round"],
            "player_1_action": a1,
            "player_2_action": a2,
            "player_1_position_after": p1_pos,
            "player_2_position_after": p2_pos,
        })

    def _end_round(self, state: dict[str, Any], outcome: str,
                   p1_score: int, p2_score: int,
                   p1_pos: int, p2_pos: int,
                   a1: dict, a2: dict) -> ActionOutcome:
        cfg = state["config"]
        track = cfg["track_length"]

        self._record_turn(state, a1, a2, p1_pos, p2_pos)

        state["round_scores"].append({
            "round": state["current_round"],
            "player_1_score": p1_score,
            "player_2_score": p2_score,
            "outcome": outcome,
            "turns_played": state["current_turn_in_round"],
        })

        state["cumulative_scores"]["player_1"] += p1_score
        state["cumulative_scores"]["player_2"] += p2_score

        # Check if game is over
        if state["current_round"] >= cfg["num_rounds"]:
            state["game_over"] = True
            s1 = state["cumulative_scores"]["player_1"]
            s2 = state["cumulative_scores"]["player_2"]
            if s1 > s2:
                state["winner"] = "player_1"
                state["reason"] = "highest_score"
            elif s2 > s1:
                state["winner"] = "player_2"
                state["reason"] = "highest_score"
            else:
                state["winner"] = None
                state["reason"] = "draw"
        else:
            # Start next round
            state["current_round"] += 1
            state["player_1_position"] = 1
            state["player_2_position"] = track
            state["player_1_exited"] = False
            state["player_2_exited"] = False
            state["player_1_exit_side"] = None
            state["player_2_exit_side"] = None
            state["player_1_round_score"] = 0
            state["player_2_round_score"] = 0
            state["current_turn_in_round"] = 0

        state["player_1_current_action"] = None
        state["player_2_current_action"] = None
        state["phase"] = "player_1_choosing"

        return ActionOutcome(result=outcome, details={
            "round": state["current_round"] - (0 if state["game_over"] else 1),
            "player_1_score": p1_score,
            "player_2_score": p2_score,
        })

    def get_next_player(self, state: dict[str, Any]) -> str:
        phase = state.get("phase", "player_1_choosing")
        if phase == "player_1_choosing":
            return "player_1"
        return "player_2"

    def get_max_turns(self, config: dict[str, Any]) -> int:
        cfg = {**DEFAULT_CONFIG, **config}
        return cfg.get("max_turns", 60)

    def is_game_over(self, state: dict[str, Any]) -> GameOverResult:
        if state.get("game_over"):
            return GameOverResult(
                over=True,
                winner_id=state.get("winner"),
                reason=state.get("reason"),
            )
        return GameOverResult(over=False)

    def get_player_stats(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        other = "player_2" if player_id == "player_1" else "player_1"

        total_advances = 0
        advance_count = 0
        exit_sides: list[str] = []
        rounds_crashed = 0
        rounds_exited = 0
        aggressive_count = 0
        turns_before_exit: list[int] = []
        times_opponent_exited_first = 0
        round_max_score = 0

        for r in state["round_scores"]:
            score = r[f"{player_id}_score"]
            round_max_score = max(round_max_score, score)
            if "crash" in r["outcome"] or "collision" in r["outcome"]:
                rounds_crashed += 1
            if f"{player_id}_exited" in r["outcome"]:
                rounds_exited += 1
            if f"{other}_exited" in r["outcome"]:
                times_opponent_exited_first += 1

        for t in state.get("turn_history", []):
            action = t.get(f"{player_id}_action", {})
            if action.get("type") == "advance":
                val = action.get("value", 0)
                total_advances += val
                advance_count += 1
                if val >= 5:
                    aggressive_count += 1
            elif action.get("type") == "exit":
                side = action.get("side", "")
                if side not in exit_sides:
                    exit_sides.append(side)

        return {
            "cumulative_score": state["cumulative_scores"][player_id],
            "total_distance_covered": total_advances,
            "avg_advance_per_turn": round(total_advances / advance_count, 1) if advance_count else 0,
            "rounds_crashed": rounds_crashed,
            "rounds_exited": rounds_exited,
            "exit_sides": exit_sides,
            "max_score_in_round": round_max_score,
            "aggressive_advances_count": aggressive_count,
        }
