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
import type { GameRendererInterface, SfxEvent } from "./GameRendererInterface";

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

const TRACK_HEIGHT = 840;
const TRACK_TOP = 960 - TRACK_HEIGHT / 2;   // 540 — centered vertically
const TRACK_BOTTOM = 960 + TRACK_HEIGHT / 2; // 1380
const TRACK_WIDTH = 320;
const TRACK_LEFT = (1080 - TRACK_WIDTH) / 2;
const CELL_GAP = 5;
const CAR_W = 58;
const CAR_H = 65;
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

// ─── Car Trail ─────────────────────────────────────────────────────────────

const CarTrail: React.FC<{
  fromY: number; toY: number; x: number; color: string; progress: number;
}> = ({ fromY, toY, x, color, progress }) => {
  if (progress <= 0 || Math.abs(toY - fromY) < 5) return null;

  const currentY = interpolate(progress, [0, 1], [fromY, toY]);
  const top = Math.min(currentY, fromY);
  const height = Math.abs(currentY - fromY);
  const movingDown = toY > fromY;

  return (
    <div style={{
      position: "absolute",
      left: x - CAR_W * 0.3,
      top,
      width: CAR_W * 0.6,
      height,
      background: `linear-gradient(${movingDown ? "to top" : "to bottom"}, ${color}50, transparent)`,
      borderRadius: 8,
      opacity: interpolate(progress, [0, 0.5, 1], [0, 0.7, 0.15]),
      pointerEvents: "none",
    }} />
  );
};

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

