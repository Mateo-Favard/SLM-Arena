# SLM Arena — Avancement du projet

## Phase 1 — MVP BlackJack (valider la boucle complète)

### 1.1 Fondations Core
- [x] Structure du projet Python (dossiers, `__init__.py`, requirements.txt)
- [x] Modèles Pydantic (`GameState`, `Turn`, `Player`, `ActionInfo`, `ValidationResult`, `ActionOutcome`, `GameOverResult`, `ReplayJSON`)
- [x] `GameServiceInterface` ABC (les 11 méthodes)
- [x] `GameServer` (routing par `game_type`)

### 1.2 BlackJack GameService
- [x] `BlackJackGameService` — `init_game()` (deck, distribution, seed)
- [x] `BlackJackGameService` — `get_rules_prompt()` (règles, bon/mauvais exemple)
- [x] `BlackJackGameService` — `get_state_schema()`
- [x] `BlackJackGameService` — `get_player_view()` (filtrage carte cachée)
- [x] `BlackJackGameService` — `get_available_actions()` (hit/stand)
- [x] `BlackJackGameService` — `validate_action()`
- [x] `BlackJackGameService` — `apply_action()` (tirage carte, bust, blackjack)
- [x] `BlackJackGameService` — `get_next_player()` (même joueur tant qu'il hit)
- [x] `BlackJackGameService` — `get_max_turns()`
- [x] `BlackJackGameService` — `is_game_over()`
- [x] `BlackJackGameService` — `get_player_stats()`

### 1.3 AI Services
- [x] `AIServiceInterface` ABC (play_turn, retry)
- [x] `AINetworkService` (client HTTP OpenAI vers llama-swap)
- [x] `SingleShotAIService` (prompt builder : system + user, parsing JSON, regex fallback)
- [x] Retry logic (max 3, feedback erreur + actions légales, skip après 3 échecs)

### 1.4 Orchestrateur
- [x] `CoreSlmArena` — boucle de jeu complète (pseudo-code → vrai code)
- [x] Gestion du scratchpad stratégique (injection, remplacement)
- [x] Gestion historique N derniers tours
- [x] Détection fin de partie + max_turns → draw

### 1.5 Config & CLI
- [x] Loader YAML (parsing, validation, erreurs explicites)
- [x] Résolution `first_player: random` via seed
- [x] CLI `run_match.py` (`--config`, `--dry-run`, `--render`)
- [ ] Vérification connectivité llama-swap au lancement
- [x] Création auto des dossiers output

### 1.6 Replay & Logs
- [x] `ReplayExporter` — construction du JSON complet (metadata, turns, result, player_stats)
- [x] Nommage auto : `{date}_{time}_{game}_{model1}_vs_{model2}_seed{seed}.json`
- [x] Logger structuré (prompts, réponses brutes, erreurs HTTP, temps de swap)

### 1.7 Infrastructure
- [x] Dockerfile Core Service
- [x] Config llama-swap.yaml
- [x] docker-compose.yml (llama-swap + core)
- [x] .gitignore (models/, replays/, logs/, videos/)

### 1.8 Test end-to-end
- [x] Imports + logique BlackJack testés en standalone (seed 42, hit/stand/game_over OK)
- [ ] Match complet CLI avec llama-swap (nécessite GPU + modèles GGUF)

---

## Phase 2 — Render BlackJack

### 2.1 Setup Render Service
- [x] Projet TypeScript + Remotion + Express (package.json, tsconfig, remotion.config)
- [x] Dockerfile Render Service
- [x] Endpoint POST `/render` + GET `/status/{job_id}` + GET `/health`
- [x] Types TypeScript pour le Replay JSON (+ BlackJack-specific + GameRenderer interfaces)

### 2.2 Chrome Layer (shared)
- [x] `TopBar` (logos, noms en couleur, score, sous-titre taille modèle)
- [x] `OutroScene` (score final, fade to black, "X wins" / "Draw")
- [x] `VictoryFlash` (flash couleur du gagnant, ease-out)
- [x] `TtsOverlay` (texte "X vs Y" avec fade in/out sur les premiers tours)
- [x] `SfxManager` (click, buzz, whoosh, chime — placés par turn)

### 2.3 BlackJack Renderer
- [x] `BlackJackBoard` — deux mains (top/bottom), cartes avec suit/value, hand value, BUST/STAND labels
- [x] `BlackJackVictory` — glow autour de la main gagnante
- [x] Animation cartes (spring scale sur nouvelle carte, highlight surface)

### 2.4 Assemblage
- [x] `RenderOrchestrator` (Remotion Composition avec calculateMetadata dynamique)
- [x] `Compositor` (timeline builder + chrome + game + TTS + victory + outro)
- [x] Theme (colors.ts, typography.ts, timing.ts)
- [x] docker-compose.yml mis à jour avec le service render

### 2.5 Test end-to-end
- [ ] `npm install` + `npx remotion render` avec un replay JSON de test → MP4

---

## Phase 3 — TicTacToe

### 3.1 Core
- [x] `TicTacToeGameService` (11 méthodes : init, rules, schema, view, actions, validate, apply, next_player, max_turns, is_game_over, stats)
- [x] Test standalone : partie complète (diagonal win), validation invalide (occupied, out of bounds), stats
- [x] Config match YAML d'exemple (`qwen-vs-phi-tictactoe.yaml`)

### 3.2 Render
- [x] `TicTacToeBoard` (grille dynamique, cells avec spring animation, highlight new move)
- [x] `TicTacToeVictory` (glow sur les cellules gagnantes)
- [x] Compositor refactoré : routing game-agnostic par `game_type` (GameLayer + GameVictoryLayer)

### 3.3 Validation
- [x] BlackJack non-régression OK
- [x] Les deux jeux enregistrés dans le registry : `['blackjack', 'tictactoe']`

---

## Phase 4 — Battleship

### 4.1 Core
- [x] `BattleshipGameService` (11 méthodes : placement seedé, info asymétrique, hit/miss/sunk, all_ships_sunk)
- [x] Test standalone : placement 5 bateaux, tirs hit, validation duplicat/hors bornes, stats
- [x] Config match YAML d'exemple (`qwen-vs-mistral-battleship.yaml`)

### 4.2 Render
- [x] `BattleshipBoard` (2 grilles 10×10, headers A-J/1-10, hit ×/miss dot, spring anim last shot)
- [x] `BattleshipVictory` (glow sur la grille gagnante)
- [x] Compositor routé pour battleship (GameLayer + GameVictoryLayer)

### 4.3 Validation
- [x] Non-régression : 3 jeux enregistrés `['battleship', 'blackjack', 'tictactoe']`
- [x] BlackJack + TicTacToe init OK

---

## Phase 5 — Polish

### 5.1 AI avancé
- [x] `MultiTurnAIService` (historique conversationnel complet, user/assistant pairs)
- [x] Troncature auto du contexte (supprime les plus vieux tours par paires quand on dépasse ctx_length)
- [x] Estimation tokens (~4 chars/token)
- [x] `run_match.py` route vers SingleShot ou MultiTurn selon `ai_service.type` dans la config

### 5.2 Classement
- [x] SQLite — tables `models`, `elo_per_game`, `match_results`
- [x] Calcul ELO (K=32) après chaque match — global + par jeu
- [x] Leaderboard global et par game_type
- [x] Historique des matchs avec ELO before/after

### 5.3 API & Batch
- [x] API REST FastAPI (`POST /match`, `GET /match/{id}`, `GET /leaderboard`, `GET /matches`, `GET /queue`, `GET /health`)
- [x] Lancement depuis config_path YAML ou config_inline JSON
- [x] File d'attente séquentielle (thread worker, deque, 1 match à la fois)
- [x] ELO auto-enregistré après chaque match via l'API

---

## Légende

- [ ] À faire
- [x] Terminé
