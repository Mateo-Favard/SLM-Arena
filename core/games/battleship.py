"""Battleship GameService implementation for SLM Arena."""

from __future__ import annotations

import copy
import random
from typing import Any

from core.arena.models import ActionInfo, ActionOutcome, GameOverResult, ValidationResult
from core.games.game_server import register_game
from core.games.interface import GameServiceInterface


def _col_letter(c: int) -> str:
    return chr(ord("A") + c)


def _parse_target(target: str, grid_size: int) -> tuple[int, int] | None:
    """Parse 'B4' → (row=3, col=1). Returns None if invalid."""
    if not target or len(target) < 2:
        return None
    col_char = target[0].upper()
    row_str = target[1:]
    if not col_char.isalpha() or not row_str.isdigit():
        return None
    col = ord(col_char) - ord("A")
    row = int(row_str) - 1
    if 0 <= row < grid_size and 0 <= col < grid_size:
        return row, col
    return None


def _cell_label(row: int, col: int) -> str:
    """(3, 1) → 'B4'"""
    return f"{_col_letter(col)}{row + 1}"


def _place_ships(rng: random.Random, grid_size: int, ship_sizes: list[int]) -> list[dict]:
    """Randomly place ships on a grid. Returns list of ship dicts."""
    ships = []
    occupied: set[tuple[int, int]] = set()
    ship_names = {5: "carrier", 4: "battleship", 3: "cruiser", 2: "destroyer"}

    for i, size in enumerate(ship_sizes):
        placed = False
        for _ in range(1000):
            horizontal = rng.choice([True, False])
            if horizontal:
                row = rng.randint(0, grid_size - 1)
                col = rng.randint(0, grid_size - size)
                positions = [(row, col + d) for d in range(size)]
            else:
                row = rng.randint(0, grid_size - size)
                col = rng.randint(0, grid_size - 1)
                positions = [(row + d, col) for d in range(size)]

            if not any(p in occupied for p in positions):
                occupied.update(positions)
                name = ship_names.get(size, f"ship_{size}")
                # Disambiguate duplicate sizes
                if any(s["name"] == name for s in ships):
                    name = f"{name}_{i}"
                ships.append({
                    "name": name,
                    "size": size,
                    "positions": [_cell_label(r, c) for r, c in positions],
                    "hits": [],
                    "sunk": False,
                })
                placed = True
                break
        if not placed:
            raise RuntimeError(f"Failed to place ship of size {size} after 1000 attempts")
    return ships


def _check_hit(ships: list[dict], target: str) -> tuple[bool, dict | None]:
    """Check if target hits a ship. Returns (is_hit, ship_if_sunk)."""
    for ship in ships:
        if target in ship["positions"] and target not in ship["hits"]:
            ship["hits"].append(target)
            if set(ship["hits"]) == set(ship["positions"]):
                ship["sunk"] = True
                return True, ship
            return True, None
    return False, None


def _all_sunk(ships: list[dict]) -> bool:
    return all(s["sunk"] for s in ships)


