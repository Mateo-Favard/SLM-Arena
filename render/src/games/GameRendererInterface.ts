/**
 * GameRendererInterface — pluggable rendering contract for each game.
 *
 * The Compositor calls these methods blindly; it never touches game-specific
 * state or action formats. Each game implements this interface once.
 */

import { PlayerInfo, PlayerStats, ReplayTurn } from "../types";

/** Props passed to renderBoard */
export interface BoardRenderProps {
  state: Record<string, unknown>;
  prevState: Record<string, unknown>;
  turn: ReplayTurn | null;
  players: [PlayerInfo, PlayerInfo];
  turnStartFrame: number;
}

/** Props passed to renderVictory */
export interface VictoryRenderProps {
  state: Record<string, unknown>;
  winnerId: string | null;
  winnerColor: string;
  startFrame: number;
}

/** Score display for the TopBar */
export interface ScoreDisplay {
  player1: string;
  player2: string;
  label?: string;
}

/** Stat line for the outro scene */
export interface OutroStat {
  label: string;
  value: string;
}

/** SFX event to play during a turn */
export interface SfxEvent {
  sfx: string;
  frameOffset: number;
  volume: number;
}

export interface GameRendererInterface {
  // --- Rendering ---

  /** Render the game board for a given turn state. */
  renderBoard(props: BoardRenderProps): React.ReactElement | null;

  /** Render the victory overlay (glow, highlights, etc). */
  renderVictory(props: VictoryRenderProps): React.ReactElement | null;

  // --- Timing (in frames at 30fps) ---

  /** Frames per turn. Can vary by action if needed. */
  getTurnDuration(turn: ReplayTurn): number;

  /** Frames for the victory animation. */
  getVictoryDuration(): number;

  /** Pause frames between turns (0 = immediate). */
  getPauseBetweenTurns(): number;

  // --- Data for chrome ---

  /** Format score for the TopBar. Called each frame with current state. */
  formatScore(state: Record<string, unknown>): ScoreDisplay;

  /** Format stats for the outro scene (max 4 lines). */
  formatOutroStats(playerStats: PlayerStats[], playerId: string): OutroStat[];

  // --- Audio ---

  /** SFX events to trigger for a turn (max 2). */
  getSfxEvents(turn: ReplayTurn): SfxEvent[];
}
