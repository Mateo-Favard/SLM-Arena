/** SLM Arena V2 — API client */

const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json();
}

// --- Types ---

export interface ModelInfo {
  model_id: string;
  display_name: string;
  backend: string;
  context_length: number | null;
  owned_by: string | null;
}

export interface GameInfo {
  type: string;
  default_config: Record<string, unknown>;
}

export interface MatchDetail {
  id: string;
  game_type: string;
  status: "queued" | "running" | "completed" | "failed";
  config: Record<string, unknown> | null;
  players: PlayerEntry[] | null;
  replay: Record<string, unknown> | null;
  winner_id: string | null;
  score: unknown;
  video_status: string | null;
  video_path: string | null;
  created_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface PlayerEntry {
  id: string;
  display_name: string;
  display_sub: string;
  avatar_color: string;
  model_id: string;
}

export interface CreateMatchBody {
  game: {
    type: string;
    config?: Record<string, unknown>;
    max_turns?: number;
    seed?: number | null;
  };
  players: {
    id: string;
    display_name: string;
    display_sub: string;
    avatar_color: string;
    model_id: string;
    llm_params?: {
      temperature?: number;
      top_p?: number;
      ctx_length?: number;
      max_tokens?: number;
    };
    ai_service?: {
      type?: string;
      history_turns?: number;
    };
  }[];
  auto_render?: boolean;
}

// --- API calls ---

export async function getGames(): Promise<GameInfo[]> {
  return request("/api/v1/games");
}

export async function getModels(backend?: string): Promise<ModelInfo[]> {
  const params = backend ? `?backend=${backend}` : "";
  return request(`/api/v1/models${params}`);
}

export async function createMatch(body: CreateMatchBody): Promise<{ id: string; status: string }> {
  return request("/api/v1/matches", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getMatches(params?: { game_type?: string; status?: string; limit?: number }): Promise<MatchDetail[]> {
  const query = new URLSearchParams();
  if (params?.game_type) query.set("game_type", params.game_type);
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request(`/api/v1/matches${qs ? `?${qs}` : ""}`);
}

export async function getMatch(matchId: string): Promise<MatchDetail> {
  return request(`/api/v1/matches/${matchId}`);
}

export async function triggerRender(matchId: string): Promise<{ render_job_id: string; status: string; video_path: string | null }> {
  return request(`/api/v1/matches/${matchId}/render`, { method: "POST" });
}

export function videoUrl(matchId: string): string {
  return `/api/v1/matches/${matchId}/video`;
}
