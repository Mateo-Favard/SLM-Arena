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

interface TicTacToeState {
  grid: (string | null)[][];
  grid_size: number;
  winner_symbol: string | null;
  winning_cells: [number, number][] | null;
  moves_count: number;
}

// --- Cell ---

const CELL_SIZE = 160;
const GAP = 8;

const Cell: React.FC<{
  symbol: string | null;
  row: number;
  col: number;
  isNew: boolean;
  isWinning: boolean;
  playerColors: Record<string, string>;
  animStart: number;
}> = ({ symbol, row, col, isNew, isWinning, playerColors, animStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = isNew
    ? spring({ frame: frame - animStart, fps, config: { damping: 10, stiffness: 200 } })
    : 1;

  const color = symbol
    ? playerColors[symbol] ?? COLORS.textPrimary
    : "transparent";

  const bgColor = isNew
    ? COLORS.surfaceHighlight
    : isWinning
      ? `${color}15`
      : COLORS.surface;

  const borderColor = isWinning ? `${color}60` : COLORS.border;

  return (
    <div
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        borderRadius: 16,
        backgroundColor: bgColor,
        border: `2px solid ${borderColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {symbol && (
        <span
          style={{
            fontFamily: FONTS.family,
            fontSize: FONTS.cardValue.size * 1.8,
            fontWeight: FONTS.cardValue.weight,
            color,
            transform: `scale(${scale})`,
            lineHeight: 1,
          }}
        >
          {symbol}
        </span>
      )}
    </div>
  );
};

// --- Grid ---

interface TicTacToeBoardProps {
  state: TicTacToeState;
  players: [PlayerInfo, PlayerInfo];
  lastMove: { row: number; col: number } | null;
  turnStartFrame: number;
}

export const TicTacToeBoard: React.FC<TicTacToeBoardProps> = ({
  state,
  players,
  lastMove,
  turnStartFrame,
}) => {
  const size = state.grid_size;
  const winCells = state.winning_cells ?? [];
  const winSet = new Set(winCells.map(([r, c]) => `${r},${c}`));

  const playerColors: Record<string, string> = {
    X: players[0].avatar_color,
    O: players[1].avatar_color,
  };

  const gridWidth = size * CELL_SIZE + (size - 1) * GAP;

  return (
    <div
      style={{
        position: "absolute",
        top: 220,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${size}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${size}, ${CELL_SIZE}px)`,
          gap: GAP,
        }}
      >
        {state.grid.flatMap((row, r) =>
          row.map((cell, c) => (
            <Cell
              key={`${r}-${c}`}
              symbol={cell}
              row={r}
              col={c}
              isNew={lastMove !== null && lastMove.row === r && lastMove.col === c}
              isWinning={winSet.has(`${r},${c}`)}
              playerColors={playerColors}
              animStart={turnStartFrame}
            />
          ))
        )}
      </div>
    </div>
  );
};

// --- Victory: winning line glow ---

interface TicTacToeVictoryProps {
  state: TicTacToeState;
  winnerId: string | null;
  winnerColor: string;
  startFrame: number;
}

export const TicTacToeVictory: React.FC<TicTacToeVictoryProps> = ({
  state,
  winnerId,
  winnerColor,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const relative = frame - startFrame;
  if (relative < 0 || !state.winning_cells) return null;

  const opacity = interpolate(relative, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Compute bounding box of winning cells for glow overlay
  const cells = state.winning_cells;
  const size = state.grid_size;
  const gridWidth = size * CELL_SIZE + (size - 1) * GAP;
  const gridLeft = (1080 - gridWidth) / 2;
  const gridTop = 220;

  return (
    <>
      {cells.map(([r, c]) => {
        const left = gridLeft + c * (CELL_SIZE + GAP);
        const top = gridTop + r * (CELL_SIZE + GAP);
        return (
          <div
            key={`glow-${r}-${c}`}
            style={{
              position: "absolute",
              left,
              top,
              width: CELL_SIZE,
              height: CELL_SIZE,
              borderRadius: 16,
              boxShadow: `0 0 40px ${winnerColor}50`,
              border: `3px solid ${winnerColor}80`,
              opacity,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
};

// ─── GameRendererInterface implementation ────────────────────────────────────

export const tictactoeRenderer: GameRendererInterface = {
  renderBoard({ state, prevState, turn, players, turnStartFrame }) {
    const tttState = state as unknown as TicTacToeState;
    let lastMove: { row: number; col: number } | null = null;
    if (
      turn?.action &&
      !turn.skipped &&
      (turn.action as Record<string, unknown>).position
    ) {
      const pos = (turn.action as Record<string, unknown>).position as number[];
      lastMove = { row: pos[0], col: pos[1] };
    }
    return (
      <TicTacToeBoard
        state={tttState}
        players={players}
        lastMove={lastMove}
        turnStartFrame={turnStartFrame}
      />
    );
  },

  renderVictory({ state, winnerId, winnerColor, startFrame }) {
    const tttState = state as unknown as TicTacToeState;
    return (
      <TicTacToeVictory
        state={tttState}
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
    // TicTacToe doesn't have a running score; show move count
    const tttState = state as unknown as TicTacToeState;
    const winner = tttState.winner_symbol;
    if (winner === "X") return { player1: "1", player2: "0" };
    if (winner === "O") return { player1: "0", player2: "1" };
    return { player1: "0", player2: "0" };
  },

  formatOutroStats(playerStats, playerId) {
    const ps = playerStats.find((s) => s.player_id === playerId);
    if (!ps) return [];
    const gs = ps.game_stats as Record<string, unknown>;
    return [
      { label: "Moves", value: String(gs.total_moves ?? 0) },
      { label: "Avg response", value: `${ps.avg_response_ms}ms` },
    ];
  },

  getSfxEvents(turn) {
    if (turn.skipped) return [];
    const pid = turn.player_id;
    const sfx = pid === "player_1" ? "tictactoe/place_x.wav" : "tictactoe/place_o.wav";
    return [{ sfx, frameOffset: 0, volume: 0.5 }];
  },
};
