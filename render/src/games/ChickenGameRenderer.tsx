import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { PlayerInfo, PlayerStats, ReplayTurn } from "../types";
import { COLORS } from "../theme/colors";
import { FONTS } from "../theme/typography";
import { TIMING } from "../theme/timing";
import type { GameRendererInterface } from "./GameRendererInterface";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChickenGameState {
  current_round: number;
  phase: string;
  player_1_position: number;
  player_2_position: number;
  player_1_current_action: { type: string; value?: number; side?: string } | null;
  player_2_current_action: { type: string; value?: number; side?: string } | null;
  player_1_exited: boolean;
  player_2_exited: boolean;
  player_1_exit_side: string | null;
  player_2_exit_side: string | null;
  player_1_round_score: number;
  player_2_round_score: number;
  cumulative_scores: { player_1: number; player_2: number };
  round_scores: Array<{
    round: number;
    player_1_score: number;
    player_2_score: number;
    outcome: string;
  }>;
  config: { track_length: number; num_rounds: number };
  game_over: boolean;
  winner: string | null;
}

// ─── Layout ─────────────────────────────────────────────────────────────────

const TRACK_TOP = 210;
const TRACK_BOTTOM = 1080;
const TRACK_WIDTH = 320;
const TRACK_LEFT = (1080 - TRACK_WIDTH) / 2;
const CELL_GAP = 5;
const CAR_W = 64;
const CAR_H = 90;
const EXIT_X = 280;

function cellH(n: number) { return (TRACK_BOTTOM - TRACK_TOP - CELL_GAP * (n + 1)) / n; }
function cellMidY(pos: number, n: number) {
  const h = cellH(n);
  return TRACK_TOP + CELL_GAP + (pos - 1) * (h + CELL_GAP) + h / 2;
}

// ─── Car ────────────────────────────────────────────────────────────────────

const Car: React.FC<{
  x: number; y: number; color: string; down: boolean;
  opacity?: number; scale?: number;
}> = ({ x, y, color, down, opacity = 1, scale = 1 }) => (
  <div style={{
    position: "absolute", left: x - CAR_W / 2, top: y - CAR_H / 2,
    width: CAR_W, height: CAR_H, opacity, transform: `scale(${scale})`,
    display: "flex", flexDirection: down ? "column" : "column-reverse",
    alignItems: "center", justifyContent: "center", gap: 1,
  }}>
    <div style={{
      width: CAR_W * 0.5, height: CAR_H * 0.18,
      backgroundColor: `${color}50`,
      borderRadius: down ? "7px 7px 2px 2px" : "2px 2px 7px 7px",
    }} />
    <div style={{
      width: CAR_W, height: CAR_H * 0.62,
      backgroundColor: color, borderRadius: 12,
      border: `2px solid ${color}80`, boxShadow: `0 0 20px ${color}25`,
    }} />
  </div>
);

// ─── Track ──────────────────────────────────────────────────────────────────

const TrackBg: React.FC<{ n: number }> = ({ n }) => {
  const h = cellH(n);
  return (
    <div style={{
      position: "absolute", left: TRACK_LEFT, top: TRACK_TOP,
      width: TRACK_WIDTH, height: TRACK_BOTTOM - TRACK_TOP,
      backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 18,
    }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{
          position: "absolute", left: CELL_GAP, top: CELL_GAP + i * (h + CELL_GAP),
          width: TRACK_WIDTH - CELL_GAP * 2, height: h,
          backgroundColor: COLORS.background, borderRadius: 8,
          border: `1px solid ${COLORS.border}30`,
        }} />
      ))}
    </div>
  );
};

// ─── Crash effect ───────────────────────────────────────────────────────────