@register_game("battleship")
class BattleshipGameService(GameServiceInterface):

    def init_game(self, config: dict[str, Any], seed: int) -> dict[str, Any]:
        rng = random.Random(seed)
        grid_size = config.get("grid_size", 10)
        ship_sizes = config.get("ships", [5, 4, 3, 3, 2])

        p1_ships = _place_ships(rng, grid_size, ship_sizes)
        p2_ships = _place_ships(rng, grid_size, ship_sizes)

        return {
            "grid_size": grid_size,
            "player_1_ships": p1_ships,
            "player_2_ships": p2_ships,
            "player_1_shots": [],  # list of {"target": "B4", "result": "hit"/"miss"}
            "player_2_shots": [],
            "turn_order": ["player_1", "player_2"],
            "turn_index": 0,
            "game_over": False,
            "winner": None,
            "reason": None,
        }

    def get_rules_prompt(self, config: dict[str, Any]) -> str:
        grid_size = config.get("grid_size", 10)
        ships = config.get("ships", [5, 4, 3, 3, 2])
        return f"""You are playing Battleship on a {grid_size}x{grid_size} grid against another AI model.

## Rules
- Each player has ships placed randomly on their grid. Ships are: {ships} (sizes in cells).
- Players alternate turns firing at a cell on the opponent's grid.
- A shot is either a "hit" (opponent has a ship there) or a "miss" (no ship).
- When all cells of a ship are hit, it is "sunk". You are told when you sink a ship.
- The first player to sink all opponent ships wins.
- You cannot fire at the same cell twice.

## Grid coordinates
- Columns are letters A to {_col_letter(grid_size - 1)} (left to right).
- Rows are numbers 1 to {grid_size} (top to bottom).
- Example: "A1" is top-left, "{_col_letter(grid_size - 1)}{grid_size}" is bottom-right.

## Win condition
Sink all of your opponent's ships before they sink yours.

## Good example

State received:
```json
{{"your_ships": [{{"name": "carrier", "positions": ["A1","A2","A3","A4","A5"], "hit_positions": ["A2"]}}], "your_shots": [{{"target": "C3", "result": "hit"}}, {{"target": "D3", "result": "miss"}}], "opponent_ships_remaining": 4, "opponent_ships_sunk": []}}
```

Good response:
```json
{{"action": {{"target": "C2"}}, "reasoning": "I hit C3 last turn, so I'm probing adjacent cells to find the rest of the ship.", "strategy": "Focus fire around known hits. Track misses to eliminate zones."}}
```
Why it's good: follows up on a hit to find the rest of the ship. Strategy documents the approach.

## Bad example

State received:
```json
{{"your_shots": [{{"target": "C3", "result": "hit"}}], "opponent_ships_remaining": 5, "opponent_ships_sunk": []}}
```

Bad response:
```json
{{"action": {{"target": "C3"}}}}
```
Why it's bad: C3 was already fired at. This wastes a turn and will be rejected as invalid."""

    def get_state_schema(self) -> str:
        return """- "your_ships": array of your ship objects. Each has "name", "positions" (cell labels), "hit_positions" (cells that opponent has hit).
- "your_shots": array of your previous shots. Each has "target" (cell label) and "result" ("hit" or "miss").
- "opponent_ships_remaining": integer, how many of the opponent's ships are still afloat.
- "opponent_ships_sunk": array of sunk ship objects with "name" and "size"."""

    def get_player_view(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        opponent_id = "player_2" if player_id == "player_1" else "player_1"
        my_ships = state[f"{player_id}_ships"]
        opponent_ships = state[f"{opponent_id}_ships"]

        # Player sees their ships with hit positions
        visible_ships = []
        for s in my_ships:
            visible_ships.append({
                "name": s["name"],
                "positions": s["positions"],
                "hit_positions": s["hits"],
                "sunk": s["sunk"],
            })

        # Player sees opponent sunk ships
        sunk_ships = [{"name": s["name"], "size": s["size"]} for s in opponent_ships if s["sunk"]]
        remaining = sum(1 for s in opponent_ships if not s["sunk"])

        return {
            "your_ships": visible_ships,
            "your_shots": state[f"{player_id}_shots"],
            "opponent_ships_remaining": remaining,
            "opponent_ships_sunk": sunk_ships,
        }

    def get_available_actions(self, state: dict[str, Any], player_id: str) -> ActionInfo:
        grid_size = state["grid_size"]
        fired = {s["target"] for s in state[f"{player_id}_shots"]}
        all_cells = [
            _cell_label(r, c)
            for r in range(grid_size)
            for c in range(grid_size)
            if _cell_label(r, c) not in fired
        ]
        return ActionInfo(
            format='Respond with {"target": "B4"} where the target is a cell label (column letter + row number).',
            actions=all_cells,
        )

    def validate_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> ValidationResult:
        if "target" not in action:
            return ValidationResult(valid=False, error='Action must have a "target" field (e.g. "B4").')

        target = str(action["target"]).upper()
        grid_size = state["grid_size"]

        parsed = _parse_target(target, grid_size)
        if parsed is None:
            max_col = _col_letter(grid_size - 1)
            return ValidationResult(
                valid=False,
                error=f'Invalid target "{target}". Use format like "A1" to "{max_col}{grid_size}".',
            )

        fired = {s["target"] for s in state[f"{player_id}_shots"]}
        if target in fired:
            return ValidationResult(valid=False, error=f'Target "{target}" has already been fired at.')

        return ValidationResult(valid=True)

    def apply_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> tuple[dict[str, Any], ActionOutcome]:
        new_state = copy.deepcopy(state)
        target = str(action["target"]).upper()
        opponent_id = "player_2" if player_id == "player_1" else "player_1"

        is_hit, sunk_ship = _check_hit(new_state[f"{opponent_id}_ships"], target)

        result_str = "hit" if is_hit else "miss"
        new_state[f"{player_id}_shots"].append({"target": target, "result": result_str})

        details: dict[str, Any] = {"target": target, "result": result_str}
        if sunk_ship:
            result_str = "sunk"
            details["sunk_ship"] = sunk_ship["name"]
            details["sunk_ship_size"] = sunk_ship["size"]

        # Check if all opponent ships sunk
        if _all_sunk(new_state[f"{opponent_id}_ships"]):
            new_state["game_over"] = True
            new_state["winner"] = player_id
            new_state["reason"] = "all_ships_sunk"

        # Advance turn
        new_state["turn_index"] = (new_state["turn_index"] + 1) % 2

        return new_state, ActionOutcome(result=result_str, details=details)

    def get_next_player(self, state: dict[str, Any]) -> str:
        return state["turn_order"][state["turn_index"]]

    def get_max_turns(self, config: dict[str, Any]) -> int:
        return config.get("max_turns", 200)

    def is_game_over(self, state: dict[str, Any]) -> GameOverResult:
        if not state["game_over"]:
            return GameOverResult(over=False)
        return GameOverResult(
            over=True,
            winner_id=state["winner"],
            reason=state["reason"],
        )

    def get_player_stats(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        opponent_id = "player_2" if player_id == "player_1" else "player_1"
        shots = state[f"{player_id}_shots"]
        hits = sum(1 for s in shots if s["result"] == "hit")
        misses = sum(1 for s in shots if s["result"] == "miss")
        ships_sunk = sum(1 for s in state[f"{opponent_id}_ships"] if s["sunk"])
        ships_lost = sum(1 for s in state[f"{player_id}_ships"] if s["sunk"])
        total = len(shots)

        return {
            "total_shots": total,
            "hits": hits,
            "misses": misses,
            "hit_rate": round(hits / total, 3) if total > 0 else 0,
            "ships_sunk": ships_sunk,
            "ships_lost": ships_lost,
        }
