"""Async match worker — processes matches sequentially from an asyncio queue."""

from __future__ import annotations

import asyncio
import logging
import os
import random
from pathlib import Path
from typing import Any

from core.ai.ai_service import AIService
from core.arena.api_models import ArenaMatchConfig, ArenaPlayerInfo, CreateMatchRequest
from core.arena.core_slm_arena import CoreSlmArena
from core.arena.models import LLMParams
from core.brain.factory import create_brain
from core.db.match_repository import MatchRepository
from core.games.game_server import get_game_service
from core.render_client.interface import RenderServiceInterface
from core.replay.exporter import export_replay

logger = logging.getLogger(__name__)

REPLAYS_DIR = os.environ.get("REPLAYS_DIR", "./replays")
VIDEOS_DIR = os.environ.get("VIDEOS_DIR", "./videos")


class MatchWorker:

    def __init__(self, db: MatchRepository, render_service: RenderServiceInterface | None = None):
        self.db = db
        self.render_service = render_service
        self._queue: asyncio.Queue[tuple[str, CreateMatchRequest]] = asyncio.Queue()

    async def start(self):
        """Run forever, processing matches one at a time."""
        logger.info("MatchWorker started")
        while True:
            match_id, request = await self._queue.get()
            try:
                await self._execute_match(match_id, request)
            except Exception as e:
                logger.error("Match %s failed: %s", match_id, e)
                self.db.update_failed(match_id, str(e))
            finally:
                self._queue.task_done()

    async def enqueue(self, match_id: str, request: CreateMatchRequest):
        await self._queue.put((match_id, request))

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()

    async def _execute_match(self, match_id: str, request: CreateMatchRequest):
        self.db.update_status(match_id, "running")
        logger.info("Starting match %s: %s", match_id, request.game.type)

        # Build AI services for each player
        ai_services: dict[str, AIService] = {}
        for p in request.players:
            backend, model_name = p.model_id.split("/", 1)
            brain = create_brain(backend)
            llm_params = LLMParams(
                temperature=p.llm_params.temperature,
                top_p=p.llm_params.top_p,
                ctx_length=p.llm_params.ctx_length,
                max_tokens=p.llm_params.max_tokens,
            )
            ai_services[p.id] = AIService(
                brain=brain,
                model_name=model_name,
                llm_params=llm_params,
                mode=p.ai_service.type,
                history_turns=p.ai_service.history_turns,
            )

        # Build arena config
        seed = request.game.seed if request.game.seed is not None else random.randint(1, 999999)
        arena_config = ArenaMatchConfig(
            game_type=request.game.type,
            game_config=request.game.config,
            seed=seed,
            first_player="random",
            max_turns=request.game.max_turns,
            players=[
                ArenaPlayerInfo(
                    id=p.id,
                    display_name=p.display_name,
                    display_sub=p.display_sub,
                    avatar_color=p.avatar_color,
                    model_id=p.model_id,
                    llm_params=p.llm_params.model_dump(),
                )
                for p in request.players
            ],
        )

        game_service = get_game_service(request.game.type)
        arena = CoreSlmArena(game_service, ai_services, arena_config)

        # Run match in thread (blocking call)
        replay = await asyncio.to_thread(arena.run_match)

        # Export replay to file
        replay_path = export_replay(replay, REPLAYS_DIR)
        logger.info("Match %s completed. Replay: %s", match_id, replay_path)

        # Build score string
        score = None
        if replay.result and replay.result.player_stats:
            stats = {s.player_id: s.game_stats for s in replay.result.player_stats}
            score = str(stats)

        # Update DB
        self.db.update_result(
            match_id=match_id,
            winner_id=replay.result.winner_id if replay.result else None,
            score=score,
            replay=replay.model_dump(mode="json"),
            duration_ms=replay.result.duration_ms if replay.result else 0,
        )

        # Auto-render if requested
        if request.auto_render and self.render_service:
            await self._auto_render(match_id, replay_path)

    async def _auto_render(self, match_id: str, replay_path: str):
        try:
            if not self.render_service.is_available():
                logger.warning("Render service unavailable, skipping auto-render for %s", match_id)
                return
            video_name = Path(replay_path).stem + ".mp4"
            output_path = str(Path(VIDEOS_DIR) / video_name)
            self.db.update_video(match_id, "rendering", output_path)
            render_job = self.render_service.submit_render(replay_path, output_path)
            logger.info("Auto-render submitted for match %s: render_job=%s", match_id, render_job.job_id)
        except Exception as e:
            logger.error("Auto-render failed for match %s: %s", match_id, e)
