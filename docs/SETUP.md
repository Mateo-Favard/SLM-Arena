# Setup & Commands

## Prerequisites

- Docker + Docker Compose
- Node.js 20+ (for local render development)
- Python 3.12+ (for local core development)
- An LLM API key (OpenRouter or Groq)

## Environment

Create `.env` at the project root:

```env
OPENROUTER_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...
```

At least one key is required. OpenRouter gives access to 200+ models.

## Quick start with Docker

```bash
# Start core + render services
docker compose up -d

# Check health
curl http://localhost:8000/health

# View logs
docker compose logs -f core
```

## Run a match

```bash
curl -X POST http://localhost:8000/api/v1/matches \
  -H "Content-Type: application/json" \
  -d '{
    "game": {
      "type": "blackjack",
      "config": {"num_rounds": 3, "num_decks": 1, "starting_chips": 250},
      "seed": 42
    },
    "players": [
      {
        "id": "player_1",
        "display_name": "GPT-4o mini",
        "display_sub": "OpenAI",
        "avatar_color": "#10A37F",
        "model_id": "openrouter/openai/gpt-4o-mini",
        "llm_params": {"temperature": 0.6, "max_tokens": 256, "ctx_length": 4096},
        "ai_service": {"type": "single_shot"}
      },
      {
        "id": "player_2",
        "display_name": "Qwen 3",
        "display_sub": "8B",
        "avatar_color": "#6F5EF6",
        "model_id": "openrouter/qwen/qwen3-8b",
        "llm_params": {"temperature": 0.7, "max_tokens": 256, "ctx_length": 4096},
        "ai_service": {"type": "single_shot"}
      }
    ]
  }'
```

Returns `{"id": "...", "status": "queued"}`. The match runs in the background.

## Check match status

```bash
# Poll until status is "completed"
curl http://localhost:8000/api/v1/matches/{match_id}

# List all matches
curl http://localhost:8000/api/v1/matches
```

## Render a replay to video

The replay JSON is saved automatically in `replays/`. To render it:

```bash
# Uses TTS (edge-tts) + SFX + Remotion
./render/render-replay.sh replays/my_replay.json

# Custom output path
./render/render-replay.sh replays/my_replay.json videos/custom_name.mp4
```

Output goes to `videos/` by default.

### Local render setup (without Docker)

```bash
cd render
npm install
pip install edge-tts  # for TTS generation

# Render
./render-replay.sh ../replays/my_replay.json
```

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/api/v1/games` | List available games |
| GET | `/api/v1/models` | List available LLM models |
| GET | `/api/v1/models?backend=openrouter` | Filter by backend |
| POST | `/api/v1/matches` | Create a match |
| GET | `/api/v1/matches` | List matches |
| GET | `/api/v1/matches/{id}` | Match details + replay |
| GET | `/api/v1/matches/{id}/video` | Download video |
| POST | `/api/v1/matches/{id}/render` | Trigger render |

## Available games

- `blackjack` — 2 players vs dealer, N rounds, chips-based scoring
- `tictactoe` — classic grid, first to align wins
- `battleship` — hidden grids, sink all ships
- `chicken_game` — simultaneous decisions, game theory

## AI service modes

Each player can use a different mode:

- `single_shot` — fresh prompt each turn with last N turns as history. Lighter, works well for smaller models.
- `multi_turn` — full conversation history. Better for strategy continuity, requires more context.

Set via `ai_service.type` in the player config.

## Useful commands

```bash
# Rebuild after code changes
docker compose build core
docker compose up -d core

# View core logs
docker compose logs -f core

# Stop everything
docker compose down

# List available models
curl http://localhost:8000/api/v1/models | python3 -m json.tool
```

## Adding model logos

Place PNG images in `render/public/models/` (e.g., `llama.png`, `qwen.png`). Then set `avatar_url` in the player config:

```json
{
  "avatar_url": "llama.png"
}
```

Without `avatar_url`, the TopBar shows the first letter of `display_name` as fallback.

## SFX files

Sound effects go in `render/public/sfx/{game_type}/`. The render script auto-detects available files. Missing files are silently skipped.

```
render/public/sfx/
├── universal/          # victory.wav, draw.wav, round_change.wav
├── blackjack/          # card_deal.wav, cash.wav, stand.wav, bust.wav
├── tictactoe/
└── ...
```
