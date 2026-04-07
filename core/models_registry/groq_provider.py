"""Model provider for Groq — queries Groq API for available models."""

from __future__ import annotations

import logging
import os

import httpx

from core.models_registry.registry import ModelInfo

logger = logging.getLogger(__name__)

GROQ_MODELS_URL = "https://api.groq.com/openai/v1/models"


class GroqModelProvider:

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY", "")

    def list_models(self) -> list[ModelInfo]:
        if not self.api_key:
            logger.warning("GROQ_API_KEY not set, skipping Groq provider")
            return []
        try:
            resp = httpx.get(
                GROQ_MODELS_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json().get("data", [])
            return [
                ModelInfo(
                    model_id=f"groq/{m['id']}",
                    display_name=m.get("id", ""),
                    backend="groq",
                    context_length=m.get("context_window"),
                    owned_by=m.get("owned_by"),
                )
                for m in data
            ]
        except Exception as e:
            logger.warning("Failed to fetch Groq models: %s", e)
            return []
