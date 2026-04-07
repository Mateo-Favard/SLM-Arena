"""SLM Arena V2 — FastAPI REST API."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from core.arena.api_models import (
    CreateMatchRequest,
    GameInfoResponse,
    MatchDetailResponse,
    MatchResponse,
    ModelInfoResponse,
)
from core.arena.worker import MatchWorker
from core.db.match_repository import MatchRepository
from core.games.game_server import get_game_service, _REGISTRY
from core.models_registry.registry import ModelRegistry
from core.models_registry.groq_provider import GroqModelProvider
from core.models_registry.local_provider import LocalModelProvider
from core.models_registry.openrouter_provider import OpenRouterModelProvider
from core.render_client.http_render_service import HttpRenderService
from core.render_client.interface import RenderServiceInterface

# Force game registration
import core.games.blackjack  # noqa: F401
import core.games.tictactoe  # noqa: F401
import core.games.battleship  # noqa: F401
import core.games.chicken_game  # noqa: F401

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="SLM Arena", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Services ---

REPLAYS_DIR = os.environ.get("REPLAYS_DIR", "./replays")
VIDEOS_DIR = os.environ.get("VIDEOS_DIR", "./videos")

db = MatchRepository()

render_service: RenderServiceInterface = HttpRenderService(
    base_url=os.environ.get("RENDER_SERVICE_URL", "http://localhost:3000")
)

model_registry = ModelRegistry()
model_registry.add_provider(GroqModelProvider())
model_registry.add_provider(LocalModelProvider())
model_registry.add_provider(OpenRouterModelProvider())

worker = MatchWorker(db=db, render_service=render_service)


# --- Startup ---

@app.on_event("startup")
async def startup():
    asyncio.create_task(worker.start())
    logger.info("SLM Arena V2 started")


# --- Health ---

@app.get("/health")
def health():
    render_ok = render_service.is_available()
    return {"status": "ok", "render_service": "ok" if render_ok else "unavailable"}


# --- Games ---

@app.get("/api/v1/games", response_model=list[GameInfoResponse])
def list_games():
    games = []
    for game_type in _REGISTRY:
        try:
            svc = get_game_service(game_type)
            default_cfg = {}
            # Try to get sensible defaults from the game
            if hasattr(svc, "DEFAULT_CONFIG"):
                default_cfg = svc.DEFAULT_CONFIG
        except Exception:
            default_cfg = {}
        games.append(GameInfoResponse(type=game_type, default_config=default_cfg))
    return games


# --- Models ---

@app.get("/api/v1/models", response_model=list[ModelInfoResponse])
def list_models(backend: str | None = None):
    models = model_registry.list_models(backend=backend)
    return [
        ModelInfoResponse(
            model_id=m.model_id,
            display_name=m.display_name,
            backend=m.backend,
            context_length=m.context_length,
            owned_by=m.owned_by,
        )
        for m in models
    ]


# --- Matches ---

@app.post("/api/v1/matches", response_model=MatchResponse)
async def create_match(req: CreateMatchRequest):
    if len(req.players) != 2:
        raise HTTPException(400, "Exactly 2 players required")

    # Validate game type
    if req.game.type not in _REGISTRY:
        raise HTTPException(400, f"Unknown game type: {req.game.type}. Available: {list(_REGISTRY.keys())}")

    match_id = str(uuid.uuid4())

    # Store in DB
    db.create_match(
        match_id=match_id,
        game_type=req.game.type,
        config=req.game.model_dump(),
        players=[p.model_dump() for p in req.players],
    )

    # Enqueue for processing
    await worker.enqueue(match_id, req)

    return MatchResponse(id=match_id, status="queued")


@app.get("/api/v1/matches", response_model=list[MatchDetailResponse])
def list_matches(
    game_type: str | None = None,
    status: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    rows = db.list_matches(game_type=game_type, status=status, limit=limit, offset=offset)
    return [_row_to_detail(r) for r in rows]


@app.get("/api/v1/matches/{match_id}", response_model=MatchDetailResponse)
def get_match(match_id: str):
    row = db.get_match(match_id)
    if not row:
        raise HTTPException(404, "Match not found")
    return _row_to_detail(row)


@app.get("/api/v1/matches/{match_id}/video")
def get_match_video(match_id: str):
    row = db.get_match(match_id)
    if not row:
        raise HTTPException(404, "Match not found")
    video_path = row.get("video_path")
    if not video_path or not Path(video_path).exists():
        raise HTTPException(404, "Video not available")
    return FileResponse(video_path, media_type="video/mp4")


@app.post("/api/v1/matches/{match_id}/render")
def trigger_render(match_id: str):
    row = db.get_match(match_id)
    if not row:
        raise HTTPException(404, "Match not found")
    if row["status"] != "completed":
        raise HTTPException(400, "Match not completed yet")

    if not render_service.is_available():
        raise HTTPException(503, "Render service unavailable")

    # Find replay file
    replay_files = list(Path(REPLAYS_DIR).glob(f"*{match_id[:8]}*"))
    if not replay_files:
        # Use replay from DB
        replay = row.get("replay")
        if not replay:
            raise HTTPException(404, "No replay data available")
        # Write temporary replay file
        import json
        replay_path = str(Path(REPLAYS_DIR) / f"{match_id}.json")
        Path(REPLAYS_DIR).mkdir(parents=True, exist_ok=True)
        with open(replay_path, "w") as f:
            json.dump(replay, f)
    else:
        replay_path = str(replay_files[0])

    video_name = Path(replay_path).stem + ".mp4"
    output_path = str(Path(VIDEOS_DIR) / video_name)

    render_job = render_service.submit_render(replay_path, output_path)
    db.update_video(match_id, "rendering", output_path)

    return {
        "render_job_id": render_job.job_id,
        "status": render_job.status.value,
        "video_path": output_path,
    }


# --- Helpers ---

def _row_to_detail(row: dict) -> MatchDetailResponse:
    return MatchDetailResponse(
        id=row["id"],
        game_type=row["game_type"],
        status=row["status"],
        config=row.get("config"),
        players=row.get("players"),
        replay=row.get("replay"),
        winner_id=row.get("winner_id"),
        score=row.get("score"),
        video_status=row.get("video_status"),
        video_path=row.get("video_path"),
        created_at=row.get("created_at"),
        completed_at=row.get("completed_at"),
        duration_ms=row.get("duration_ms"),
    )
