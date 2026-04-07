"""Unified AI service — prompt building, retry logic, response parsing.

Single class with `mode` parameter: "single_shot" or "multi_turn".
No interface, no subclasses.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from core.arena.models import ActionInfo, LLMParams, SLMResponse
from core.brain.interface import AgentBrainServiceInterface

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

SYSTEM_TEMPLATE = """You are a skilled {game_name} player competing in the SLM Arena.
Your goal is to win by making the best possible moves.
You are Player {player_number} ({player_symbol}).
You are competing against another AI model. Your performance is being evaluated.
Be inventive and think ahead.

## Rules

{rules_text}

## State format

Each turn you receive a JSON object representing the current game state.
Here are the fields and their meaning:

{state_schema}

## Response format

You MUST respond with a valid JSON object and nothing else.
Do not include any text, markdown, or explanation outside the JSON.

{{
  "action": {action_format},
  "reasoning": "optional — explain your thinking process",
  "strategy": "optional — your updated game plan for future turns"
}}

Only the "action" field is required.
The "reasoning" field is encouraged — explain why you chose this action.
The "strategy" field lets you maintain a game plan across turns.
If you provide a "strategy", it will replace your previous one and be shown to you next turn."""

TURN_TEMPLATE = """## Turn {turn_number}

### Current state
{player_view_json}

### Available actions
Format: {action_format}
Legal moves: {actions_list}

### Recent history
{history_json}

### Your current strategy
{strategy_text}

