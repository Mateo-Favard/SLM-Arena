"""Factory for creating AgentBrain instances from backend name."""

from __future__ import annotations

from core.brain.interface import AgentBrainServiceInterface


def create_brain(backend: str, **kwargs) -> AgentBrainServiceInterface:
    """Create an AgentBrain for the given backend.

    Args:
        backend: One of "local", "groq", "openrouter".
        **kwargs: Forwarded to the brain constructor.
    """
    if backend == "local":
        from core.brain.local_service import AgentBrainLocalService
        return AgentBrainLocalService(**kwargs)
    elif backend == "groq":
        from core.brain.groq_service import AgentBrainGroqService
        return AgentBrainGroqService(**kwargs)
    elif backend == "openrouter":
        from core.brain.openrouter_service import AgentBrainOpenRouterService
        return AgentBrainOpenRouterService(**kwargs)
    else:
        raise ValueError(f"Unknown brain backend: '{backend}'. Must be one of: local, groq, openrouter")
