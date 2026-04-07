# CLAUDE.md — SLM Arena

## What is this project

SLM Arena is a competitive arena where small/medium language models (SLM/MLM) play strategy games against each other. The system runs matches, records replays as JSON, and generates TikTok-format videos (9:16, 1080x1920) from those replays.

Three goals: benchmark LLM reasoning through games, produce viral TikTok content, make it trivially extensible (new game = implement one interface).

## Architecture overview

Two Docker containers + external LLM backend:

- **Core Service** (port 8000) — Python/FastAPI. Orchestrates matches: game logic, prompt building, retry logic, replay export. Connects to external LLM APIs (OpenRouter, Groq, or self-hosted llama-swap).
- **Render Service** (port 3000) — TypeScript/Remotion. Consumes Replay JSON, produces MP4. Never callbacks the Core.
- **LLM Backend** (external) — Any OpenAI-compatible API. Supported: OpenRouter (cloud), Groq (cloud), llama-swap (self-hosted). Not part of this repo — separate infra responsibility.

## Key design principles

- **CoreSlmArena** is a pure orchestrator — zero game logic, just calls GameServiceInterface methods in order.
- **GameServiceInterface** (ABC, 11 methods) is the single extension point for new games. New game = implement the interface, nothing else.
- **Replay JSON** is the sole contract between Core and Render. It is self-sufficient and immutable.
- **Game-agnostic vs game-specific**: `initial_state`, `state_after`, `action`, `game_config`, `game_stats` are opaque blobs. Only the matching GameService and GameRenderer interpret them.
- **Reproducibility**: RNG is seeded (stored in replay + config). Same seed + same config = same game (minus LLM non-determinism).

## Tech stack

| Component | Tech |
|---|---|
| LLM Runtime | External — OpenRouter, Groq, or llama-swap |
| Core Service | Python, FastAPI, Pydantic, openai SDK |
| Render Service | TypeScript, Remotion, Express |
| Database | SQLite (for ELO, later) |
| Infra | Docker Compose on homelab (WSL2, NVIDIA 8GB) |

## Project structure

```
slm-arena/
├── docker-compose.yml
├── config/
│   └── llama-swap.yaml
├── models/                        # GGUF files (gitignored)
├── matches/                       # YAML match configs
├── core/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                    # FastAPI app
│   ├── run_match.py               # CLI entry point
│   ├── arena/
│   │   ├── core_slm_arena.py      # Main orchestrator loop
│   │   └── models.py              # Pydantic schemas
│   ├── ai/
│   │   ├── ai_network_service.py  # HTTP client to llama-swap
│   │   ├── ai_service_interface.py
│   │   ├── single_shot_service.py
│   │   ├── multi_turn_service.py
│   │   └── prompts/
│   ├── games/
│   │   ├── interface.py           # GameServiceInterface ABC
│   │   ├── game_server.py         # Routes to correct GameService
│   │   ├── blackjack.py
│   │   ├── tictactoe.py
│   │   └── battleship.py
│   └── replay/
│       └── exporter.py
├── render/
│   ├── Dockerfile
│   ├── package.json
│   ├── src/
│   │   ├── api/server.ts
│   │   ├── orchestrator/
│   │   ├── chrome/                # Shared: TopBar, VictoryFlash, OutroScene, TTS, SFX
│   │   ├── games/                 # Pluggable renderers per game
│   │   └── theme/                 # colors, typography, timing
│   └── public/sfx/
├── replays/                       # Output JSON
├── logs/                          # Full logs
└── videos/                        # Output MP4
```

## Implementation phases

1. **Phase 1 — MVP BlackJack** (validate full loop): GameServiceInterface ABC → BlackJackGameService → AINetworkService → SingleShotAIService → CoreSlmArena → ReplayExporter → Config loader → CLI → Docker Compose → E2E test
2. **Phase 2 — Render BlackJack**: Remotion setup → Chrome layer → BlackJackRenderer → Compositor → TTS → SFX → E2E replay→MP4
3. **Phase 3 — TicTacToe**: GameService + Renderer
4. **Phase 4 — Battleship**: GameService + Renderer
5. **Phase 5 — Polish**: Multi-turn AI, ELO/leaderboard, REST API, batch matches

## GameServiceInterface — the 11 methods

Every game implements this ABC. The CoreSlmArena calls these blindly:

| Method | Purpose |
|---|---|
| `init_game(config, seed)` | Create initial GameState from seed |
| `get_rules_prompt(config)` | Full rules text for system prompt (with good/bad examples) |
| `get_state_schema()` | Description of each JSON key the SLM receives |
| `get_player_view(state, player_id)` | Filtered state (only what the player can see) |
| `get_available_actions(state, player_id)` | Action format + exhaustive list of legal moves |
| `validate_action(state, player_id, action)` | Check legality, return error message if invalid |
| `apply_action(state, player_id, action)` | Apply validated action, return new state + outcome |
| `get_next_player(state)` | Who plays next (NOT always alternating) |
| `get_max_turns(config)` | Max turns before forced draw |
| `is_game_over(state)` | Check win/draw conditions |
| `get_player_stats(state, player_id)` | Game-specific stats at end |