const CrashEffect: React.FC<{ x: number; y: number; startFrame: number }> = ({ x, y, startFrame }) => {
  const frame = useCurrentFrame();
  const rel = frame - startFrame;
  if (rel < 0 || rel > 20) return null;

  const expand = interpolate(rel, [0, 8], [0, 5], { extrapolateRight: "clamp" });
  const fade = interpolate(rel, [0, 4, 20], [1, 1, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {/* Big white circle */}
      <div style={{
        position: "absolute", left: -50, top: -50, width: 100, height: 100,
        borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.15)",
        transform: `scale(${expand})`, opacity: fade,
      }} />
      {/* Ring */}
      <div style={{
        position: "absolute", left: -40, top: -40, width: 80, height: 80,
        borderRadius: "50%", border: "4px solid rgba(255,255,255,0.7)",
        transform: `scale(${expand})`, opacity: fade,
      }} />
      {/* Radial lines */}
      <svg width="500" height="500" style={{ position: "absolute", left: -250, top: -250, opacity: fade }}>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const inner = interpolate(rel, [0, 8], [8, 50], { extrapolateRight: "clamp" });
          const outer = interpolate(rel, [0, 8], [20, 200], { extrapolateRight: "clamp" });
          return <line key={i}
            x1={250 + Math.cos(a) * inner} y1={250 + Math.sin(a) * inner}
            x2={250 + Math.cos(a) * outer} y2={250 + Math.sin(a) * outer}
            stroke="white" strokeWidth={3} strokeLinecap="round"
          />;
        })}
      </svg>
      {/* CRASH text */}
      <div style={{
        position: "absolute", left: -100, top: 70, width: 200, textAlign: "center",
        fontFamily: FONTS.family, fontSize: 28, fontWeight: 800, color: "#FF6B6B",
        opacity: interpolate(rel, [3, 6, 18, 20], [0, 1, 1, 0], { extrapolateRight: "clamp" }),
        letterSpacing: 6, textTransform: "uppercase",
      }}>
        CRASH
      </div>
    </div>
  );
};

// ─── Action label ───────────────────────────────────────────────────────────

const ActionLabel: React.FC<{
  action: { type: string; value?: number; side?: string } | null;
  color: string; side: "left" | "right"; y: number; animStart: number;
}> = ({ action, color, side, y, animStart }) => {
  const frame = useCurrentFrame();
  const rel = frame - animStart;
  if (!action || rel < 0) return null;

  const opacity = interpolate(rel, [0, 4, 25, 30], [0, 1, 1, 0.3], { extrapolateRight: "clamp" });

  let text = "";
  if (action.type === "advance") text = `+${action.value}`;
  else if (action.type === "exit") text = `EXIT ${(action.side ?? "").toUpperCase()}`;

  const x = side === "left" ? TRACK_LEFT - 90 : TRACK_LEFT + TRACK_WIDTH + 16;

  return (
    <div style={{
      position: "absolute", left: x, top: y - 14, opacity,
      fontFamily: FONTS.family, fontSize: 20, fontWeight: 700, color,
      textShadow: `0 0 10px ${color}40`,
    }}>
      {text}
    </div>
  );
};

// ─── Round transition overlay ───────────────────────────────────────────────

const RoundTransition: React.FC<{ round: number; startFrame: number }> = ({ round, startFrame }) => {
  const frame = useCurrentFrame();
  const rel = frame - startFrame;
  if (rel < 0 || rel > 20) return null;

  const opacity = interpolate(rel, [0, 5, 15, 20], [0, 0.9, 0.9, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      backgroundColor: `rgba(20,20,22,${opacity * 0.7})`, pointerEvents: "none",
    }}>
      <div style={{
        fontFamily: FONTS.family, fontSize: 42, fontWeight: 700,
        color: COLORS.textPrimary, opacity,
        letterSpacing: 4, textTransform: "uppercase",
      }}>
        Round {round}
      </div>
    </div>
  );
};

// ─── Round indicator ────────────────────────────────────────────────────────

