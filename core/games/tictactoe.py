"""TicTacToe GameService implementation for SLM Arena."""

from __future__ import annotations

import copy
from typing import Any

from core.arena.models import ActionInfo, ActionOutcome, GameOverResult, ValidationResult
from core.games.game_server import register_game
from core.games.interface import GameServiceInterface

SYMBOLS = {"player_1": "X", "player_2": "O"}


def _check_winner(grid: list[list[str | None]], size: int) -> tuple[str | None, list[tuple[int, int]] | None]:
    """Return (symbol, winning_cells) or (None, None)."""
    # Rows
    for r in range(size):
        if grid[r][0] is not None and all(grid[r][c] == grid[r][0] for c in range(size)):
            return grid[r][0], [(r, c) for c in range(size)]
    # Columns
    for c in range(size):
        if grid[0][c] is not None and all(grid[r][c] == grid[0][c] for r in range(size)):
            return grid[0][c], [(r, c) for r in range(size)]
    # Diagonal top-left to bottom-right
    if grid[0][0] is not None and all(grid[i][i] == grid[0][0] for i in range(size)):
        return grid[0][0], [(i, i) for i in range(size)]
    # Diagonal top-right to bottom-left
    if grid[0][size - 1] is not None and all(grid[i][size - 1 - i] == grid[0][size - 1] for i in range(size)):
        return grid[0][size - 1], [(i, size - 1 - i) for i in range(size)]
    return None, None


def _empty_cells(grid: list[list[str | None]], size: int) -> list[list[int]]:
    return [[r, c] for r in range(size) for c in range(size) if grid[r][c] is None]


