import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { PlayerInfo } from "../types";
import { COLORS } from "../theme/colors";
import { FONTS } from "../theme/typography";
import { TIMING } from "../theme/timing";

interface TtsOverlayProps {
  players: [PlayerInfo, PlayerInfo];
}

/**
 * Displays "Player1 vs Player2" text during the first few seconds.
 * Actual TTS audio would be added as a separate audio track.
 * This component handles the visual subtitle overlay.
 */
export const TtsOverlay: React.FC<TtsOverlayProps> = ({ players }) => {
  const frame = useCurrentFrame();

  if (frame > TIMING.ttsDuration) return null;

  const opacity = interpolate(
    frame,
    [0, 10, TIMING.ttsDuration - 15, TIMING.ttsDuration],
    [0, 1, 1, 0],
    { extrapolateRight: "clamp" }
  );

  const p1 = players[0];
  const p2 = players[1];

  return (
    <div
      style={{
        position: "absolute",
        top: 160,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 16,
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize: 20,
          fontWeight: 600,
          color: p1.avatar_color,
        }}
      >
        {p1.display_name} {p1.display_sub}
      </span>
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize: 20,
          fontWeight: 400,
          color: COLORS.textMuted,
        }}
      >
        vs
      </span>
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize: 20,
          fontWeight: 600,
          color: p2.avatar_color,
        }}
      >
        {p2.display_name} {p2.display_sub}
      </span>
    </div>
  );
};
