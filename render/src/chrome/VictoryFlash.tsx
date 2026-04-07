import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TIMING } from "../theme/timing";

interface VictoryFlashProps {
  winnerColor: string;
  startFrame: number;
}

export const VictoryFlash: React.FC<VictoryFlashProps> = ({
  winnerColor,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const relative = frame - startFrame;

  if (relative < 0 || relative > TIMING.victoryFlash) return null;

  const opacity = interpolate(
    relative,
    [0, 3, TIMING.victoryFlash],
    [0, 0.3, 0],
    { extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: winnerColor,
        opacity,
      }}
    />
  );
};
