import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PlayerInfo } from "../types";
import { COLORS } from "../theme/colors";
import { FONTS } from "../theme/typography";

interface TopBarProps {
  players: [PlayerInfo, PlayerInfo];
  score: [number, number];
}

const ModelAvatar: React.FC<{
  player: PlayerInfo;
  size: number;
}> = ({ player, size }) => {
  const initial = player.display_name.charAt(0).toUpperCase();

  // If avatar_url is set, use it from public/models/
  if (player.avatar_url) {
    return (
      <Img
        src={staticFile(`models/${player.avatar_url}`)}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          objectFit: "cover",
        }}
      />
    );
  }

  // Fallback: colored initial
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: COLORS.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.family,
        fontSize: size * 0.45,
        fontWeight: 600,
        color: player.avatar_color,
      }}
    >
      {initial}
    </div>
  );
};

const PlayerBadge: React.FC<{
  player: PlayerInfo;
  side: "left" | "right";
}> = ({ player, side }) => {
  const direction = side === "left" ? "row" : "row-reverse";
  const textAlign = side === "left" ? "flex-start" : "flex-end";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction,
        alignItems: "center",
        gap: 10,
      }}
    >
      <ModelAvatar player={player} size={50} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: textAlign,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.family,
            fontSize: FONTS.playerName.size,
            fontWeight: FONTS.playerName.weight,
            color: player.avatar_color,
            lineHeight: 1.2,
          }}
        >
          {player.display_name}
        </span>
        <span
          style={{
            fontFamily: FONTS.family,
            fontSize: FONTS.playerSub.size,
            fontWeight: FONTS.playerSub.weight,
            color: COLORS.textHint,
            lineHeight: 1.2,
          }}
        >
          {player.display_sub}
        </span>
      </div>
    </div>
  );
};

export const TopBar: React.FC<TopBarProps> = ({ players, score }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 0,
          right: 0,
          height: 90,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 60px",
          opacity,
        }}
      >
        {/* Player 1 — flush left */}
        <PlayerBadge player={players[0]} side="left" />

        {/* Score — center */}
        <div
          style={{
            fontFamily: FONTS.family,
            fontSize: FONTS.score.size,
            fontWeight: FONTS.score.weight,
            color: COLORS.textPrimary,
            textAlign: "center",
            flexShrink: 0,
            padding: "0 16px",
          }}
        >
          {score[0]} : {score[1]}
        </div>

        {/* Player 2 — flush right */}
        <PlayerBadge player={players[1]} side="right" />
      </div>
    </AbsoluteFill>
  );
};
