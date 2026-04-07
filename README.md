# SLM Arena

Competitive arena where AI models play strategy games against each other. Matches produce replay JSON files, rendered into TikTok-format videos (1080x1920, 30fps) with TTS announcements and sound effects.

## What it does

1. **Two AI models** receive game state as JSON, respond with actions
2. **The orchestrator** validates moves, applies them, handles retries
3. **A replay JSON** captures every turn, action, and reasoning
4. **Remotion renders** the replay into a short-form video with animations, TTS, and SFX

## Games

| Game | Type | Description |
|---|---|---|
| **Blackjack** | Betting + strategy | 2 players vs dealer, N rounds, chips scoring |
| **TicTacToe** | Board placement | Classic grid, first to align wins |
| **Battleship** | Hidden information | Hidden grids, sink all ships |
| **Chicken Game** | Game theory | Simultaneous decisions, risk vs reward |

## Supported LLM backends

Any OpenAI-compatible API works. Built-in support for:

- **OpenRouter** — 200+ models (GPT-4o, Claude, Gemma, Qwen, Grok, Llama, DeepSeek...)
- **Groq** — Fast inference (Llama, Gemma, Mixtral)
- **Local** — Self-hosted llama-swap / llama.cpp

## Quick start

```bash
# 1. Set up environment
cp .env.example .env
# Edit .env with your API key (OPENROUTER_API_KEY or GROQ_API_KEY)

# 2. Start services
docker compose up -d

# 3. Run a match
curl -X POST http://localhost:8000/api/v1/matches \
  -H "Content-Type: application/json" \
  -d '{
    "game": {"type": "blackjack", "config": {"num_rounds": 3}, "seed": 42},
    "players": [
      {"id": "player_1", "display_name": "GPT-4o mini", "display_sub": "OpenAI", "avatar_color": "#10A37F", "model_id": "openrouter/openai/gpt-4o-mini"},
      {"id": "player_2", "display_name": "Qwen 3", "display_sub": "8B", "avatar_color": "#6F5EF6", "model_id": "openrouter/qwen/qwen3-8b"}
    ]
  }'

# 4. Render the replay to video
./render/render-replay.sh replays/<replay_file>.json
```

## Architecture

```
                    ┌──────────────┐
                    │  LLM Backend │  (OpenRouter / Groq / local)
                    │  (external)  │
                    └──────┬───────┘
                           │
┌──────────────────────────┼──────────────────────────┐
│                          │                          │
│  ┌───────────────────────▼───────────────────────┐  │
│  │            Core Service (port 8000)           │  │
│  │  FastAPI · Game logic · Match orchestration   │  │
│  │  Prompt building · Retry logic · ELO tracking │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                          │
│                   replays/*.json                    │
│                          │                          │
│  ┌───────────────────────▼───────────────────────┐  │
│  │          Render Service (port 3000)            │  │
│  │  Remotion · TTS (edge-tts) · SFX · Animations │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                          │
└──────────────────────────┼──────────────────────────┘
                           │
                    videos/*.mp4

```

## Extending

| I want to... | Guide |
|---|---|
| Add a new game | [docs/ADD_GAME.md](docs/ADD_GAME.md) |
| Add a new LLM provider | [docs/ADD_PROVIDER.md](docs/ADD_PROVIDER.md) |
| Understand the architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Set up and run | [docs/SETUP.md](docs/SETUP.md) |

**Adding a game = implement 1 Python interface (12 methods) + 1 TypeScript interface (8 methods). Zero changes to the orchestrator or chrome.**

## Tech stack

| Component | Tech |
|---|---|
| Core Service | Python, FastAPI, Pydantic, openai SDK |
| Render Service | TypeScript, Remotion, Express |
| TTS | edge-tts (Microsoft) |
| Database | SQLite (ELO tracking) |
| Infra | Docker Compose |

## License

MIT
