/** SLM Arena — Replay JSON TypeScript types */

export interface PlayerInfo {
  id: string;
  model_name: string;
  model_params: Record<string, unknown>;
  display_name: string;
  display_sub: string;
  avatar_color: string;
  /** Optional path to model logo in public/models/, e.g. "llama.png" */
  avatar_url?: string;
}

export interface ReplayMetadata {
  game_id: string;
  game_type: string;
  version: string;
  started_at: string;
  ended_at: string;
  seed: number;
  players: [PlayerInfo, PlayerInfo];
  first_player: string;
  initial_state: Record<string, unknown>;
  game_config: Record<string, unknown>;
}

export interface ReplayTurn {
  turn_number: number;
  player_id: string;
  prompt_sent?: string | null;
  raw_response?: string | null;
  response_time_ms: number;
  retries: number;
  skipped: boolean;
  action: Record<string, unknown> | null;
  action_result: "valid" | "invalid" | "skipped";
  state_after: Record<string, unknown>;
  strategy_before?: string | null;
  strategy_after?: string | null;
}

export interface PlayerStats {
  player_id: string;
  total_retries: number;
  total_skips: number;
  avg_response_ms: number;
  strategy_updates: number;
  game_stats: Record<string, unknown>;
}

export interface ReplayResult {
  winner_id: string | null;
  reason: string;
  total_turns: number;
  duration_ms: number;
  player_stats: [PlayerStats, PlayerStats];
}

export interface ReplayJSON {
  metadata: ReplayMetadata;
  turns: ReplayTurn[];
  result: ReplayResult;
}

// --- BlackJack specific ---

export interface Card {
  suit: string;
  value: string;
}

export interface BlackJackRoundResult {
  round: number;
  player_1_hand: Card[];
  player_1_value: number;
  player_1_bust: boolean;
  player_1_payout: number;
  player_2_hand: Card[];
  player_2_value: number;
  player_2_bust: boolean;
  player_2_payout: number;
  dealer_hand: Card[];
  dealer_value: number;
  dealer_bust: boolean;
}

export interface BlackJackState {
  // Current round
  current_round: number;
  num_rounds: number;
  phase: string; // player_1_betting | player_2_betting | player_1_playing | player_2_playing
  // Dealer
  dealer_hand: Card[];
  dealer_final_hand: Card[] | null;
  dealer_final_value: number | null;
  // Per-player current round
  player_1_hand: Card[];
  player_2_hand: Card[];
  player_1_value: number;
  player_2_value: number;
  player_1_standing: boolean;
  player_2_standing: boolean;
  player_1_bust: boolean;
  player_2_bust: boolean;
  player_1_bet: number;
  player_2_bet: number;
  // Bankrolls
  player_1_chips: number;
  player_2_chips: number;
  // History
  rounds_results: BlackJackRoundResult[];
  // Game end
  game_over: boolean;
  winner: string | null;
  reason: string | null;
}

export interface BlackJackAction {
  type: "hit" | "stand" | "bet";
  amount?: number;
}

// --- Game Renderer interface ---

export interface GameRendererProps {
  state: Record<string, unknown>;
  config: Record<string, unknown>;
  players: [PlayerInfo, PlayerInfo];
}

export interface GameTurnProps {
  prevState: Record<string, unknown>;
  action: Record<string, unknown>;
  newState: Record<string, unknown>;
  playerId: string;
  playerColor: string;
}

export interface GameVictoryProps {
  finalState: Record<string, unknown>;
  winnerId: string | null;
  reason: string;
  winnerColor: string;
}
