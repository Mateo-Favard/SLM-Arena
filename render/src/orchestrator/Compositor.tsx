import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ReplayJSON } from "../types";
import { COLORS } from "../theme/colors";
import { TIMING } from "../theme/timing";
import { TopBar } from "../chrome/TopBar";
import { VictoryFlash } from "../chrome/VictoryFlash";
import { OutroScene } from "../chrome/OutroScene";
import { getRenderer } from "../games/registry";

interface CompositorProps {
  replay: ReplayJSON;
  availableSfx?: string[];
}

function buildTimeline(replay: ReplayJSON) {
  const renderer = getRenderer(replay.metadata.game_type);
  const turns = replay.turns;

  // Use renderer's turn duration if available, else fallback
  const framesPerTurn = renderer
    ? renderer.getTurnDuration(turns[0] ?? ({} as any))
    : TIMING.turnDuration;

  const totalTurnFrames = turns.length * framesPerTurn;
  const victoryDuration = renderer?.getVictoryDuration() ?? TIMING.victoryFlash;
  const victoryStart = totalTurnFrames;
  const outroStart = victoryStart + victoryDuration;
  const totalFrames = outroStart + TIMING.outroDuration;

  return { framesPerTurn, totalTurnFrames, victoryStart, outroStart, totalFrames };
}

export function getTotalFrames(replay: ReplayJSON): number {
  return buildTimeline(replay).totalFrames;
}

export const Compositor: React.FC<CompositorProps> = ({ replay, availableSfx = [] }) => {
  const frame = useCurrentFrame();
  const { players, game_type } = replay.metadata;
  const turns = replay.turns;
  const timeline = buildTimeline(replay);
  const renderer = getRenderer(game_type);

  // Current turn
  const turnIndex = Math.min(
    Math.floor(frame / timeline.framesPerTurn),
    turns.length - 1
  );
  const turnStartFrame = turnIndex * timeline.framesPerTurn;
  const currentTurn = turns[turnIndex];
  const state = turnIndex >= 0 ? currentTurn.state_after : replay.metadata.initial_state;
  const prevState = turnIndex > 0
    ? turns[turnIndex - 1].state_after
    : replay.metadata.initial_state;

  // Score — delegate to renderer
  let score: [number, number] = [0, 0];
  if (renderer) {
    const sd = renderer.formatScore(state);
    score = [Number(sd.player1) || 0, Number(sd.player2) || 0];
  }

  // Winner
  const result = replay.result;
  const winnerId = result?.winner_id ?? null;
  const winnerPlayer = winnerId ? players.find((p) => p.id === winnerId) : null;
  const winnerColor = winnerPlayer?.avatar_color ?? COLORS.textPrimary;

  // Score label for outro
  const scoreLabel = renderer ? renderer.formatScore(state).label : undefined;

  const inOutro = frame >= timeline.outroStart;

  // Build SFX timeline from game renderer
  const sfxEvents: { frame: number; sfx: string; volume: number }[] = [];
  if (renderer) {
    turns.forEach((turn, i) => {
      const turnStart = i * timeline.framesPerTurn;
      const events = renderer.getSfxEvents(turn);
      events.forEach((e) => {
        sfxEvents.push({
          frame: turnStart + e.frameOffset,
          sfx: e.sfx,
          volume: e.volume,
        });
      });
    });
  }

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* Game + chrome layers — hidden during outro */}
      {!inOutro && (
        <>
          {renderer?.renderBoard({
            state,
            prevState,
            turn: currentTurn,
            players,
            turnStartFrame,
          })}
          <TopBar players={players} score={score} />
        </>
      )}

      {/* Victory */}
      {result && !inOutro && (
        <>
          <VictoryFlash winnerColor={winnerColor} startFrame={timeline.victoryStart} />
          {renderer?.renderVictory({
            state,
            winnerId,
            winnerColor,
            startFrame: timeline.victoryStart,
          })}
        </>
      )}

      {/* Outro — score only */}
      {result && (
        <OutroScene
          players={players}
          winnerId={winnerId}
          reason={result.reason}
          finalScore={score}
          startFrame={timeline.outroStart}
          scoreLabel={scoreLabel}
        />
      )}

      {/* TTS announcement — plays from frame 0 */}
      <Sequence from={0} layout="none">
        <Audio src={staticFile("tts/announce.mp3")} volume={1.0} />
      </Sequence>

      {/* SFX events — skip if file not in available list */}
      {sfxEvents
        .filter((e) => availableSfx.includes(e.sfx))
        .map((e, i) => (
          <Sequence key={`sfx-${i}`} from={e.frame} layout="none">
            <Audio src={staticFile(`sfx/${e.sfx}`)} volume={e.volume} />
          </Sequence>
        ))}

      {/* Victory/draw chime */}
      {result && (() => {
        const vsfx = winnerId ? "universal/victory.wav" : "universal/draw.wav";
        return availableSfx.includes(vsfx) ? (
          <Sequence from={timeline.victoryStart} layout="none">
            <Audio src={staticFile(`sfx/${vsfx}`)} volume={0.6} />
          </Sequence>
        ) : null;
      })()}
    </AbsoluteFill>
  );
};
