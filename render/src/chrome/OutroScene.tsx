import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { PlayerInfo } from "../types";
import { COLORS } from "../theme/colors";
import { FONTS } from "../theme/typography";
import { TIMING } from "../theme/timing";

interface OutroSceneProps {
  players: [PlayerInfo, PlayerInfo];
  winnerId: string | null;
  reason: string;
  finalScore: [number, number];
  startFrame: number;
  scoreLabel?: string;
}

export const OutroScene: React.FC<OutroSceneProps> = ({
  players,
  winnerId,
  finalScore,
  startFrame,
  scoreLabel,
}) => {
  const frame = useCurrentFrame();
  const relative = frame - startFrame;

  if (relative < 0) return null;

  // Fade to black over the outro duration
  const bgOpacity = interpolate(
    relative,
    [0, TIMING.outroDuration * 0.3, TIMING.outroDuration],
    [0, 0.85, 1],
    { extrapolateRight: "clamp" }
  );

  const contentOpacity = interpolate(
    relative,
    [TIMING.outroDuration * 0.2, TIMING.outroDuration * 0.5],
    [0, 1],
    { extrapolateRight: "clamp" }
  );

  const winner = winnerId
    ? players.find((p) => p.id === winnerId)
    : null;

  const winnerColor = winner?.avatar_color ?? COLORS.textPrimary;

  return (
    <AbsoluteFill>
      {/* Dark overlay */}
      <AbsoluteFill
        style={{ backgroundColor: COLORS.background, opacity: bgOpacity }}
      />

      {/* Final score */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: contentOpacity,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.family,
            fontSize: 72,
            fontWeight: 600,
            color: winnerColor,
            marginBottom: 20,
          }}
        >
          {finalScore[0]} : {finalScore[1]}
        </div>

        {scoreLabel && (
          <div
            style={{
              fontFamily: FONTS.family,
              fontSize: 20,
              fontWeight: 400,
              color: COLORS.textMuted,
              marginBottom: 10,
            }}
          >
            {scoreLabel}
          </div>
        )}

        {winner && (
          <div
            style={{
              fontFamily: FONTS.family,
              fontSize: 28,
              fontWeight: 400,
              color: COLORS.textMuted,
            }}
          >
            {winner.display_name} wins
          </div>
        )}

        {!winner && (
          <div
            style={{
              fontFamily: FONTS.family,
              fontSize: 28,
              fontWeight: 400,
              color: COLORS.textMuted,
            }}
          >
            Draw
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
