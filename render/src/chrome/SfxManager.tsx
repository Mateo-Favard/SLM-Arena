import React from "react";
import { Audio, staticFile, useCurrentFrame } from "remotion";
import { ReplayTurn } from "../types";
import { TIMING } from "../theme/timing";

interface SfxManagerProps {
  turns: ReplayTurn[];
}

/**
 * Places audio elements at the correct frame for each turn event.
 * SFX files should exist in public/sfx/.
 * Falls back gracefully if files are missing.
 */
export const SfxManager: React.FC<SfxManagerProps> = ({ turns }) => {
  return (
    <>
      {turns.map((turn, i) => {
        const startFrame = i * TIMING.turnDuration;
        let sfxFile: string;

        if (turn.skipped) {
          sfxFile = "sfx/whoosh.wav";
        } else if (turn.retries > 0) {
          sfxFile = "sfx/buzz.wav";
        } else {
          sfxFile = "sfx/click.wav";
        }

        return (
          <Audio
            key={`sfx-${turn.turn_number}`}
            src={staticFile(sfxFile)}
            startFrom={0}
            volume={0.5}
          />
        );
      })}
    </>
  );
};

/**
 * Victory chime — placed at the victory flash frame.
 */
export const VictoryChime: React.FC<{ startFrame: number }> = ({
  startFrame,
}) => {
  return (
    <Audio
      src={staticFile("sfx/chime.wav")}
      startFrom={0}
      volume={0.6}
    />
  );
};
