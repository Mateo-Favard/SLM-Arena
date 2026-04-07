"""Pydantic models for the V2 REST API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request models (POST /api/v1/matches)
# ---------------------------------------------------------------------------

class GameConfigRequest(BaseModel):
    type: str
    config: dict[str, Any] = {}
    max_turns: int = 100
    seed: int | None = None


class PlayerLLMParams(BaseModel):
    temperature: float = 0.7
    top_p: float = 0.9
    ctx_length: int = 2048
    max_tokens: int = 256


class PlayerAIServiceConfig(BaseModel):
    type: str = "single_shot"
    history_turns: int = 3


class PlayerRequest(BaseModel):
    id: str
    display_name: str
    display_sub: str = ""
    avatar_color: str = "#00F0FF"
    model_id: str  # "groq/llama-3.1-8b-instant"
    llm_params: PlayerLLMParams = PlayerLLMParams()
    ai_service: PlayerAIServiceConfig = PlayerAIServiceConfig()


class CreateMatchRequest(BaseModel):
    game: GameConfigRequest
    players: list[PlayerRequest]
    auto_render: bool = False


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class MatchResponse(BaseModel):
    id: str
    status: str


class MatchDetailResponse(BaseModel):
    id: str
    game_type: str
    status: str
    config: dict | None = None
    players: list | None = None
    replay: dict | None = None
    winner_id: str | None = None
    score: Any = None
    video_status: str | None = None
    video_path: str | None = None
    created_at: str | None = None
    completed_at: str | None = None
    duration_ms: int | None = None


class MatchListResponse(BaseModel):
    matches: list[MatchDetailResponse]
    total: int


class ModelInfoResponse(BaseModel):
    model_id: str
    display_name: str
    backend: str
    context_length: int | None = None
    owned_by: str | None = None


class GameInfoResponse(BaseModel):
    type: str
    default_config: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Internal config for CoreSlmArena (lightweight replacement for MatchConfig)
# ---------------------------------------------------------------------------

class ArenaPlayerInfo(BaseModel):
    id: str
    display_name: str
    display_sub: str
    avatar_color: str
    model_id: str
    llm_params: dict[str, Any]


class ArenaMatchConfig(BaseModel):
    game_type: str
    game_config: dict[str, Any] = {}
    seed: int
    first_player: str = "random"
    max_turns: int = 100
    players: list[ArenaPlayerInfo]
    include_prompts_in_replay: bool = True
