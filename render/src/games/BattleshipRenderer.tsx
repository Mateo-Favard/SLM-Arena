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

// --- Types ---

interface Shot {
  target: string;
  result: "hit" | "miss";
}

interface Ship {
  name: string;
  positions: string[];
  hits?: string[];
  hit_positions?: string[];
  sunk: boolean;
}

interface BattleshipState {
  grid_size: number;
  player_1_ships: Ship[];
  player_2_ships: Ship[];
  player_1_shots: Shot[];
  player_2_shots: Shot[];
  game_over: boolean;
  winner: string | null;
}

// --- Helpers ---

function parseTarget(target: string): { row: number; col: number } | null {
  if (!target || target.length < 2) return null;
  const col = target.charCodeAt(0) - "A".charCodeAt(0);
  const row = parseInt(target.slice(1), 10) - 1;
  if (isNaN(row) || col < 0) return null;
  return { row, col };
}

// --- Cell sizes ---
const CELL_SIZE = 42;
const GAP = 2;
const GRID_PADDING = 4;

// --- Single grid ---

const BattleshipGrid: React.FC<{
  gridSize: number;
  ships: Ship[];
  shots: Shot[];
  showShips: boolean;
  playerColor: string;
  playerName: string;
  lastShot: string | null;
  animStart: number;
  label: string;
}> = ({
  gridSize,
  ships,
  shots,
  showShips,
  playerColor,
  playerName,
  lastShot,
  animStart,
  label,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Build lookup maps
  const shipCells = new Set<string>();
  const sunkCells = new Set<string>();
  if (showShips) {
    for (const ship of ships) {
      for (const pos of ship.positions) {
        shipCells.add(pos);
        if (ship.sunk) sunkCells.add(pos);
      }
    }
  }

  const shotMap = new Map<string, "hit" | "miss">();
  for (const s of shots) {
    shotMap.set(s.target, s.result);
  }

  const totalWidth = gridSize * (CELL_SIZE + GAP) - GAP + GRID_PADDING * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {/* Label */}
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize: 14,
          fontWeight: 600,
          color: playerColor,
        }}
      >
        {label}
      </span>

      {/* Column headers */}
      <div style={{ display: "flex", gap: GAP, paddingLeft: 20 }}>
        {Array.from({ length: gridSize }, (_, c) => (
          <div
            key={`col-${c}`}
            style={{
              width: CELL_SIZE,
              textAlign: "center",
              fontFamily: FONTS.family,
              fontSize: 10,
              color: COLORS.textHint,
            }}
          >
            {String.fromCharCode(65 + c)}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {Array.from({ length: gridSize }, (_, r) => (
        <div key={`row-${r}`} style={{ display: "flex", alignItems: "center", gap: GAP }}>
          {/* Row number */}
          <div
            style={{
              width: 18,
              textAlign: "right",
              fontFamily: FONTS.family,
              fontSize: 10,
              color: COLORS.textHint,
            }}
          >
            {r + 1}
          </div>

          {/* Cells */}
          {Array.from({ length: gridSize }, (_, c) => {
            const label = `${String.fromCharCode(65 + c)}${r + 1}`;
            const shotResult = shotMap.get(label);
            const isShipCell = shipCells.has(label);
            const isSunk = sunkCells.has(label);
            const isLast = label === lastShot;

            const scale = isLast
              ? spring({ frame: frame - animStart, fps, config: { damping: 12 } })
              : 1;

            let bgColor = COLORS.surface;
            if (isSunk) bgColor = "#3A1A1A";
            else if (isShipCell && showShips) bgColor = "#1A2A2A";
            else if (isLast) bgColor = COLORS.surfaceHighlight;

            return (
              <div
                key={`cell-${r}-${c}`}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  borderRadius: 4,
                  backgroundColor: bgColor,
                  border: `1px solid ${COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${scale})`,
                }}
              >
                {shotResult === "hit" && (
                  <span
                    style={{
                      fontFamily: FONTS.family,
                      fontSize: 18,
                      fontWeight: 600,
                      color: "#FF6B6B",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </span>
                )}
                {shotResult === "miss" && (
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: COLORS.textHint,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// --- Main Battleship Board ---

interface BattleshipBoardProps {
  state: BattleshipState;
  players: [PlayerInfo, PlayerInfo];
  lastShot: { playerId: string; target: string } | null;
  turnStartFrame: number;
}

export const BattleshipBoard: React.FC<BattleshipBoardProps> = ({
  state,
  players,
  lastShot,
  turnStartFrame,
}) => {
  const gridSize = state.grid_size;

  return (
    <div
      style={{
        position: "absolute",
        top: 180,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      {/* Player 1's attack grid (shots at P2's ships) */}
      <BattleshipGrid
        gridSize={gridSize}
        ships={state.player_2_ships}
        shots={state.player_1_shots}
        showShips={false}
        playerColor={players[0].avatar_color}
        playerName={players[0].display_name}
        lastShot={lastShot?.playerId === "player_1" ? lastShot.target : null}
        animStart={turnStartFrame}
        label={`${players[0].display_name} attacks`}
      />

      {/* Player 2's attack grid (shots at P1's ships) */}
      <BattleshipGrid
        gridSize={gridSize}
        ships={state.player_1_ships}
        shots={state.player_2_shots}
        showShips={false}
        playerColor={players[1].avatar_color}
        playerName={players[1].display_name}
        lastShot={lastShot?.playerId === "player_2" ? lastShot.target : null}
        animStart={turnStartFrame}
        label={`${players[1].display_name} attacks`}
      />
    </div>
  );
};

// --- Victory ---

interface BattleshipVictoryProps {
  state: BattleshipState;
  winnerId: string | null;
  winnerColor: string;
  startFrame: number;
}

export const BattleshipVictory: React.FC<BattleshipVictoryProps> = ({
  winnerId,
  winnerColor,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const relative = frame - startFrame;
  if (relative < 0 || !winnerId) return null;

  const opacity = interpolate(relative, [0, 10], [0, 0.8], {
    extrapolateRight: "clamp",
  });

  // Highlight the winning player's grid
  const isP1 = winnerId === "player_1";
  const top = isP1 ? 170 : 620;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        width: 500,
        height: 420,
        borderRadius: 16,
        boxShadow: `0 0 80px ${winnerColor}30`,
        border: `2px solid ${winnerColor}40`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

// ─── GameRendererInterface implementation ────────────────────────────────────

export const battleshipRenderer: GameRendererInterface = {
  renderBoard({ state, prevState, turn, players, turnStartFrame }) {
    const bsState = state as unknown as BattleshipState;
    let lastShot: { playerId: string; target: string } | null = null;
    if (
      turn?.action &&
      !turn.skipped &&
      (turn.action as Record<string, unknown>).target
    ) {
      lastShot = {
        playerId: turn.player_id,
        target: String((turn.action as Record<string, unknown>).target).toUpperCase(),
      };
    }
    return (
      <BattleshipBoard
        state={bsState}
        players={players}
        lastShot={lastShot}
        turnStartFrame={turnStartFrame}
      />
    );
  },

  renderVictory({ state, winnerId, winnerColor, startFrame }) {
    return (
      <BattleshipVictory
        state={state as unknown as BattleshipState}
        winnerId={winnerId}
        winnerColor={winnerColor}
        startFrame={startFrame}
      />
    );
  },

  getTurnDuration() {
    return TIMING.turnDuration;
  },

  getVictoryDuration() {
    return TIMING.victoryFlash;
  },

  getPauseBetweenTurns() {
    return 0;
  },

  formatScore(state) {
    // Battleship: show ships remaining
    const bsState = state as unknown as BattleshipState;
    const p1Remaining = bsState.player_1_ships?.filter((s) => !s.sunk).length ?? 0;
    const p2Remaining = bsState.player_2_ships?.filter((s) => !s.sunk).length ?? 0;
    return {
      player1: String(p1Remaining),
      player2: String(p2Remaining),
      label: "ships",
    };
  },

  formatOutroStats(playerStats, playerId) {
    const ps = playerStats.find((s) => s.player_id === playerId);
    if (!ps) return [];
    const gs = ps.game_stats as Record<string, unknown>;
    return [
      { label: "Shots", value: String(gs.total_shots ?? 0) },
      { label: "Hit rate", value: String(gs.hit_rate ?? "0%") },
      { label: "Ships sunk", value: String(gs.ships_sunk ?? 0) },
      { label: "Avg response", value: `${ps.avg_response_ms}ms` },
    ];
  },

  getSfxEvents(turn) {
    if (turn.skipped) return [];
    return [{ sfx: "battleship/fire.wav", frameOffset: 0, volume: 0.5 }];
  },
};