const CrashEffect: React.FC<{
  x: number; y: number; startFrame: number;
  color1?: string; color2?: string;
}> = ({ x, y, startFrame, color1 = "#00F0FF", color2 = "#FF3CAC" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rel = frame - startFrame;
  if (rel < 0 || rel > 90) return null;

  const expand = interpolate(rel, [0, 6], [0, 10], { extrapolateRight: "clamp" });
  const fade = interpolate(rel, [0, 6, 70, 90], [1, 1, 0.8, 0], { extrapolateRight: "clamp" });
  // Second shockwave ring — delayed
  const expand2 = rel >= 4 ? interpolate(rel - 4, [0, 8], [0, 12], { extrapolateRight: "clamp" }) : 0;
  const fade2 = rel >= 4 ? interpolate(rel - 4, [0, 3, 16], [1, 1, 0], { extrapolateRight: "clamp" }) : 0;
  // Fireball pulse
  const fireScale = spring({ frame: Math.max(0, rel), fps, config: { damping: 8, stiffness: 120, mass: 0.6 } });

  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {/* ── FULL SCREEN WHITE FLASH — hard strobe ── */}
      <div style={{
        position: "absolute", left: -540, top: -1200, width: 1080, height: 2400,
        backgroundColor: "white",
        opacity: interpolate(rel, [0, 1, 3, 6, 10, 20], [0, 1, 0.8, 0.4, 0.15, 0], { extrapolateRight: "clamp" }),
      }} />
      {/* ── RED flash layer — danger feel ── */}
      <div style={{
        position: "absolute", left: -540, top: -1200, width: 1080, height: 2400,
        backgroundColor: "#FF2200",
        opacity: interpolate(rel, [2, 4, 8, 25], [0, 0.5, 0.3, 0], { extrapolateRight: "clamp" }),
      }} />
      {/* ── Player color overlay ── */}
      <div style={{
        position: "absolute", left: -540, top: -1200, width: 1080, height: 2400,
        background: `radial-gradient(circle at 50% 50%, ${color1}BB, ${color2}99, transparent 55%)`,
        opacity: interpolate(rel, [4, 8, 30], [0, 0.9, 0], { extrapolateRight: "clamp" }),
      }} />

      {/* ── Fireball core — bright orange/yellow pulsing ── */}
      <div style={{
        position: "absolute", left: -60, top: -60, width: 120, height: 120,
        borderRadius: "50%",
        background: "radial-gradient(circle, #FFFFFF 0%, #FFDD44 30%, #FF6600 60%, #FF220088 100%)",
        transform: `scale(${fireScale * 3})`,
        opacity: interpolate(rel, [0, 3, 50, 75], [0, 1, 0.6, 0], { extrapolateRight: "clamp" }),
      }} />

      {/* ── Primary shockwave ring ── */}
      <div style={{
        position: "absolute", left: -120, top: -120, width: 240, height: 240,
        borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.5)",
        transform: `scale(${expand})`, opacity: fade,
      }} />
      <div style={{
        position: "absolute", left: -100, top: -100, width: 200, height: 200,
        borderRadius: "50%", border: "8px solid rgba(255,255,255,0.95)",
        transform: `scale(${expand})`, opacity: fade,
      }} />

      {/* ── Second shockwave — delayed, colored ── */}
      <div style={{
        position: "absolute", left: -90, top: -90, width: 180, height: 180,
        borderRadius: "50%",
        border: `6px solid ${color1}AA`,
        transform: `scale(${expand2})`, opacity: fade2,
      }} />
      <div style={{
        position: "absolute", left: -70, top: -70, width: 140, height: 140,
        borderRadius: "50%",
        border: `4px solid ${color2}AA`,
        transform: `scale(${expand2 * 0.8})`, opacity: fade2,
      }} />

      {/* ── Radial debris — thick, bright, many ── */}
      <svg width="1000" height="1000" style={{ position: "absolute", left: -500, top: -500 }}>
        {Array.from({ length: 32 }, (_, i) => {
          const a = (i * 11.25 * Math.PI) / 180;
          const lenVar = 0.4 + (((i * 7 + 3) % 10) / 10) * 1.2;
          const inner = interpolate(rel, [0, 6], [15, 80 * lenVar], { extrapolateRight: "clamp" });
          const outer = interpolate(rel, [0, 6], [40, 400 * lenVar], { extrapolateRight: "clamp" });
          const lineColor = i % 4 === 0 ? "#FFDD44" : i % 4 === 1 ? "white" : i % 4 === 2 ? color1 : color2;
          const w = i % 3 === 0 ? 7 : i % 3 === 1 ? 5 : 3;
          return <line key={i}
            x1={500 + Math.cos(a) * inner} y1={500 + Math.sin(a) * inner}
            x2={500 + Math.cos(a) * outer} y2={500 + Math.sin(a) * outer}
            stroke={lineColor} strokeWidth={w} strokeLinecap="round"
            opacity={fade}
          />;
        })}
      </svg>

      {/* ── Sparks / particles ── */}
      <svg width="1000" height="1000" style={{ position: "absolute", left: -500, top: -500 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i * 22.5 * Math.PI) / 180 + 0.2;
          const dist = interpolate(rel, [0, 10], [20, 200 + (i % 5) * 60], { extrapolateRight: "clamp" });
          const sparkFade = interpolate(rel, [2, 6, 20, 28], [0, 1, 0.5, 0], { extrapolateRight: "clamp" });
          const sparkColor = i % 2 === 0 ? "#FFDD44" : "#FFFFFF";
          return <circle key={`s${i}`}
            cx={500 + Math.cos(a) * dist} cy={500 + Math.sin(a) * dist}
            r={i % 3 === 0 ? 6 : 4}
            fill={sparkColor} opacity={sparkFade}
          />;
        })}
      </svg>

      {/* ── CRASH text — massive ── */}
      <div style={{
        position: "absolute", left: -200, top: 140, width: 400, textAlign: "center",
        fontFamily: FONTS.family, fontSize: 56, fontWeight: 900, color: "#FF2200",
        opacity: interpolate(rel, [2, 4, 70, 90], [0, 1, 1, 0], { extrapolateRight: "clamp" }),
        transform: `scale(${interpolate(rel, [2, 6], [1.5, 1], { extrapolateRight: "clamp" })})`,
        letterSpacing: 14, textTransform: "uppercase",
        textShadow: "0 0 40px rgba(255,34,0,1), 0 0 80px rgba(255,34,0,0.8), 0 0 120px rgba(255,100,0,0.5), 0 2px 0 #AA0000",
      }}>
        CRASH
      </div>
    </div>
  );
};

// ─── Exit effect ───────────────────────────────────────────────────────────

