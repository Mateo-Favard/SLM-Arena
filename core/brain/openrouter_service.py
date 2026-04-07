"""AgentBrain implementation for OpenRouter cloud API."""

from __future__ import annotations

import logging
import os
import time

from openai import OpenAI

from core.brain.interface import AgentBrainServiceInterface, BrainResponse

logger = logging.getLogger(__name__)


class AgentBrainOpenRouterService(AgentBrainServiceInterface):

    def __init__(self, api_key: str | None = None, timeout: int = 120):
        key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not key:
            raise ValueError("OPENROUTER_API_KEY is not set")
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=key,
            timeout=timeout,
        )

    def send(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 256,
    ) -> BrainResponse:
        start = time.monotonic()
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        content = response.choices[0].message.content or ""
        logger.debug("OpenRouter response (%dms, model=%s): %s", elapsed_ms, model, content[:200])
        return BrainResponse(
            content=content,
            response_time_ms=elapsed_ms,
            model_used=model,
            raw_response=response,
        )

    def health_check(self) -> bool:
        try:
            self.client.models.list()
            return True
        except Exception:
            return False