const RoundDots: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div style={{ position: "absolute", top: 165, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
    {Array.from({ length: total }, (_, i) => (
      <div key={i} style={{
        width: i + 1 === current ? 28 : 10, height: 10, borderRadius: 5,
        backgroundColor: i + 1 < current ? COLORS.textMuted : i + 1 === current ? COLORS.textPrimary : COLORS.border,
      }} />
    ))}
    <span style={{ fontFamily: FONTS.family, fontSize: 14, fontWeight: 500, color: COLORS.textHint, marginLeft: 8 }}>
      Round {current}/{total}
    </span>
  </div>
);

// ─── Score bar ──────────────────────────────────────────────────────────────

const ScoreBar: React.FC<{ p1: number; p2: number; c1: string; c2: string }> = ({ p1, p2, c1, c2 }) => (
  <div style={{ position: "absolute", top: TRACK_BOTTOM + 20, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 30 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontFamily: FONTS.family, fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Round</span>
      <span style={{ fontFamily: FONTS.family, fontSize: 24, fontWeight: 700, color: c1 }}>{p1}</span>
    </div>
    <span style={{ fontFamily: FONTS.family, fontSize: 14, color: COLORS.textHint }}>:</span>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontFamily: FONTS.family, fontSize: 24, fontWeight: 700, color: c2 }}>{p2}</span>
      <span style={{ fontFamily: FONTS.family, fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 1 }}>Round</span>
    </div>
  </div>
);

// ─── Board ──────────────────────────────────────────────────────────────────

export const ChickenGameBoard: React.FC<{
  state: ChickenGameState;
  prevState: ChickenGameState;
  players: [PlayerInfo, PlayerInfo];
  turn: ReplayTurn | null;
  turnStartFrame: number;
}> = ({ state, prevState, players, turn, turnStartFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cfg = state.config || { track_length: 10, num_rounds: 3 };
  const n = cfg.track_length;
  const c1 = players[0].avatar_color;
  const c2 = players[1].avatar_color;
  const cx = 1080 / 2;

  // Animation progress
  const t = spring({ frame: frame - turnStartFrame, fps, config: { damping: 16, stiffness: 70, mass: 0.9 } });

  // Detect if this turn is a resolution turn (P2 played, things happened)
  const isResolutionTurn = turn?.player_id === "player_2";

  // Detect crash: new round appeared in round_scores
  const prevRounds = prevState?.round_scores?.length ?? 0;
  const currRounds = state.round_scores?.length ?? 0;
  const newRoundEnded = currRounds > prevRounds;
  const lastRound = newRoundEnded ? state.round_scores[currRounds - 1] : null;
  const isCrash = lastRound && (lastRound.outcome === "crash" || lastRound.outcome === "exit_collision");

  // Previous positions (from previous state)
  const prevP1 = prevState?.player_1_position ?? 1;
  const prevP2 = prevState?.player_2_position ?? n;
  const prevP1Exited = prevState?.player_1_exited ?? false;
  const prevP2Exited = prevState?.player_2_exited ?? false;

  // Current positions
  const currP1 = state.player_1_position;
  const currP2 = state.player_2_position;

  // If it's a crash turn, we need to show the cars converging to the crash point
  // before they reset. The crash point is where they would have met.
  let p1Y: number, p2Y: number;
  let showCrash = false;
  let crashY = 0;

  if (isCrash && isResolutionTurn) {
    // On crash, animate toward each other, meeting in the middle
    // The actions were stored in prevState
    const a1 = prevState?.player_1_current_action;
    const a2 = turn?.action as { type: string; value?: number } | null;

    let crashP1 = prevP1;
    let crashP2 = prevP2;
    if (a1?.type === "advance" && a1.value) crashP1 = prevP1 + a1.value;
    if (a2?.type === "advance" && a2.value) crashP2 = prevP2 - a2.value;

    // Crash point = midpoint of where they would end up
    const meetPos = (crashP1 + crashP2) / 2;
    const meetY = cellMidY(Math.max(1, Math.min(n, meetPos)), n);

    // First half: converge. Second half: hold at crash point.
    const converge = interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
    p1Y = interpolate(converge, [0, 1], [cellMidY(prevP1, n), meetY]);
    p2Y = interpolate(converge, [0, 1], [cellMidY(prevP2, n), meetY]);

    showCrash = true;
    crashY = meetY;
  } else if (isResolutionTurn && !prevP1Exited && !prevP2Exited) {
    // Normal resolution: interpolate both cars
    p1Y = interpolate(t, [0, 1], [cellMidY(prevP1, n), cellMidY(currP1, n)]);
    p2Y = interpolate(t, [0, 1], [cellMidY(prevP2, n), cellMidY(currP2, n)]);
  } else {
    // P1 storage turn or already exited — show current positions (no movement)
    p1Y = cellMidY(currP1, n);
    p2Y = cellMidY(currP2, n);
  }

  // Exit animation
  let p1X = cx, p2X = cx;
  let p1Op = 1, p2Op = 1;
  const justExP1 = state.player_1_exited && !prevP1Exited;
  const justExP2 = state.player_2_exited && !prevP2Exited;

  if (state.player_1_exited) {
    const dir = state.player_1_exit_side === "left" ? -1 : 1;
    const ep = justExP1 ? t : 1;
    p1X = cx + EXIT_X * dir * ep;
    p1Op = interpolate(ep, [0, 0.5, 1], [1, 0.5, 0.2], { extrapolateRight: "clamp" });
  }
  if (state.player_2_exited) {
    const dir = state.player_2_exit_side === "left" ? -1 : 1;
    const ep = justExP2 ? t : 1;
    p2X = cx + EXIT_X * dir * ep;
    p2Op = interpolate(ep, [0, 0.5, 1], [1, 0.5, 0.2], { extrapolateRight: "clamp" });
  }

  // Distance
  const dist = Math.abs(currP2 - currP1);

  // Detect round transition (show overlay for new rounds)
  const roundChanged = (prevState?.current_round ?? 1) !== state.current_round && !state.game_over;

  // Actions for labels (show on resolution turns)
  const p1Action = isResolutionTurn ? prevState?.player_1_current_action : null;
  const p2Action = isResolutionTurn ? (turn?.action as any) : null;

  // Ghost trails
  const ghosts = [0.3, 0.55, 0.8];

  return (
    <>
      <RoundDots current={state.current_round} total={cfg.num_rounds} />
      <TrackBg n={n} />

      {/* Distance label */}
      {!state.player_1_exited && !state.player_2_exited && !showCrash && (
        <div style={{
          position: "absolute", left: TRACK_LEFT + TRACK_WIDTH + 14,
          top: (p1Y + p2Y) / 2 - 14,
          fontFamily: FONTS.family, fontSize: 20, fontWeight: 700,
          color: dist <= 2 ? "#FF6B6B" : dist <= 4 ? "#FBBF24" : COLORS.textMuted,
        }}>
          {dist}
        </div>
      )}

      {/* Action labels */}
      <ActionLabel action={p1Action} color={c1} side="left" y={p1Y} animStart={turnStartFrame} />
      <ActionLabel action={p2Action} color={c2} side="right" y={p2Y} animStart={turnStartFrame} />

      {/* Ghost trails */}
      {justExP1 && ghosts.map((f, i) => (
        <Car key={`g1${i}`} x={cx + (p1X - cx) * f} y={p1Y} color={c1} down={true} opacity={0.12 - i * 0.03} scale={0.85} />
      ))}
      {justExP2 && ghosts.map((f, i) => (
        <Car key={`g2${i}`} x={cx + (p2X - cx) * f} y={p2Y} color={c2} down={false} opacity={0.12 - i * 0.03} scale={0.85} />
      ))}

      {/* Cars */}
      <Car x={p1X} y={p1Y} color={c1} down={true} opacity={p1Op} />
      <Car x={p2X} y={p2Y} color={c2} down={false} opacity={p2Op} />

      {/* Crash effect */}
      {showCrash && (
        <CrashEffect x={cx} y={crashY}
          startFrame={turnStartFrame + Math.round(TIMING.turnDuration * 0.45)}
        />
      )}

      {/* Round transition */}
      {roundChanged && <RoundTransition round={state.current_round} startFrame={turnStartFrame} />}

      {/* Score bar */}
      <ScoreBar p1={state.player_1_round_score} p2={state.player_2_round_score} c1={c1} c2={c2} />
    </>
  );
};

// ─── Victory ────────────────────────────────────────────────────────────────

export const ChickenGameVictory: React.FC<{
  winnerId: string | null; winnerColor: string; startFrame: number;
}> = ({ winnerId, winnerColor, startFrame }) => {
  const frame = useCurrentFrame();
  const rel = frame - startFrame;
  if (rel < 0 || !winnerId) return null;
  const op = interpolate(rel, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", top: TRACK_TOP, left: TRACK_LEFT - 20,
      width: TRACK_WIDTH + 40, height: TRACK_BOTTOM - TRACK_TOP, borderRadius: 22,
      boxShadow: `0 0 100px ${winnerColor}30, inset 0 0 50px ${winnerColor}10`,
      border: `2px solid ${winnerColor}50`, opacity: op, pointerEvents: "none",
    }} />
  );
};

