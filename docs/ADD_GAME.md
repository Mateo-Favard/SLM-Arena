# Adding a new game

Adding a game requires two parts: the **game service** (Python, game logic) and the **game renderer** (TypeScript/React, video rendering). Zero changes to the orchestrator, AI service, or chrome components.

## Part 1 — Game Service (Python)

### Step 1: Create the game file

Create `core/games/my_game.py` and implement `GameServiceInterface`.

```python
from core.arena.models import ActionInfo, ActionOutcome, GameOverResult, ValidationResult
from core.games.game_server import register_game
from core.games.interface import GameServiceInterface

@register_game("my_game")
class MyGameService(GameServiceInterface):
    ...
```

The `@register_game("my_game")` decorator auto-registers your game. The string is the `game_type` used in API requests and replay JSON.

### Step 2: Implement the 12 methods

#### `init_game(config, seed) -> dict`

Create the initial game state. Use the seed for reproducible RNG.

```python
def init_game(self, config, seed):
    rng = random.Random(seed)
    return {
        "board": [...],
        "current_player": "player_1",
        "scores": {"player_1": 0, "player_2": 0},
        "game_over": False,
        "winner": None,
        "reason": None,
    }
```

**BlackJack example**: Pre-generates all rounds with seeded RNG, deals initial hands, sets up chips/bets/phases.

#### `get_rules_prompt(config) -> str`

Full rules text injected into the LLM's system prompt. This is the most impactful method — a good prompt makes models play well.

Include:
- Complete rules
- Win condition
- One good example move (with state + response)
- One bad example move (explaining why it's bad)
- NO strategic advice

#### `get_state_schema() -> str`

Textual description of each JSON key the LLM receives. Helps the model understand the state format.

#### `get_player_view(state, player_id) -> dict`

Filter the full state to only what this player can see. This is your fog of war.

**BlackJack example**: During betting phase, hides cards. During playing phase, shows player's hand but only dealer's face-up card.

#### `get_available_actions(state, player_id) -> ActionInfo`

Return the action format description and an exhaustive list of legal moves.

```python
return ActionInfo(
    format='{"type": "hit"} or {"type": "stand"}',
    actions=["hit", "stand"],
)
```

Return `ActionInfo(format="", actions=[])` if it's not this player's turn.

#### `validate_action(state, player_id, action) -> ValidationResult`

Check if a parsed action is legal. Does NOT modify state. Return clear error messages — these are sent back to the LLM for retry.

```python
if action["type"] not in ("hit", "stand"):
    return ValidationResult(valid=False, error='Must be "hit" or "stand".')
return ValidationResult(valid=True)
```

#### `apply_action(state, player_id, action) -> (new_state, ActionOutcome)`

Apply a validated action. Returns a deep copy of the new state and an outcome description.

```python
import copy
new_state = copy.deepcopy(state)
# ... modify new_state ...
return new_state, ActionOutcome(result="hit", details={"card": card})
```

Always `copy.deepcopy(state)` — never mutate the input.

#### `get_auto_action(state, player_id) -> dict | None`

Return an automatic action if this turn requires no AI (e.g., dealer in blackjack). Return `None` if the turn should be played by an AI. Default implementation returns `None`.

**BlackJack example**: Dealer automatically hits on <17 and stands on >=17.

```python
def get_auto_action(self, state, player_id):
    if player_id != "dealer" or state["phase"] != "dealer_playing":
        return None
    if hand_value(state["dealer_hand"]) < 17:
        return {"type": "hit"}
    return {"type": "stand"}
```

When `get_auto_action` returns a dict, the orchestrator applies it directly without calling the AI service. The turn is logged in the replay with `player_id` set to whatever `get_next_player` returned (e.g., `"dealer"`).

#### `get_next_player(state) -> str`

Who plays next. Usually `"player_1"` or `"player_2"`, but can be `"dealer"` or any string for auto-action turns.

**BlackJack example**: Returns based on phase — `"player_1"` during player_1_betting/playing, `"player_2"` during player_2 phases, `"dealer"` during dealer_playing.

#### `get_max_turns(config) -> int`

Maximum turns before forced draw. Be generous — this is a safety net.

#### `is_game_over(state) -> GameOverResult`

Check win/draw/loss conditions.

```python
if not state["game_over"]:
    return GameOverResult(over=False)
return GameOverResult(over=True, winner_id=state["winner"], reason=state["reason"])
```

#### `get_player_stats(state, player_id) -> dict`

Game-specific stats for the outro screen. Return a flat dict — keys become labels.

```python
return {
    "final_chips": state[f"{player_id}_chips"],
    "rounds_won": rounds_won,
    "busts": total_busts,
}
```

### Step 3: Register the import

In `core/main.py`, add:

```python
import core.games.my_game  # noqa: F401
```

This forces the `@register_game` decorator to run at startup.

### State sanitization

The orchestrator calls `_sanitize_state(state)` before storing in the replay. By default, it excludes: `deck`, `config`, `turn_order`, `turn_index`, `draw_pile`, `rounds_deals`. If your game has internal fields that shouldn't be in the replay, add them to the exclude set in `core/arena/core_slm_arena.py`.

---

## Part 2 — Game Renderer (TypeScript)

### Step 1: Create the renderer file

Create `render/src/games/MyGameRenderer.tsx` implementing `GameRendererInterface`.

```typescript
import type { GameRendererInterface } from "./GameRendererInterface";

export const myGameRenderer: GameRendererInterface = {
    renderBoard(props) { ... },
    renderVictory(props) { ... },
    getTurnDuration(turn) { ... },
    getVictoryDuration() { ... },
    getPauseBetweenTurns() { ... },
    formatScore(state) { ... },
    formatOutroStats(playerStats, playerId) { ... },
    getSfxEvents(turn) { ... },
};
```

### Step 2: Implement the 8 methods

#### `renderBoard({ state, prevState, turn, players, turnStartFrame }) -> ReactElement`

Render the game board for the current frame. This is called every frame.

- `state` — current turn's `state_after` (opaque `Record<string, unknown>`, cast to your game's type)
- `prevState` — previous turn's state (for detecting changes and animating)
- `turn` — current `ReplayTurn` (player_id, action, skipped, etc.)
- `players` — `[PlayerInfo, PlayerInfo]` with display_name, avatar_color, etc.
- `turnStartFrame` — frame number where this turn began (for animations)