@register_game("tictactoe")
class TicTacToeGameService(GameServiceInterface):

    def init_game(self, config: dict[str, Any], seed: int) -> dict[str, Any]:
        size = config.get("grid_size", 3)
        grid = [[None for _ in range(size)] for _ in range(size)]
        return {
            "grid": grid,
            "grid_size": size,
            "current_player": None,  # set by CoreSlmArena
            "turn_order": ["player_1", "player_2"],
            "turn_index": 0,
            "moves_count": 0,
            "winner_symbol": None,
            "winning_cells": None,
            "game_over": False,
            "player_moves": {"player_1": [], "player_2": []},
        }

    def get_rules_prompt(self, config: dict[str, Any]) -> str:
        size = config.get("grid_size", 3)
        return f"""You are playing Tic Tac Toe on a {size}x{size} grid against another AI model.

## Rules
- Players alternate turns placing their symbol on an empty cell.
- Player 1 plays "X", Player 2 plays "O".
- The first player to align {size} of their symbols in a row, column, or diagonal wins.
- If all cells are filled with no alignment, the game is a draw.
- You can only place your symbol on an empty cell (null in the grid).

## Grid coordinates
- Rows are numbered 0 to {size - 1} (top to bottom).
- Columns are numbered 0 to {size - 1} (left to right).
- Position [0, 0] is the top-left corner.
- Position [{size - 1}, {size - 1}] is the bottom-right corner.

## Win condition
Align {size} of your symbols horizontally, vertically, or diagonally.

## Good example

State received:
```json
{{"grid": [["X", null, null], [null, "O", null], [null, null, null]], "your_symbol": "X", "opponent_symbol": "O", "moves_count": 2}}
```

Good response:
```json
{{"action": {{"position": [0, 2]}}, "reasoning": "Taking the top-right corner to build two possible lines.", "strategy": "Control corners, then force a fork."}}
```
Why it's good: corners create more winning opportunities. The strategy is clear.

## Bad example

State received:
```json
{{"grid": [["X", null, null], [null, "O", null], [null, null, null]], "your_symbol": "X", "opponent_symbol": "O", "moves_count": 2}}
```

Bad response:
```json
{{"action": {{"position": [1, 1]}}}}
```
Why it's bad: cell [1, 1] is already occupied by "O". This is an illegal move."""

    def get_state_schema(self) -> str:
        return """- "grid": 2D array representing the board. Each cell is "X", "O", or null (empty).
- "your_symbol": string, the symbol you play ("X" or "O").
- "opponent_symbol": string, the symbol your opponent plays.
- "moves_count": integer, total number of moves played so far."""

    def get_player_view(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        return {
            "grid": state["grid"],
            "your_symbol": SYMBOLS[player_id],
            "opponent_symbol": SYMBOLS["player_2" if player_id == "player_1" else "player_1"],
            "moves_count": state["moves_count"],
        }

    def get_available_actions(self, state: dict[str, Any], player_id: str) -> ActionInfo:
        size = state["grid_size"]
        empty = _empty_cells(state["grid"], size)
        return ActionInfo(
            format='Respond with {"position": [row, col]} where row and col are integers.',
            actions=empty,
        )

    def validate_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> ValidationResult:
        if "position" not in action:
            return ValidationResult(valid=False, error='Action must have a "position" field as [row, col].')

        pos = action["position"]
        if not isinstance(pos, list) or len(pos) != 2:
            return ValidationResult(valid=False, error='"position" must be an array of 2 integers [row, col].')

        row, col = pos
        size = state["grid_size"]

        if not (isinstance(row, int) and isinstance(col, int)):
            return ValidationResult(valid=False, error="Row and col must be integers.")

        if not (0 <= row < size and 0 <= col < size):
            return ValidationResult(valid=False, error=f"Position [{row}, {col}] is out of bounds. Grid is {size}x{size}.")

        if state["grid"][row][col] is not None:
            return ValidationResult(valid=False, error=f"Cell [{row}, {col}] is already occupied by \"{state['grid'][row][col]}\".")

        return ValidationResult(valid=True)

    def apply_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> tuple[dict[str, Any], ActionOutcome]:
        new_state = copy.deepcopy(state)
        row, col = action["position"]
        symbol = SYMBOLS[player_id]

        new_state["grid"][row][col] = symbol
        new_state["moves_count"] += 1
        new_state["player_moves"][player_id].append([row, col])

        # Check for winner
        winner_sym, winning_cells = _check_winner(new_state["grid"], new_state["grid_size"])
        if winner_sym:
            new_state["winner_symbol"] = winner_sym
            new_state["winning_cells"] = winning_cells
            new_state["game_over"] = True
            return new_state, ActionOutcome(
                result="alignment",
                details={"symbol": symbol, "winning_cells": winning_cells},
            )

        # Check for draw
        if new_state["moves_count"] >= new_state["grid_size"] ** 2:
            new_state["game_over"] = True
            return new_state, ActionOutcome(result="draw", details={})

        # Advance turn
        new_state["turn_index"] = (new_state["turn_index"] + 1) % 2
        return new_state, ActionOutcome(
            result="placed",
            details={"symbol": symbol, "position": [row, col]},
        )

    def get_next_player(self, state: dict[str, Any]) -> str:
        return state["turn_order"][state["turn_index"]]

    def get_max_turns(self, config: dict[str, Any]) -> int:
        size = config.get("grid_size", 3)
        return size * size

    def is_game_over(self, state: dict[str, Any]) -> GameOverResult:
        if not state["game_over"]:
            return GameOverResult(over=False)

        winner_sym = state["winner_symbol"]
        if winner_sym is None:
            return GameOverResult(over=True, winner_id=None, reason="draw")

        winner_id = "player_1" if winner_sym == "X" else "player_2"
        return GameOverResult(over=True, winner_id=winner_id, reason="alignment")

    def get_player_stats(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        moves = state["player_moves"][player_id]
        size = state["grid_size"]
        center = size // 2

        center_plays = sum(1 for r, c in moves if r == center and c == center)
        corner_plays = sum(1 for r, c in moves if (r in (0, size - 1)) and (c in (0, size - 1)))
        edge_plays = len(moves) - center_plays - corner_plays

        return {
            "total_moves": len(moves),
            "center_plays": center_plays,
            "corner_plays": corner_plays,
            "edge_plays": edge_plays,
        }