Respond with your JSON action now."""

RETRY_TEMPLATE = """Your action was invalid.
Error: {error_message}
Legal moves: {actions_list}
Respond with a corrected JSON action."""


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

def _parse_slm_response(raw: str) -> SLMResponse:
    """Parse SLM JSON response with regex fallback."""
    # Try direct parse
    try:
        data = json.loads(raw.strip())
        return SLMResponse(**data)
    except (json.JSONDecodeError, Exception):
        pass

    # Regex fallback: find JSON block
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            data = json.loads(match.group())
            return SLMResponse(**data)
        except (json.JSONDecodeError, Exception):
            pass

    raise ValueError(f"Could not parse SLM response as JSON: {raw[:200]}")


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    return len(text) // 4


# ---------------------------------------------------------------------------
# AIService
# ---------------------------------------------------------------------------

class AIService:
    """Unified AI service. Builds prompts, calls brain, parses response, handles retries.

    Args:
        brain: Transport layer (Groq, Local, OpenRouter).
        model_name: Model identifier sent to the brain (e.g. "llama-3.1-8b-instant").
        llm_params: Temperature, top_p, max_tokens, ctx_length.
        mode: "single_shot" (2 messages per turn) or "multi_turn" (conversation history).
        history_turns: Number of recent turns to include in single_shot prompts.
    """

    def __init__(
        self,
        brain: AgentBrainServiceInterface,
        model_name: str,
        llm_params: LLMParams,
        mode: str = "single_shot",
        history_turns: int = 3,
    ):
        self.brain = brain
        self.model_name = model_name
        self.llm_params = llm_params
        self.mode = mode
        self.history_turns = history_turns

        # State for single_shot retry
        self._last_messages: list[dict[str, str]] = []

        # State for multi_turn conversation
        self._system_message: dict[str, str] | None = None
        self._conversation: list[dict[str, str]] = []

    # ------------------------------------------------------------------
    # Public API (same signatures as old AIServiceInterface)
    # ------------------------------------------------------------------

    def play_turn(
        self,
        rules: str,
        schema: str,
        player_view: dict[str, Any],
        action_info: ActionInfo,
        strategy: str | None,
        history: list[dict[str, Any]],
        turn_number: int,
        player_number: int,
        player_symbol: str,
        game_name: str,
    ) -> tuple[SLMResponse, int, str | None, str | None]:
        if self.mode == "multi_turn":
            return self._play_turn_multi(
                rules, schema, player_view, action_info, strategy,
                history, turn_number, player_number, player_symbol, game_name,
            )
        return self._play_turn_single(
            rules, schema, player_view, action_info, strategy,
            history, turn_number, player_number, player_symbol, game_name,
        )

    def retry(
        self,
        error: str,
        action_info: ActionInfo,
    ) -> tuple[SLMResponse, int, str | None, str | None]:
        if self.mode == "multi_turn":
            return self._retry_multi(error, action_info)
        return self._retry_single(error, action_info)

    # ------------------------------------------------------------------
    # Single-shot mode
    # ------------------------------------------------------------------

    def _play_turn_single(
        self,
        rules: str,
        schema: str,
        player_view: dict[str, Any],
        action_info: ActionInfo,
        strategy: str | None,
        history: list[dict[str, Any]],
        turn_number: int,
        player_number: int,
        player_symbol: str,
        game_name: str,
    ) -> tuple[SLMResponse, int, str | None, str | None]:
        system_prompt = SYSTEM_TEMPLATE.format(
            game_name=game_name,
            player_number=player_number,
            player_symbol=player_symbol,
            rules_text=rules,
            state_schema=schema,
            action_format=action_info.format,
        )

        recent = history[-self.history_turns:] if history else []
        turn_prompt = TURN_TEMPLATE.format(
            turn_number=turn_number,
            player_view_json=json.dumps(player_view, indent=2),
            action_format=action_info.format,
            actions_list=json.dumps(action_info.actions),
            history_json=json.dumps(recent, indent=2) if recent else "No history yet.",
            strategy_text=strategy or "No strategy set yet.",
        )

        self._last_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": turn_prompt},
        ]

        brain_resp = self.brain.send(
            messages=self._last_messages,
            model=self.model_name,
            temperature=self.llm_params.temperature,
            top_p=self.llm_params.top_p,
            max_tokens=self.llm_params.max_tokens,
        )

        parsed = _parse_slm_response(brain_resp.content)
        return parsed, brain_resp.response_time_ms, turn_prompt, brain_resp.content

    def _retry_single(
        self,
        error: str,
        action_info: ActionInfo,
    ) -> tuple[SLMResponse, int, str | None, str | None]:
        retry_prompt = RETRY_TEMPLATE.format(
            error_message=error,
            actions_list=json.dumps(action_info.actions),
        )
        messages = self._last_messages + [{"role": "user", "content": retry_prompt}]

        brain_resp = self.brain.send(
            messages=messages,
            model=self.model_name,
            temperature=self.llm_params.temperature,
            top_p=self.llm_params.top_p,
            max_tokens=self.llm_params.max_tokens,
        )

        parsed = _parse_slm_response(brain_resp.content)
        return parsed, brain_resp.response_time_ms, retry_prompt, brain_resp.content

    # ------------------------------------------------------------------
    # Multi-turn mode
    # ------------------------------------------------------------------

    def _trim_conversation(self) -> list[dict[str, str]]:
        """Keep recent messages within the context budget."""
        max_ctx = self.llm_params.ctx_length
        reserved = self.llm_params.max_tokens + 100
        budget = max_ctx - reserved

        system_tokens = _estimate_tokens(self._system_message["content"]) if self._system_message else 0
        budget -= system_tokens

        messages = list(self._conversation)
        total = sum(_estimate_tokens(m["content"]) for m in messages)

        while total > budget and len(messages) > 1:
            removed = messages.pop(0)
            total -= _estimate_tokens(removed["content"])
            if messages and messages[0]["role"] == "assistant":
                removed2 = messages.pop(0)
                total -= _estimate_tokens(removed2["content"])

        return messages

    def _build_messages_multi(self) -> list[dict[str, str]]:
        trimmed = self._trim_conversation()
        msgs = []
        if self._system_message:
            msgs.append(self._system_message)
        msgs.extend(trimmed)
        return msgs

    def _play_turn_multi(
        self,
        rules: str,
        schema: str,
        player_view: dict[str, Any],
        action_info: ActionInfo,
        strategy: str | None,
        history: list[dict[str, Any]],
        turn_number: int,
        player_number: int,
        player_symbol: str,
        game_name: str,
    ) -> tuple[SLMResponse, int, str | None, str | None]:
        if self._system_message is None:
            system_prompt = SYSTEM_TEMPLATE.format(
                game_name=game_name,
                player_number=player_number,
                player_symbol=player_symbol,
                rules_text=rules,
                state_schema=schema,
                action_format=action_info.format,
            )
            self._system_message = {"role": "system", "content": system_prompt}

        turn_prompt = TURN_TEMPLATE.format(
            turn_number=turn_number,
            player_view_json=json.dumps(player_view, indent=2),
            action_format=action_info.format,
            actions_list=json.dumps(action_info.actions),
            history_json="(see conversation above)",
            strategy_text=strategy or "No strategy set yet.",
        )

        self._conversation.append({"role": "user", "content": turn_prompt})
        messages = self._build_messages_multi()

        total_tokens = sum(_estimate_tokens(m["content"]) for m in messages)
        logger.debug("MultiTurn turn %d: %d messages, ~%d tokens", turn_number, len(messages), total_tokens)

        brain_resp = self.brain.send(
            messages=messages,
            model=self.model_name,
            temperature=self.llm_params.temperature,
            top_p=self.llm_params.top_p,
            max_tokens=self.llm_params.max_tokens,
        )

        self._conversation.append({"role": "assistant", "content": brain_resp.content})

        parsed = _parse_slm_response(brain_resp.content)
        return parsed, brain_resp.response_time_ms, turn_prompt, brain_resp.content

    def _retry_multi(
        self,
        error: str,
        action_info: ActionInfo,
    ) -> tuple[SLMResponse, int, str | None, str | None]:
        retry_prompt = RETRY_TEMPLATE.format(
            error_message=error,
            actions_list=json.dumps(action_info.actions),
        )

        self._conversation.append({"role": "user", "content": retry_prompt})
        messages = self._build_messages_multi()

        brain_resp = self.brain.send(
            messages=messages,
            model=self.model_name,
            temperature=self.llm_params.temperature,
            top_p=self.llm_params.top_p,
            max_tokens=self.llm_params.max_tokens,
        )

        self._conversation.append({"role": "assistant", "content": brain_resp.content})

        parsed = _parse_slm_response(brain_resp.content)
        return parsed, brain_resp.response_time_ms, retry_prompt, brain_resp.content