Use Remotion hooks: `useCurrentFrame()`, `useVideoConfig()`, `spring()`, `interpolate()`.

**BlackJack example**: Renders a `TableSurface` container with `DealerZone` (top) and two `PlayerZone` (bottom, side by side). Detects new cards by comparing `prevState.player_X_hand.length` vs `state.player_X_hand.length` and animates them with spring scale.

#### `renderVictory({ state, winnerId, winnerColor, startFrame }) -> ReactElement`

Victory overlay (glow, highlights). Rendered on top of the board during the victory phase.

#### `getTurnDuration(turn) -> number`

Frames per turn (at 30fps). Return 35 for ~1.17s per turn. Can vary by action type.

#### `getVictoryDuration() -> number`

Frames for the victory animation. Typically 15 (0.5s).

#### `getPauseBetweenTurns() -> number`

Pause frames between turns. Usually 0.

#### `formatScore(state) -> ScoreDisplay`

Extract score for the TopBar chrome.

```typescript
return {
    player1: String(state.player_1_chips),
    player2: String(state.player_2_chips),
    label: "chips",  // optional, shown in outro
};
```

#### `formatOutroStats(playerStats, playerId) -> OutroStat[]`

Stats for the outro screen (max 4 lines).

```typescript
return [
    { label: "Final chips", value: "420" },
    { label: "Rounds won", value: "3" },
];
```

#### `getSfxEvents(turn) -> SfxEvent[]`

Sound effects to trigger for this turn. Max 2 events. Files must exist in `render/public/sfx/`.

```typescript
if (action.type === "hit") {
    return [{ sfx: "my_game/hit.wav", frameOffset: 0, volume: 0.5 }];
}
```

Use `frameOffset` to stagger sounds (e.g., card sound then bust sound 4 frames later).

### Step 3: Add to registry

In `render/src/games/registry.ts`:

```typescript
import { myGameRenderer } from "./MyGameRenderer";

const RENDERERS: Record<string, GameRendererInterface> = {
    blackjack: blackjackRenderer,
    tictactoe: tictactoeRenderer,
    // ...
    my_game: myGameRenderer,  // <-- add this
};
```

### Step 4: Add TypeScript types

In `render/src/types.ts`, add your game-specific state type:

```typescript
export interface MyGameState {
    board: string[][];
    scores: { player_1: number; player_2: number };
    // ...
}
```

### Step 5: Add SFX files

Place your sound effects in `render/public/sfx/my_game/`. WAV or MP3, under 1 second, 44.1kHz.

---

## Checklist

- [ ] `core/games/my_game.py` — 12 methods implemented
- [ ] `@register_game("my_game")` decorator
- [ ] Import in `core/main.py`
- [ ] `render/src/games/MyGameRenderer.tsx` — 8 methods implemented
- [ ] Added to `render/src/games/registry.ts`
- [ ] TypeScript types in `render/src/types.ts`
- [ ] SFX files in `render/public/sfx/my_game/`
- [ ] Test: run a match via API, render the replay, check the video

Zero changes needed to: CoreSlmArena, AIService, Compositor, TopBar, VictoryFlash, OutroScene, or any chrome component.
