# Architecture

## Overview

SLM Arena benchmarks LLM reasoning by making models play strategy games against each other. Matches produce replay JSON files, which are rendered into TikTok-format videos (1080x1920, 30fps).

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  LLM Backend │     │   Core Service   │     │  Render Service  │
│  (external)  │◄────│   (port 8000)    │────►│   (port 3000)    │
│              │     │  Python/FastAPI   │     │  TypeScript/     │
│  OpenRouter  │     │                  │     │  Remotion         │
│  Groq        │     │  Game logic      │     │                  │
│  llama-swap  │     │  Match orchestr. │     │  Video rendering │
│              │     │  Replay export   │     │  TTS + SFX       │
└──────────────┘     └──────────────────┘     └──────────────────┘
                              │                        │
                              ▼                        ▼
                     replays/*.json              videos/*.mp4
```

## Two services, one contract

- **Core Service** — orchestrates matches, calls LLM APIs, exports replay JSON.
- **Render Service** — reads replay JSON, produces MP4 video. Never calls back the Core.
- **Replay JSON** is the sole contract between them. It is self-sufficient and immutable.
- **LLM Backend** — any OpenAI-compatible API. Not part of this repo.

## Data flow

```
POST /api/v1/matches
        │
        ▼
   MatchWorker (async queue, sequential processing)
        │
        ▼
   CoreSlmArena.run_match()
        │
        ├── GameService.init_game(config, seed)
        │
        ├── LOOP (each turn):
        │   ├── GameService.get_next_player(state)
        │   ├── GameService.get_auto_action(state, player)  ← auto turns (e.g. dealer)
        │   │   └── if auto: apply directly, no AI call
        │   │
        │   ├── GameService.get_player_view(state, player)  ← fog of war
        │   ├── GameService.get_available_actions(state, player)
        │   ├── AIService.play_turn(...)                    ← calls Brain → LLM API
        │   ├── GameService.validate_action(state, player, action)
        │   │   └── retry up to 3x if invalid
        │   ├── GameService.apply_action(state, player, action)
        │   └── GameService.is_game_over(state)
        │
        ▼
   ReplayJSON saved to replays/
        │
        ▼
   render-replay.sh
        ├── generate-tts.py  → public/tts/announce.mp3
        ├── scan SFX files   → availableSfx list
        └── npx remotion render
            ├── Compositor (timeline builder)
            ├── GameRenderer (game-specific visuals)
            ├── Chrome (TopBar, VictoryFlash, OutroScene)
            ├── Audio (TTS + SFX tracks)
            └── → videos/*.mp4
```

## Separation of concerns

| Layer | Responsibility | Knows about |
|---|---|---|
| **GameService** | Pure game logic (rules, validation, state transitions) | Nothing else |
| **Brain** | LLM transport (send messages, return response) | Nothing else |
| **AIService** | Prompt building, response parsing, retry logic | Brain interface |
| **CoreSlmArena** | Turn orchestration, metrics, replay construction | GameService + AIService interfaces |
| **GameRenderer** | Game-specific video rendering | Game state structure |
| **Compositor** | Timeline, chrome, audio composition | GameRenderer interface |

## Key design principles

- **CoreSlmArena is a pure orchestrator** — zero game logic, just calls GameServiceInterface methods in order.
- **GameServiceInterface** (ABC, 12 methods) is the single extension point for new games.
- **Replay JSON** is the sole Core↔Render contract. Game-specific fields (`state_after`, `action`, `game_stats`) are opaque blobs.
- **Reproducibility**: RNG is seeded. Same seed + same config = same game (minus LLM non-determinism).
- **Auto-actions**: `get_auto_action()` allows deterministic turns (e.g. dealer in blackjack) without AI calls.

## Project structure

```
slm-arena/
├── docker-compose.yml          # core + render services
├── .env                        # API keys (gitignored)
├── core/
│   ├── main.py                 # FastAPI app + endpoints
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── arena/
│   │   ├── core_slm_arena.py   # Main orchestrator loop
│   │   ├── models.py           # Pydantic schemas (ReplayJSON, Turn, etc.)
│   │   ├── api_models.py       # API request/response models
│   │   └── worker.py           # Async match queue
│   ├── ai/
│   │   └── ai_service.py       # Prompt builder + retry logic
│   ├── brain/
│   │   ├── interface.py        # AgentBrainServiceInterface
│   │   ├── factory.py          # create_brain("groq"|"openrouter"|"local")
│   │   ├── groq_service.py
│   │   ├── openrouter_service.py
│   │   └── local_service.py
│   ├── games/
│   │   ├── interface.py        # GameServiceInterface (12 methods)
│   │   ├── game_server.py      # @register_game + get_game_service()
│   │   ├── blackjack.py
│   │   ├── tictactoe.py
│   │   ├── battleship.py
│   │   └── chicken_game.py
│   ├── db/
│   │   └── match_repository.py # SQLite persistence
│   ├── models_registry/        # Model discovery (Groq, OpenRouter, local)
│   ├── render_client/          # HTTP client to render service
│   └── replay/
│       └── exporter.py         # Write replay JSON to disk
├── render/
│   ├── Dockerfile
│   ├── package.json
│   ├── render-replay.sh        # CLI: replay.json → MP4
│   ├── generate-tts.py         # edge-tts announcement
│   ├── src/
│   │   ├── orchestrator/
│   │   │   ├── RenderOrchestrator.tsx  # Remotion composition
│   │   │   └── Compositor.tsx          # Timeline + layer composition
│   │   ├── games/
│   │   │   ├── GameRendererInterface.ts  # Interface (8 methods)
│   │   │   ├── registry.ts               # getRenderer()
│   │   │   ├── BlackJackRenderer.tsx
│   │   │   ├── TicTacToeRenderer.tsx
│   │   │   ├── BattleshipRenderer.tsx
│   │   │   └── ChickenGameRenderer.tsx
│   │   ├── chrome/             # TopBar, VictoryFlash, OutroScene
│   │   ├── theme/              # colors, typography, timing
│   │   └── types.ts            # TypeScript types for ReplayJSON
│   └── public/
│       ├── sfx/                # Sound effects (WAV)
│       ├── tts/                # Generated TTS (gitignored)
│       └── models/             # Model logo images (optional)
├── frontend/                   # React web UI
├── replays/                    # Output JSON (gitignored)
├── videos/                     # Output MP4 (gitignored)
├── data/                       # SQLite DB (gitignored)
└── docs/                       # This documentation
```
