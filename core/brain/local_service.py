"""AgentBrain implementation for local llama-swap."""

from __future__ import annotations

import logging
import time

from openai import OpenAI

from core.brain.interface import AgentBrainServiceInterface, BrainResponse

logger = logging.getLogger(__name__)


class AgentBrainLocalService(AgentBrainServiceInterface):

    def __init__(self, base_url: str = "http://localhost:8080/v1", timeout: int = 120):
        self.client = OpenAI(
            base_url=base_url,
            api_key="not-needed",
            timeout=timeout,
        )
        self.base_url = base_url

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
        logger.debug("Local response (%dms, model=%s): %s", elapsed_ms, model, content[:200])
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
