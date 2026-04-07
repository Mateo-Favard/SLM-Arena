"""Pydantic models for SLM Arena — shared data structures."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# LLM parameters
# ---------------------------------------------------------------------------

class LLMParams(BaseModel):
    temperature: float = 0.7
    top_p: float = 0.9
    ctx_length: int = 2048
    max_tokens: int = 256


# ---------------------------------------------------------------------------
# Game service return types
# ---------------------------------------------------------------------------

class ActionInfo(BaseModel):
    format: str
    actions: list[Any]


class ValidationResult(BaseModel):
    valid: bool
    error: str | None = None


class ActionOutcome(BaseModel):
    result: str
    details: dict[str, Any] = {}


class GameOverResult(BaseModel):
    over: bool
    winner_id: str | None = None
    reason: str | None = None


# ---------------------------------------------------------------------------
# SLM response (parsed from LLM JSON output)
# ---------------------------------------------------------------------------

class SLMResponse(BaseModel):
    action: dict[str, Any]
    reasoning: str | None = None
    strategy: str | None = None


# ---------------------------------------------------------------------------
# Replay JSON models
# ---------------------------------------------------------------------------

class PlayerReplayInfo(BaseModel):
    id: str
    model_name: str
    model_params: dict[str, Any]
    display_name: str
    display_sub: str
    avatar_color: str


class ReplayMetadata(BaseModel):
    game_id: str
    game_type: str
    version: str = "1.0"
    started_at: datetime
    ended_at: datetime | None = None
    seed: int
    players: list[PlayerReplayInfo]
    first_player: str
    initial_state: dict[str, Any]
    game_config: dict[str, Any]


class ReplayTurn(BaseModel):
    turn_number: int
    player_id: str
    prompt_sent: str | None = None
    raw_response: str | None = None
    response_time_ms: int
    retries: int = 0
    skipped: bool = False
    action: dict[str, Any] | None = None
    action_result: str  # valid | invalid | skipped
    state_after: dict[str, Any]
    strategy_before: str | None = None
    strategy_after: str | None = None


class PlayerStats(BaseModel):
    player_id: str
    total_retries: int = 0
    total_skips: int = 0
    avg_response_ms: int = 0
    strategy_updates: int = 0
    game_stats: dict[str, Any] = {}


class ReplayResult(BaseModel):
    winner_id: str | None = None
    reason: str
    total_turns: int
    duration_ms: int
    player_stats: list[PlayerStats]


class ReplayJSON(BaseModel):
    metadata: ReplayMetadata
    turns: list[ReplayTurn] = []
    result: ReplayResult | None = None