// ─── Interface ──────────────────────────────────────────────────────────────

export const chickenGameRenderer: GameRendererInterface = {
  renderBoard({ state, prevState, turn, players, turnStartFrame }) {
    return (
      <ChickenGameBoard
        state={state as unknown as ChickenGameState}
        prevState={prevState as unknown as ChickenGameState}
        players={players}
        turn={turn}
        turnStartFrame={turnStartFrame}
      />
    );
  },

  renderVictory({ winnerId, winnerColor, startFrame }) {
    return <ChickenGameVictory winnerId={winnerId} winnerColor={winnerColor} startFrame={startFrame} />;
  },

  getTurnDuration() { return TIMING.turnDuration; },
  getVictoryDuration() { return TIMING.victoryFlash; },
  getPauseBetweenTurns() { return 0; },

  formatScore(state) {
    const s = state as unknown as ChickenGameState;
    const sc = s.cumulative_scores || { player_1: 0, player_2: 0 };
    return { player1: String(sc.player_1), player2: String(sc.player_2), label: "pts" };
  },

  formatOutroStats(playerStats, playerId) {
    const ps = playerStats.find((s) => s.player_id === playerId);
    if (!ps) return [];
    const gs = ps.game_stats as Record<string, unknown>;
    return [
      { label: "Score", value: String(gs.cumulative_score ?? 0) },
      { label: "Distance", value: String(gs.total_distance_covered ?? 0) },
      { label: "Crashes", value: String(gs.rounds_crashed ?? 0) },
    ];
  },

  getSfxEvents(turn) {
    if (turn.skipped || turn.player_id === "player_1") return [];
    return [{ sfx: "chicken_game/advance.wav", frameOffset: 0, volume: 0.5 }];
  },
};