## SLM interaction contract

### What the SLM receives
- JSON raw game state (explicit keys, no narration)
- Rules + state schema in system prompt
- One good example and one bad example of a move
- Legal actions: format description + complete list
- History of last N turns (default 3, configurable)
- Its strategic scratchpad (if any)

### What the SLM returns
```json
{
  "action": { },        // REQUIRED — game-specific
  "reasoning": "...",   // optional
  "strategy": "..."     // optional — full replace, not append
}
```

### Retry logic
- Max 3 retries per turn
- Feedback: error message + legal actions list — NO suggestion
- 3 failures → skip turn (action_result = "skipped")

### Response parsing
1. Try `json.loads()` directly
2. Fallback: extract JSON block via regex (SLM may add text around it)
3. If both fail → retry

## Scratchpad strategy

- `strategy` field in SLM response is optional
- If present → **full replace** of previous content (not append)
- Injected in next turn's prompt as "Your current strategy"
- Competitive advantage: good models use it, weak ones ignore it
- Creates 3-level benchmark: rule comprehension → data interpretation → strategic persistence

## Prompt structure

### Single-shot (recommended for SLM < 3B)
```
[system] → rules + schema + response format (fixed for whole game)
[user]   → current state + actions + history + strategy (changes each turn)
```

### Multi-turn (recommended for MLM 7B+)
```
[system]    → rules + schema + response format
[user]      → turn 1 state
[assistant] → turn 1 SLM response
...
[user]      → turn N state
```

Choice is per-player in YAML config: `ai_service.type: single_shot | multi_turn`.

## Match config (YAML)

Launched via CLI: `python run_match.py --config match.yaml`

Key fields:
- `game.type` — blackjack | tictactoe | battleship
- `game.seed` — mandatory, no default (reproducibility)
- `game.first_player` — random | player_1 | player_2
- `players[]` — each with model (gguf_path, swap_name), llm_params, ai_service config
- `server` — llama-swap host/port, timeouts
- `output` — replay_dir, logs_dir, log_level, include_prompts_in_replay

Output files: `{date}_{time}_{game}_{model1}_vs_{model2}_seed{seed}.json` and `.log`

## Replay JSON contract

Top-level: `metadata` (players, game_type, seed, initial_state, game_config) + `turns[]` + `result`.

- Chrome layer reads ONLY: metadata.players, game_type, turn numbers, player_ids, response times, retries, skipped, result.
- Chrome NEVER touches: initial_state, state_after, action, game_config, game_stats.
- GameRenderer reads the opaque fields.
- `prompt_sent` and `raw_response` are optional debug fields, never needed by render.

## Video art direction

- Format: 1080x1920 (9:16 TikTok), 30fps, 15-30s
- Background: `#141416`, surface: `#1E1E22`, border: `#2A2A2E`
- Only color accents: player colors (default cyan `#00F0FF` / magenta `#FF3CAC`)
- Font: Inter throughout. Names in player color, score in white, rest in grays.
- No intro — frame 1 is gameplay. TTS announces "X vs Y" over first 2-3 moves.
- 1-1.5s per turn. SFX only, no music.
- Dead zone: bottom 35% of screen (TikTok UI). Nothing there.
- Outro: winning combo flashes in winner color, score updates, fade to black. No "Winner!" text.

## Hardware constraints

- Single NVIDIA GPU, 8GB VRAM
- Models: 0.5B to 8B in Q4_K_M quantization
- One model loaded at a time (sequential swap via llama-swap)
- Swap time: ~2-3s (0.5B) to ~6-10s (7-8B)
- Swap time is logged but excluded from turn response_time_ms

## Commands

```bash
# Run a match
python run_match.py --config matches/some-match.yaml

# Dry-run (validate config only)
python run_match.py --config matches/some-match.yaml --dry-run

# Run and send to render
python run_match.py --config matches/some-match.yaml --render

# Docker
docker compose up -d
```

## Adding a new game — checklist

1. Create `core/games/my_game.py` implementing `GameServiceInterface` (11 methods)
2. Write `get_rules_prompt()` carefully — this is the most impactful piece
3. Write `get_state_schema()` to document JSON keys
4. Register in `GameServer` (routing by `game_type`)
5. Create `render/src/games/MyGameRenderer.tsx` implementing `GameRenderer` interface
6. Register in `RenderOrchestrator` router

Zero changes to CoreSlmArena, AIService, Replay JSON schema, or chrome components.
