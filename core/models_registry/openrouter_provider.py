"""Model provider for OpenRouter — queries OpenRouter API for available models."""

from __future__ import annotations

import logging
import os

import httpx

from core.models_registry.registry import ModelInfo

logger = logging.getLogger(__name__)

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"


class OpenRouterModelProvider:

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")

    def list_models(self) -> list[ModelInfo]:
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set, skipping OpenRouter provider")
            return []
        try:
            resp = httpx.get(
                OPENROUTER_MODELS_URL,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json().get("data", [])
            return [
                ModelInfo(
                    model_id=f"openrouter/{m['id']}",
                    display_name=m.get("name", m.get("id", "")),
                    backend="openrouter",
                    context_length=m.get("context_length"),
                    owned_by=None,
                )
                for m in data
            ]
        except Exception as e:
            logger.warning("Failed to fetch OpenRouter models: %s", e)
            return []
