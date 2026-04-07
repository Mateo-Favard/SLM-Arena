"""Routes game_type strings to the correct GameService instance."""

from __future__ import annotations

from core.games.interface import GameServiceInterface


_REGISTRY: dict[str, type[GameServiceInterface]] = {}


def register_game(game_type: str):
    """Decorator to register a GameService class for a game_type."""
    def decorator(cls: type[GameServiceInterface]):
        _REGISTRY[game_type] = cls
        return cls
    return decorator


def get_game_service(game_type: str) -> GameServiceInterface:
    """Instantiate and return the GameService for the given game_type."""
    if game_type not in _REGISTRY:
        available = ", ".join(_REGISTRY.keys()) or "(none)"
        raise ValueError(f"Unknown game_type '{game_type}'. Available: {available}")
    return _REGISTRY[game_type]()
