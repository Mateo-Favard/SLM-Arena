"""Unified model registry — aggregates models from all providers with caching and whitelist."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300  # 5 minutes


@dataclass
class ModelInfo:
    model_id: str       # Full ID: "{backend}/{id}" e.g. "groq/llama-3.1-8b-instant"
    display_name: str
    backend: str
    context_length: int | None = None
    owned_by: str | None = None


class ModelProvider(Protocol):
    def list_models(self) -> list[ModelInfo]: ...


class ModelRegistry:

    def __init__(self, providers: list[ModelProvider] | None = None, whitelist: set[str] | None = None):
        self.providers: list[ModelProvider] = providers or []
        self._cache: dict[str, tuple[float, list[ModelInfo]]] = {}

        # Load whitelist from env or parameter
        if whitelist is not None:
            self.whitelist = whitelist
        else:
            raw = os.environ.get("MODELS_WHITELIST", "")
            self.whitelist = {m.strip() for m in raw.split(",") if m.strip()} if raw else None

    def add_provider(self, provider: ModelProvider):
        self.providers.append(provider)

    def list_models(self, backend: str | None = None) -> list[ModelInfo]:
        all_models: list[ModelInfo] = []
        for provider in self.providers:
            provider_key = type(provider).__name__
            cached = self._cache.get(provider_key)
            if cached and (time.time() - cached[0]) < CACHE_TTL_SECONDS:
                models = cached[1]
            else:
                try:
                    models = provider.list_models()
                    self._cache[provider_key] = (time.time(), models)
                except Exception as e:
                    logger.warning("Failed to fetch models from %s: %s", provider_key, e)
                    models = cached[1] if cached else []
            all_models.extend(models)

        # Filter by backend
        if backend:
            all_models = [m for m in all_models if m.backend == backend]

        # Apply whitelist
        if self.whitelist:
            all_models = [m for m in all_models if m.model_id in self.whitelist]

        return all_models
