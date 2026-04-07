import React, { useEffect, useState } from "react";
import {
  getMatches,
  getMatch,
  triggerRender,
  videoUrl,
  MatchDetail,
} from "../api/client";

interface Props {
  trackedJobs: string[];
  refreshTrigger: number;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function playerName(match: MatchDetail, playerId: string): string {
  const p = match.players?.find((x) => x.id === playerId);
  return p ? `${p.display_name} ${p.display_sub}`.trim() : playerId;
}

function playerColor(match: MatchDetail, playerId: string): string {
  const p = match.players?.find((x) => x.id === playerId);
  return p?.avatar_color || "var(--text)";
}

// --- Video button ---

const VideoButton: React.FC<{ match: MatchDetail }> = ({ match }) => {
  const [renderLoading, setRenderLoading] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(match.video_status);

  if (match.status !== "completed") return null;

  // Video ready
  if (renderStatus === "completed" || (match.video_status === "completed" && match.video_path)) {
    return (
      <a href={videoUrl(match.id)} className="btn btn-primary btn-small" download>
        Download MP4
      </a>
    );
  }

  // Rendering in progress
  if (renderStatus === "rendering") {
    return <span className="badge badge-running">Rendering...</span>;
  }

  const handleGenerate = async () => {
    setRenderLoading(true);
    try {
      await triggerRender(match.id);
      setRenderStatus("rendering");
    } catch {}
    setRenderLoading(false);
  };

  return (
    <button className="btn btn-ghost btn-small" onClick={handleGenerate} disabled={renderLoading}>
      {renderLoading ? "..." : "Generate video"}
    </button>
  );
};

// --- Main list ---

export const MatchList: React.FC<Props> = ({ trackedJobs, refreshTrigger }) => {
  const [history, setHistory] = useState<MatchDetail[]>([]);
  const [liveJobs, setLiveJobs] = useState<Map<string, MatchDetail>>(new Map());
  const [search, setSearch] = useState("");

  // Fetch match history
  useEffect(() => {
    getMatches({ limit: 50 }).then(setHistory).catch(() => {});
  }, [refreshTrigger]);

  // Poll live jobs
  useEffect(() => {
    if (trackedJobs.length === 0) return;

    const poll = async () => {
      const updates = new Map(liveJobs);
      for (const matchId of trackedJobs) {
        try {
          const detail = await getMatch(matchId);
          updates.set(matchId, detail);
        } catch {}
      }
      setLiveJobs(updates);
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [trackedJobs, refreshTrigger]);

  // Refresh history when a job completes
  useEffect(() => {
    const hasCompleted = Array.from(liveJobs.values()).some(
      (j) => j.status === "completed" || j.status === "failed"
    );
    if (hasCompleted) {
      getMatches({ limit: 50 }).then(setHistory).catch(() => {});
    }
  }, [liveJobs]);

  const filteredHistory = history.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const names = m.players?.map((p) => p.display_name.toLowerCase()).join(" ") || "";
    return names.includes(q) || m.game_type.toLowerCase().includes(q);
  });

  // Exclude live jobs from history to avoid duplicates
  const liveIds = new Set(trackedJobs);
  const displayHistory = filteredHistory.filter((m) => !liveIds.has(m.id));

  return (
    <div>
      <div className="section-title">Matches</div>

      <input
        className="search-bar"
        placeholder="Search by model or game..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Live jobs */}
      {Array.from(liveJobs.entries()).map(([id, match]) => (
        <div className="match-item" key={id}>
          <div className="match-players">
            {match.players ? (
              <>
                <span style={{ color: playerColor(match, "player_1"), fontWeight: 600, fontSize: 14 }}>
                  {playerName(match, "player_1")}
                </span>
                <span className="vs">vs</span>
                <span style={{ color: playerColor(match, "player_2"), fontWeight: 600, fontSize: 14 }}>
                  {playerName(match, "player_2")}
                </span>
              </>
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Match {id.slice(0, 8)}...
              </span>
            )}
          </div>
          <div className="match-meta">
            <span className="match-game">{match.game_type}</span>
            <StatusBadge status={match.status} />
            {match.status === "completed" && match.winner_id && (
              <span style={{ fontSize: 12, color: "var(--green)" }}>
                {playerName(match, match.winner_id)} wins
              </span>
            )}
            <VideoButton match={match} />
          </div>
        </div>
      ))}

      {/* History */}
      {displayHistory.length === 0 && trackedJobs.length === 0 && (
        <div className="empty-state">No matches yet. Launch one above.</div>
      )}

      {displayHistory.map((m) => (
        <div className="match-item" key={m.id}>
          <div className="match-players">
            <span style={{ color: playerColor(m, "player_1"), fontWeight: 600, fontSize: 14 }}>
              {playerName(m, "player_1")}
            </span>
            <span className="vs">vs</span>
            <span style={{ color: playerColor(m, "player_2"), fontWeight: 600, fontSize: 14 }}>
              {playerName(m, "player_2")}
            </span>
          </div>
          <div className="match-meta">
            <span className="match-game">{m.game_type}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {formatDuration(m.duration_ms)}
            </span>
            <StatusBadge status={m.status} />
            {m.winner_id ? (
              <span style={{ fontSize: 12, color: "var(--green)" }}>
                {playerName(m, m.winner_id)} wins
              </span>
            ) : m.status === "completed" ? (
              <span style={{ fontSize: 12, color: "var(--yellow)" }}>Draw</span>
            ) : null}
            <VideoButton match={m} />
          </div>
        </div>
      ))}
    </div>
  );
};
