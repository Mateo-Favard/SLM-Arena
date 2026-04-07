"""AgentBrain — pure transport layer for LLM backends."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class BrainResponse:
    content: str
    response_time_ms: int
    model_used: str
    raw_response: Any


class AgentBrainServiceInterface(ABC):

    @abstractmethod
    def send(
        self,
        messages: list[dict[str, str]],
        model: str,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 256,
    ) -> BrainResponse:
        """Send messages to the LLM backend. Returns the raw response."""
        ...

    @abstractmethod
    def health_check(self) -> bool:
        """Check if the backend is reachable."""
        ...