const ExitEffect: React.FC<{
  x: number; y: number; color: string; side: string; playerName: string;
  startFrame: number;
}> = ({ x, y, color, side, playerName, startFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rel = frame - startFrame;
  if (rel < 0 || rel > 150) return null;

  const dir = side === "left" ? -1 : 1;
  const arrowX = interpolate(rel, [0, 40], [0, 120 * dir], { extrapolateRight: "clamp" });
  const textScale = spring({ frame: Math.max(0, rel - 3), fps, config: { damping: 12, stiffness: 60, mass: 1.0 } });
  const fade = interpolate(rel, [0, 8, 120, 150], [0, 1, 1, 0], { extrapolateRight: "clamp" });

  return (
    <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
      {/* Color flash stripe */}
      <div style={{
        position: "absolute", left: -540, top: -80, width: 1080, height: 160,
        background: `linear-gradient(${side === "left" ? "to left" : "to right"}, ${color}40, transparent 60%)`,
        opacity: interpolate(rel, [0, 6, 40, 80], [0, 0.8, 0.5, 0], { extrapolateRight: "clamp" }),
      }} />
      {/* Arrow indicator */}
      <div style={{
        position: "absolute", left: arrowX - 30, top: -25,
        fontFamily: FONTS.family, fontSize: 50, fontWeight: 900, color,
        opacity: fade,
        textShadow: `0 0 20px ${color}80`,
      }}>
        {side === "left" ? "←" : "→"}
      </div>
      {/* EXIT text */}
      <div style={{
        position: "absolute", left: -150, top: 50, width: 300, textAlign: "center",
        fontFamily: FONTS.family, fontSize: 38, fontWeight: 800, color,
        opacity: fade,
        transform: `scale(${textScale})`,
        letterSpacing: 8, textTransform: "uppercase",
        textShadow: `0 0 25px ${color}90, 0 0 50px ${color}40`,
      }}>
        {playerName} EXIT
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

  const opacity = interpolate(rel, [0, 6, 100, 130], [0, 1, 1, 0.3], { extrapolateRight: "clamp" });

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

// ─── Round result overlay ───────────────────────────────────────────────────

const RoundResultOverlay: React.FC<{
  p1Score: number; p2Score: number; outcome: string;
  c1: string; c2: string;
  p1Name: string; p2Name: string;
  startFrame: number;
}> = ({ p1Score, p2Score, outcome, c1, c2, p1Name, p2Name, startFrame }) => {
  const frame = useCurrentFrame();
  const rel = frame - startFrame;
  // Show after the exit/crash animation is clearly visible
  const delay = outcome === "crash" ? 18 : 90; // exits: wait 3s so the exit anim plays out first
  const dur = outcome === "crash" ? 300 : 200; // fills the remaining turn time
  const adjusted = rel - delay;
  if (adjusted < 0 || adjusted > dur) return null;

  const bgOp = interpolate(adjusted, [0, 4, dur - 10, dur], [0, 0.8, 0.8, 0], { extrapolateRight: "clamp" });
  const contentOp = interpolate(adjusted, [2, 6, dur - 10, dur], [0, 1, 1, 0], { extrapolateRight: "clamp" });
  const scaleIn = interpolate(adjusted, [2, 8], [0.7, 1], { extrapolateRight: "clamp" });

  const isCrash = outcome === "crash" || outcome === "exit_collision";
  const winnerColor = p1Score > p2Score ? c1 : p2Score > p1Score ? c2 : COLORS.textPrimary;
  const winnerName = p1Score > p2Score ? p1Name : p2Score > p1Score ? p2Name : "";

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      backgroundColor: `rgba(20,20,22,${bgOp})`, pointerEvents: "none",
    }}>
      <div style={{ opacity: contentOp, transform: `scale(${scaleIn})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        {isCrash ? (
          <>
            {/* Crash outcome */}
            <div style={{
              fontFamily: FONTS.family, fontSize: 32, fontWeight: 800,
              color: "#FF4444", letterSpacing: 4, textTransform: "uppercase",
              textShadow: "0 0 30px rgba(255,68,68,0.7)",
            }}>
              CRASH — 0 PTS EACH
            </div>
          </>
        ) : (
          <>
            {/* Round winner banner */}
            <div style={{
              fontFamily: FONTS.family, fontSize: 26, fontWeight: 600,
              color: COLORS.textMuted, letterSpacing: 3, textTransform: "uppercase",
            }}>
              ROUND OVER
            </div>
            {/* Score boxes — big and clear */}
            <div style={{ display: "flex", gap: 50, alignItems: "center" }}>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "16px 24px", borderRadius: 16,
                border: p1Score > p2Score ? `3px solid ${c1}80` : `1px solid ${COLORS.border}`,
                backgroundColor: p1Score > p2Score ? `${c1}15` : "transparent",
              }}>
                <span style={{ fontFamily: FONTS.family, fontSize: 64, fontWeight: 900, color: c1, textShadow: `0 0 30px ${c1}50` }}>
                  +{p1Score}
                </span>
                <span style={{ fontFamily: FONTS.family, fontSize: 18, fontWeight: 600, color: c1 }}>
                  {p1Name}
                </span>
              </div>
              <span style={{ fontFamily: FONTS.family, fontSize: 28, color: COLORS.textHint, fontWeight: 300 }}>vs</span>
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                padding: "16px 24px", borderRadius: 16,
                border: p2Score > p1Score ? `3px solid ${c2}80` : `1px solid ${COLORS.border}`,
                backgroundColor: p2Score > p1Score ? `${c2}15` : "transparent",
              }}>
                <span style={{ fontFamily: FONTS.family, fontSize: 64, fontWeight: 900, color: c2, textShadow: `0 0 30px ${c2}50` }}>
                  +{p2Score}
                </span>
                <span style={{ fontFamily: FONTS.family, fontSize: 18, fontWeight: 600, color: c2 }}>
                  {p2Name}
                </span>
              </div>
            </div>
            {/* Winner line */}
            {winnerName && (
              <div style={{
                fontFamily: FONTS.family, fontSize: 24, fontWeight: 700,
                color: winnerColor, letterSpacing: 2,
                textShadow: `0 0 20px ${winnerColor}60`,
              }}>
                {winnerName} wins the round
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Round indicator ────────────────────────────────────────────────────────

const RoundDots: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div style={{ position: "absolute", top: TRACK_TOP - 40, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}>
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
  const t = spring({ frame: frame - turnStartFrame, fps, config: { damping: 22, stiffness: 25, mass: 1.5 } });

  // Detect if this turn is a resolution turn (P2 played, things happened)
  const isResolutionTurn = turn?.player_id === "player_2";

  // Detect round end: round number changed or game just ended
  const prevRound = prevState?.current_round ?? 1;
  const currRound = state.current_round;
  const roundJustEnded = isResolutionTurn && (currRound > prevRound || (state.game_over && !prevState?.game_over));
  // Which round ended? If round advanced, the previous round ended. If game_over on same round, current round ended.
  const endedRoundNum = currRound > prevRound ? prevRound : currRound;
  const endedRound = roundJustEnded ? (state.round_scores ?? []).find((r: any) => r.round === endedRoundNum) ?? null : null;
  const isCrash = endedRound && (endedRound.outcome === "crash" || endedRound.outcome === "exit_collision");

  // Previous positions (from previous state)
  const prevP1 = prevState?.player_1_position ?? 1;
  const prevP2 = prevState?.player_2_position ?? n;
  const prevP1Exited = prevState?.player_1_exited ?? false;
  const prevP2Exited = prevState?.player_2_exited ?? false;

  // Current positions
  const currP1 = state.player_1_position;
  const currP2 = state.player_2_position;

  // Detect actions from the turn itself (not just state)
  const turnAction = turn?.action as { type: string; value?: number; side?: string } | null;
  const isP1Turn = turn?.player_id === "player_1";
  const p1StoredAction = prevState?.player_1_current_action;

  // P1 exit on storage turn: state doesn't reflect it, but action says exit
  const p1ExitingThisTurn = isP1Turn && turnAction?.type === "exit";
  // P2 exit on resolution turn: state reflects it
  const p2ExitingThisTurn = isResolutionTurn && turnAction?.type === "exit";

  // Positions & crash logic
  let p1Y: number, p2Y: number;
  let showCrash = false;
  let crashY = 0;

  if (isCrash && isResolutionTurn) {
    // Crash: animate both toward collision point
    const a1 = p1StoredAction;
    const a2 = turnAction;
    let crashP1 = prevP1;
    let crashP2 = prevP2;
    if (a1?.type === "advance" && a1.value) crashP1 = prevP1 + a1.value;
    if (a2?.type === "advance" && a2.value) crashP2 = prevP2 - a2.value;
    const meetPos = (crashP1 + crashP2) / 2;
    const meetY = cellMidY(Math.max(1, Math.min(n, meetPos)), n);
    const converge = interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
    p1Y = interpolate(converge, [0, 1], [cellMidY(prevP1, n), meetY]);
    p2Y = interpolate(converge, [0, 1], [cellMidY(prevP2, n), meetY]);
    showCrash = true;
    crashY = meetY;
  } else if (p1ExitingThisTurn) {
    // P1 storage turn with exit — hold at current position (exit X animation handles the slide)
    p1Y = cellMidY(currP1, n);
    p2Y = cellMidY(currP2, n);
  } else if (isResolutionTurn && roundJustEnded) {
    // Round ended on resolution — animate using ACTIONS, not reset positions
    // P1's action was stored in prevState.player_1_current_action
    const a1 = p1StoredAction;
    const a2 = turnAction;

    // P1: if they stored an advance, show them moving to target. If exit, hold at prev pos.
    if (a1?.type === "advance" && a1.value) {
      const targetP1 = Math.min(n, prevP1 + a1.value);
      p1Y = interpolate(t, [0, 1], [cellMidY(prevP1, n), cellMidY(targetP1, n)]);
    } else {
      p1Y = cellMidY(prevP1, n);
    }

    // P2: animate their action
    if (a2?.type === "advance" && a2.value) {
      const targetP2 = Math.max(1, prevP2 - a2.value);
      p2Y = interpolate(t, [0, 1], [cellMidY(prevP2, n), cellMidY(targetP2, n)]);
    } else {
      p2Y = cellMidY(prevP2, n);
    }
  } else if (isResolutionTurn) {
    // Normal resolution (no round end): interpolate to actual positions
    p1Y = interpolate(t, [0, 1], [cellMidY(prevP1, n), cellMidY(currP1, n)]);
    p2Y = interpolate(t, [0, 1], [cellMidY(prevP2, n), cellMidY(currP2, n)]);
  } else {
    // P1 storage turn (advance) — show current positions
    p1Y = cellMidY(currP1, n);
    p2Y = cellMidY(currP2, n);
  }

  // Exit animation (slide off screen)
  let p1X = cx, p2X = cx;
  let p1Op = 1, p2Op = 1;

  // Detect exit from state OR from action (for P1 storage turns where state doesn't reflect exit)
  const justExP1 = (state.player_1_exited && !prevP1Exited) || p1ExitingThisTurn;
  const justExP2 = (state.player_2_exited && !prevP2Exited) || p2ExitingThisTurn;
  const showP1Exited = state.player_1_exited || p1ExitingThisTurn || (roundJustEnded && (prevP1Exited || (p1StoredAction?.type === "exit")));
  const showP2Exited = state.player_2_exited || p2ExitingThisTurn || (roundJustEnded && prevP2Exited);
  const p1ExitSide = state.player_1_exit_side ?? prevState?.player_1_exit_side ?? turnAction?.side ?? p1StoredAction?.side;
  const p2ExitSide = state.player_2_exit_side ?? prevState?.player_2_exit_side ?? turnAction?.side;

  if (showP1Exited) {
    const dir = p1ExitSide === "left" ? -1 : 1;
    const ep = justExP1 ? t : 1;
    p1X = cx + EXIT_X * dir * ep;
    p1Op = interpolate(ep, [0, 0.5, 1], [1, 0.5, 0.2], { extrapolateRight: "clamp" });
  }
  if (showP2Exited) {
    const dir = p2ExitSide === "left" ? -1 : 1;
    const ep = justExP2 ? t : 1;
    p2X = cx + EXIT_X * dir * ep;
    p2Op = interpolate(ep, [0, 0.5, 1], [1, 0.5, 0.2], { extrapolateRight: "clamp" });
  }

  // Distance
  const dist = Math.abs(currP2 - currP1);

  // Detect round transition — but NOT on round-ending turns (score overlay handles that)
  const roundChanged = (prevState?.current_round ?? 1) !== state.current_round && !state.game_over && !roundJustEnded;

  // Actions for labels (show on resolution turns)
  const p1Action = isResolutionTurn ? prevState?.player_1_current_action : null;
  const p2Action = isResolutionTurn ? (turn?.action as any) : null;

  // Ghost trails
  const ghosts = [0.3, 0.55, 0.8];

  // Screen shake on crash
  const crashFrame = turnStartFrame + Math.round(TIMING.turnDuration * 0.45);
  const shakeRel = showCrash ? frame - crashFrame : -1;
  const shakeAmp = shakeRel >= 0 && shakeRel < 25
    ? interpolate(shakeRel, [0, 25], [25, 0], { extrapolateRight: "clamp" })
    : 0;
  const shakeX = shakeAmp * Math.sin(shakeRel * 3.2);
  const shakeY = shakeAmp * Math.cos(shakeRel * 4.1);

  return (
    <>
      <RoundDots current={state.current_round} total={cfg.num_rounds} />
      <div style={{ transform: `translate(${shakeX}px, ${shakeY}px)` }}>
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

        {/* Light trails — behind cars */}
        {isResolutionTurn && !showCrash && !prevP1Exited && (
          <CarTrail fromY={cellMidY(prevP1, n)} toY={cellMidY(currP1, n)} x={cx} color={c1} progress={t} />
        )}
        {isResolutionTurn && !showCrash && !prevP2Exited && (
          <CarTrail fromY={cellMidY(prevP2, n)} toY={cellMidY(currP2, n)} x={cx} color={c2} progress={t} />
        )}

        {/* Ghost trails (exit) */}
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
            startFrame={crashFrame}
            color1={c1} color2={c2}
          />
        )}

        {/* Exit effect — big visible overlay when a player exits */}
        {justExP1 && (
          <ExitEffect x={cx} y={p1Y} color={c1}
            side={p1ExitSide ?? "left"}
            playerName={players[0].display_name}
            startFrame={turnStartFrame}
          />
        )}
        {justExP2 && (
          <ExitEffect x={cx} y={p2Y} color={c2}
            side={p2ExitSide ?? "left"}
            playerName={players[1].display_name}
            startFrame={turnStartFrame}
          />
        )}
      </div>

      {/* Round result — shows score delta when a round ends */}
      {roundJustEnded && endedRound && (
        <RoundResultOverlay
          p1Score={endedRound.player_1_score} p2Score={endedRound.player_2_score}
          outcome={endedRound.outcome}
          c1={c1} c2={c2}
          p1Name={players[0].display_name} p2Name={players[1].display_name}
          startFrame={turnStartFrame}
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

  getTurnDuration(turn) {
    // P1 storage turns — quick, nothing visual
    if (turn.player_id === "player_1") {
      const action = turn.action as { type: string } | null;
      if (action?.type === "exit") return 188; // 6.3s for exit animation
      return 35; // 1.2s between movements
    }

    // P2 resolution turns — 2s base for movement animation
    const sa = turn.state_after as unknown as ChickenGameState;
    const n = sa?.config?.track_length ?? 10;
    const positionsReset = sa.player_1_position === 1 && sa.player_2_position === n;
    const gameJustEnded = sa.game_over;

    // Round-ending turns: animation + overlay + breathing room
    if (positionsReset || gameJustEnded) {
      const endedRoundNum = positionsReset ? sa.current_round - 1 : sa.current_round;
      const endedRound = (sa.round_scores ?? []).find((r: any) => r.round === endedRoundNum);
      const isCrash = endedRound && (endedRound.outcome === "crash" || endedRound.outcome === "exit_collision");

      if (isCrash) return 375;  // 12.5s: convergence + explosion + result overlay
      return 325;               // 10.8s: exit anim + result overlay
    }

    return 150; // 5s per normal resolution turn
  },
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
    if (turn.skipped) return [];

    const events: SfxEvent[] = [];
    const action = turn.action as { type: string; value?: number; side?: string } | null;

    // P1 exit turns get exit sound
    if (turn.player_id === "player_1") {
      if (action?.type === "exit") {
        events.push({ sfx: "chicken_game/exit.wav", frameOffset: 0, volume: 0.6 });
      }
      return events;
    }

    const stateAfter = turn.state_after as unknown as ChickenGameState;

    // P2 resolution: play movement sound
    if (action?.type === "advance") {
      events.push({ sfx: "chicken_game/advance.wav", frameOffset: 0, volume: 1.0 });
    } else if (action?.type === "exit") {
      events.push({ sfx: "chicken_game/exit.wav", frameOffset: 0, volume: 0.8 });
    }

    // Secondary: detect round end via position reset or game over
    const n = stateAfter?.config?.track_length ?? 10;
    const positionsReset = stateAfter.player_1_position === 1 && stateAfter.player_2_position === n;
    const gameJustEnded = stateAfter.game_over;

    if (positionsReset || gameJustEnded) {
      const endedRoundNum = positionsReset ? stateAfter.current_round - 1 : stateAfter.current_round;
      const endedRound = (stateAfter.round_scores ?? []).find((r: any) => r.round === endedRoundNum);
      const isCrash = endedRound && (endedRound.outcome === "crash" || endedRound.outcome === "exit_collision");

      if (isCrash) {
        events.push({ sfx: "chicken_game/crash.wav", frameOffset: Math.round(TIMING.turnDuration * 0.45), volume: 0.7 });
      } else if (positionsReset) {
        events.push({ sfx: "chicken_game/round_start.wav", frameOffset: 40, volume: 0.5 });
      }
    }

    return events.slice(0, 2);
  },
};
