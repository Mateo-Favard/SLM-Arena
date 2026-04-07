"""Model provider for local llama-swap — queries llama-swap API for loaded models."""

from __future__ import annotations

import logging

import httpx

from core.models_registry.registry import ModelInfo

logger = logging.getLogger(__name__)


class LocalModelProvider:

    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url

    def list_models(self) -> list[ModelInfo]:
        try:
            resp = httpx.get(f"{self.base_url}/v1/models", timeout=5)
            resp.raise_for_status()
            data = resp.json().get("data", [])
            return [
                ModelInfo(
                    model_id=f"local/{m['id']}",
                    display_name=m.get("id", ""),
                    backend="local",
                    context_length=None,
                    owned_by=m.get("owned_by"),
                )
                for m in data
            ]
        except Exception as e:
            logger.debug("Local llama-swap unavailable: %s", e)
            return []
