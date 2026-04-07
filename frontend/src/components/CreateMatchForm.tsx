import React, { useEffect, useState } from "react";
import { createMatch, getModels, getGames, ModelInfo, GameInfo } from "../api/client";

const DEFAULT_GAME_CONFIG: Record<string, Record<string, unknown>> = {
  blackjack: { num_rounds: 5 },
  tictactoe: { grid_size: 3 },
  battleship: { grid_size: 10, ships: [5, 4, 3, 3, 2] },
};

const MAX_TURNS: Record<string, number> = {
  blackjack: 50,
  tictactoe: 9,
  battleship: 200,
};

interface Props {
  onMatchCreated: (matchId: string) => void;
}

export const CreateMatchForm: React.FC<Props> = ({ onMatchCreated }) => {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [gameType, setGameType] = useState("blackjack");
  const [seed, setSeed] = useState(Math.floor(Math.random() * 10000));
  const [p1Model, setP1Model] = useState("");
  const [p1Temp, setP1Temp] = useState(0.7);
  const [p2Model, setP2Model] = useState("");
  const [p2Temp, setP2Temp] = useState(0.7);
  const [autoRender, setAutoRender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load games and models on mount
  useEffect(() => {
    getGames().then(setGames).catch(() => {});
    getModels().then((m) => {
      setModels(m);
      if (m.length >= 2) {
        setP1Model(m[0].model_id);
        setP2Model(m[1].model_id);
      } else if (m.length === 1) {
        setP1Model(m[0].model_id);
        setP2Model(m[0].model_id);
      }
    }).catch(() => {});
  }, []);

  function modelLabel(m: ModelInfo): string {
    const name = m.model_id.split("/").pop() || m.model_id;
    return `${name} (${m.backend})`;
  }

  function modelDisplayName(modelId: string): string {
    const parts = modelId.split("/");
    return parts[parts.length - 1] || modelId;
  }

  function modelDisplaySub(modelId: string): string {
    const m = models.find((x) => x.model_id === modelId);
    return m?.owned_by || m?.backend || "";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p1Model || !p2Model) {
      setError("Select models for both players");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const result = await createMatch({
        game: {
          type: gameType,
          seed,
          max_turns: MAX_TURNS[gameType] ?? 50,
          config: DEFAULT_GAME_CONFIG[gameType] ?? {},
        },
        players: [
          {
            id: "player_1",
            display_name: modelDisplayName(p1Model),
            display_sub: modelDisplaySub(p1Model),
            avatar_color: "#00F0FF",
            model_id: p1Model,
            llm_params: { temperature: p1Temp, top_p: 0.9, max_tokens: 256 },
            ai_service: { type: "single_shot", history_turns: 3 },
          },
          {
            id: "player_2",
            display_name: modelDisplayName(p2Model),
            display_sub: modelDisplaySub(p2Model),
            avatar_color: "#FF3CAC",
            model_id: p2Model,
            llm_params: { temperature: p2Temp, top_p: 0.9, max_tokens: 256 },
            ai_service: { type: "single_shot", history_turns: 3 },
          },
        ],
        auto_render: autoRender,
      });
      onMatchCreated(result.id);
      setSeed(Math.floor(Math.random() * 10000));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="card form-section" onSubmit={handleSubmit}>
      <div className="section-title">Create match</div>

      <div className="form-row">
        <div className="form-group">
          <label>Game</label>
          <select value={gameType} onChange={(e) => setGameType(e.target.value)}>
            {games.length > 0
              ? games.map((g) => <option key={g.type} value={g.type}>{g.type}</option>)
              : ["blackjack", "tictactoe", "battleship"].map((g) => <option key={g} value={g}>{g}</option>)
            }
          </select>
        </div>
        <div className="form-group">
          <label>Seed</label>
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </div>
      </div>

      <div className="form-row">
        <div className="player-config">
          <div className="player-config-title p1">Player 1</div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>Model</label>
            <select value={p1Model} onChange={(e) => setP1Model(e.target.value)}>
              <option value="">Select a model...</option>
              {models.map((m) => (
                <option key={m.model_id} value={m.model_id}>{modelLabel(m)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Temperature</label>
            <input type="number" step="0.1" min="0" max="2" value={p1Temp} onChange={(e) => setP1Temp(Number(e.target.value))} />
          </div>
        </div>

        <div className="player-config">
          <div className="player-config-title p2">Player 2</div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>Model</label>
            <select value={p2Model} onChange={(e) => setP2Model(e.target.value)}>
              <option value="">Select a model...</option>
              {models.map((m) => (
                <option key={m.model_id} value={m.model_id}>{modelLabel(m)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Temperature</label>
            <input type="number" step="0.1" min="0" max="2" value={p2Temp} onChange={(e) => setP2Temp(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
        <input type="checkbox" checked={autoRender} onChange={(e) => setAutoRender(e.target.checked)} />
        Auto-generate video after match
      </label>

      {error && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 8 }}>{error}</div>}

      <button
        className="btn btn-primary"
        type="submit"
        disabled={loading || !p1Model || !p2Model}
        style={{ marginTop: 16, width: "100%" }}
      >
        {loading ? "Launching..." : "Launch match"}
      </button>
    </form>
  );
};
