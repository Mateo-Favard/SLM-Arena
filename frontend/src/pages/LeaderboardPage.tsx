import React, { useEffect, useState } from "react";
import { getModels, ModelInfo } from "../api/client";

const BACKENDS = [
  { label: "All", value: undefined },
  { label: "Groq", value: "groq" },
  { label: "Local", value: "local" },
  { label: "OpenRouter", value: "openrouter" },
];

export const LeaderboardPage: React.FC = () => {
  const [activeBackend, setActiveBackend] = useState<string | undefined>(undefined);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getModels(activeBackend)
      .then(setModels)
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, [activeBackend]);

  return (
    <>
      <div className="section-title">Available Models</div>

      <div className="tabs">
        {BACKENDS.map((tab) => (
          <button
            key={tab.label}
            className={`tab ${activeBackend === tab.value ? "active" : ""}`}
            onClick={() => setActiveBackend(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : models.length === 0 ? (
          <div className="empty-state">No models available for this backend.</div>
        ) : (
          <table className="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Model ID</th>
                <th>Backend</th>
                <th>Context</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={m.model_id}>
                  <td className="lb-rank">{i + 1}</td>
                  <td className="lb-model">{m.display_name}</td>
                  <td>
                    <span className="match-game">{m.backend}</span>
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>
                    {m.context_length ? `${(m.context_length / 1024).toFixed(0)}K` : "-"}
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{m.owned_by || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
};
