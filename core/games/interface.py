"""Abstract base class for all game services in SLM Arena."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from core.arena.models import ActionInfo, ActionOutcome, GameOverResult, ValidationResult


class GameServiceInterface(ABC):
    """Every game implements this interface. CoreSlmArena calls these methods blindly."""

    @abstractmethod
    def init_game(self, config: dict[str, Any], seed: int) -> dict[str, Any]:
        """Create initial game state from config and seed.

        Returns the complete internal state (both sides visible).
        Stored in metadata.initial_state of the replay.
        """

    @abstractmethod
    def get_rules_prompt(self, config: dict[str, Any]) -> str:
        """Return full rules text for the SLM system prompt.

        Must include: rules, state transitions, win condition, competitive context,
        one good example, one bad example, NO strategic advice.
        """

    @abstractmethod
    def get_state_schema(self) -> str:
        """Return a textual description of each JSON key the SLM receives."""

    @abstractmethod
    def get_player_view(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        """Filter the full state to only what this player can see.

        The returned dict is serialized to JSON and sent to the SLM.
        """

    @abstractmethod
    def get_available_actions(self, state: dict[str, Any], player_id: str) -> ActionInfo:
        """Return action format description + exhaustive list of legal moves."""

    @abstractmethod
    def validate_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> ValidationResult:
        """Check if a parsed SLM action is legal. Does NOT modify state."""

    @abstractmethod
    def apply_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> tuple[dict[str, Any], ActionOutcome]:
        """Apply a validated action. Returns (new_state, outcome).

        Only called after validate_action returned valid=True.
        """

    def get_auto_action(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        """Return an automatic action if this turn requires no AI (e.g., dealer in blackjack).

        Returns None if the turn should be played by an AI.
        Default: always None (all turns are AI-played).
        """
        return None

    @abstractmethod
    def get_next_player(self, state: dict[str, Any]) -> str:
        """Determine who plays next. Not always alternating."""

    @abstractmethod
    def get_max_turns(self, config: dict[str, Any]) -> int:
        """Return max turns allowed before forced draw."""

    @abstractmethod
    def is_game_over(self, state: dict[str, Any]) -> GameOverResult:
        """Check if the game is over after the last action."""

    @abstractmethod
    def get_player_stats(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        """Compute game-specific stats for a player at end of game."""
