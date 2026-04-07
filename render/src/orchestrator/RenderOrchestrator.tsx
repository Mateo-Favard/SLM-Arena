import React from "react";
import { Composition, staticFile } from "remotion";
import { ReplayJSON } from "../types";
import { Compositor, getTotalFrames } from "./Compositor";
import { VIDEO } from "../theme/timing";

/**
 * Root component registered with Remotion.
 * Receives the replay JSON as input props.
 */
export const RenderOrchestrator: React.FC = () => {
  return (
    <>
      <Composition
        id="SlmArenaMatch"
        component={MatchComposition}
        durationInFrames={300} // placeholder, overridden by calculateMetadata
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
        defaultProps={{
          replay: null as unknown as ReplayJSON,
          availableSfx: [] as string[],
        }}
        calculateMetadata={async ({ props }) => {
          if (!props.replay) {
            return { durationInFrames: 300 };
          }
          return {
            durationInFrames: getTotalFrames(props.replay),
          };
        }}
      />
    </>
  );
};

interface MatchProps {
  replay: ReplayJSON;
  availableSfx?: string[];
}

const MatchComposition: React.FC<MatchProps> = ({ replay, availableSfx }) => {
  if (!replay) {
    return (
      <div style={{ color: "white", fontSize: 40, textAlign: "center", marginTop: 200 }}>
        No replay data provided
      </div>
    );
  }
  return <Compositor replay={replay} availableSfx={availableSfx ?? []} />;
};
