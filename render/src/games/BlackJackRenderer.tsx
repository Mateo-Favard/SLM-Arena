import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BlackJackState, Card, PlayerInfo, PlayerStats, ReplayTurn } from "../types";
import { COLORS } from "../theme/colors";
import { FONTS } from "../theme/typography";
import { TIMING } from "../theme/timing";
import type { GameRendererInterface } from "./GameRendererInterface";

// ─── Layout constants ───────────────────────────────────────────────────────

// Layout: TopBar at ~200, game table compact below, centered lower
const TABLE_MARGIN = 60;
const TABLE_PADDING = 16;
const TABLE_TOP = 340;    // below TopBar (at 200) + round dots + gap
const TABLE_BOTTOM = 1580; // symmetric bottom dead zone // symmetric
const TABLE_RADIUS = 24;

const CARD_W = 80;
const CARD_H = 115;
const CARD_OVERLAP = -20;
const CARD_RADIUS = 10;

// Vertical zones inside the table — fill the space evenly
const TABLE_H = TABLE_BOTTOM - TABLE_TOP;
const DEALER_Y = TABLE_TOP + 30;
const DEALER_ZONE_H = Math.floor(TABLE_H * 0.36);
const PLAYERS_Y = DEALER_Y + DEALER_ZONE_H + 16;
const PLAYER_ZONE_H = TABLE_BOTTOM - PLAYERS_Y - 16;

// Half-width for side-by-side player zones (with inner padding + gap)
const TABLE_INNER_W = 1080 - TABLE_MARGIN * 2 - TABLE_PADDING * 2;
const PLAYER_GAP = 16;
const HALF_W = (TABLE_INNER_W - PLAYER_GAP) / 2;

// ─── Hand value (mirrors Python _hand_value exactly) ────────────────────────

function handValue(cards: Card[]): number {
  let totals = [0];
  for (const card of cards) {
    const pts =
      card.value === "A"
        ? [1, 11]
        : ["J", "Q", "K"].includes(card.value)
          ? [10]
          : [parseInt(card.value)];
    const next: number[] = [];
    for (const t of totals) {
      for (const p of pts) next.push(t + p);
    }
    totals = [...new Set(next)];
  }
  const valid = totals.filter((t) => t <= 21);
  return valid.length > 0 ? Math.max(...valid) : Math.min(...totals);
}

// ─── Suit symbols ───────────────────────────────────────────────────────────

const SUIT: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

// ─── Stagger delay per card in frames (for dealing animation) ───────────────

const CARD_STAGGER = 4; // ~130ms between each card

// ─── Card component ─────────────────────────────────────────────────────────

const CardFace: React.FC<{
  card: Card;
  index: number;
  isNew: boolean;
  animStart: number;
  staggerIndex?: number; // position in the stagger sequence (0, 1, 2...)
}> = ({ card, index, isNew, animStart, staggerIndex = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const val = card.value === "10" ? "10" : card.value.charAt(0).toUpperCase();
  const suit = SUIT[card.suit] ?? "?";
  const red = card.suit === "hearts" || card.suit === "diamonds";

  const delay = isNew ? staggerIndex * CARD_STAGGER : 0;
  const scale = isNew
    ? spring({ frame: frame - animStart - delay, fps, config: { damping: 12 } })
    : 1;

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: CARD_RADIUS,
        backgroundColor: isNew ? COLORS.surfaceHighlight : COLORS.surface,
        border: `2px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        marginLeft: index > 0 ? CARD_OVERLAP : 0,
        transform: `scale(${scale})`,
        position: "relative",
        zIndex: index,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize: 26,
          fontWeight: FONTS.cardValue.weight,
          color: red ? "#FF6B6B" : COLORS.textPrimary,
          lineHeight: 1,
        }}
      >
        {val}
      </span>
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize: 16,
          color: red ? "#FF6B6B" : COLORS.textMuted,
          lineHeight: 1,
          marginTop: 2,
        }}
      >
        {suit}
      </span>
    </div>
  );
};

const CardHidden: React.FC<{ index: number }> = ({ index }) => (
  <div
    style={{
      width: CARD_W,
      height: CARD_H,
      borderRadius: CARD_RADIUS,
      backgroundColor: COLORS.surface,
      border: `2px solid ${COLORS.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginLeft: index > 0 ? CARD_OVERLAP : 0,
      position: "relative",
      zIndex: index,
    }}
  >
    <span
      style={{
        fontFamily: FONTS.family,
        fontSize: 24,
        color: COLORS.textHint,
      }}
    >
      ?
    </span>
  </div>
);

// ─── Value badge ────────────────────────────────────────────────────────────

const ValueBadge: React.FC<{
  value: number;
  bust: boolean;
  standing: boolean;
  size?: "sm" | "md";
}> = ({ value, bust, standing, size = "md" }) => {
  const fontSize = size === "sm" ? 20 : 26;
  const labelSize = size === "sm" ? 11 : 13;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          fontFamily: FONTS.family,
          fontSize,
          fontWeight: 600,
          color: bust ? "#FF6B6B" : COLORS.textPrimary,
        }}
      >
        {value}
      </span>
      {bust && (
        <span
          style={{
            fontFamily: FONTS.family,
            fontSize: labelSize,
            fontWeight: 500,
            color: "#FF6B6B",
            textTransform: "uppercase",
          }}
        >
          BUST
        </span>
      )}
      {standing && !bust && (
        <span
          style={{
            fontFamily: FONTS.family,
            fontSize: labelSize,
            fontWeight: 500,
            color: COLORS.textMuted,
            textTransform: "uppercase",
          }}
        >
          STAND
        </span>
      )}
    </div>
  );
};

// ─── Table surface (single rounded container) ──────────────────────────────

const TableSurface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      top: TABLE_TOP,
      left: TABLE_MARGIN,
      right: TABLE_MARGIN,
      bottom: 1920 - TABLE_BOTTOM,
      borderRadius: TABLE_RADIUS,
      border: `2px solid ${COLORS.border}`,
      backgroundColor: "#191920",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

// ─── Dealer zone (centered top of table) ────────────────────────────────────

const DEALER_HIGHLIGHT = "#FFD700"; // gold accent for active dealer

const DealerZone: React.FC<{
  hand: Card[];
  prevHand: Card[] | null;
  finalHand: Card[] | null;
  finalValue: number | null;
  phase: string;
  animStart: number;
  isActive: boolean;
}> = ({ hand, prevHand, finalHand, finalValue, phase, animStart, isActive }) => {
  const dealerPlaying = phase === "dealer_playing";
  const roundScored = finalHand != null;

  // Which cards to display and how
  let display: Card[];
  let showHidden = false;
  let val: number | null = null;
  let firstNewIndex = 0;

  if (roundScored) {
    // Round just scored — show final dealer hand
    display = finalHand;
    val = finalValue;
    // Animate all cards from index 1+ (hidden card reveal + draws)
    firstNewIndex = 1;
  } else if (dealerPlaying) {
    // Dealer is drawing cards one by one — all face-up
    display = hand;
    val = handValue(hand);
    // Detect new cards vs previous state
    const prevLen = prevHand?.length ?? 0;
    firstNewIndex = prevLen;
  } else {
    // Players still playing — show hand with second card hidden
    display = hand;
    showHidden = true;
    firstNewIndex = hand.length; // no new cards to animate
  }

  const bust = val != null && val > 21;

  return (
    <div
      style={{
        position: "absolute",
        top: DEALER_Y - TABLE_TOP,
        left: 0,
        right: 0,
        height: DEALER_ZONE_H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {/* Dealer container */}
      <div
        style={{
          width: 380,
          padding: "24px 30px",
          borderRadius: 20,
          backgroundColor: COLORS.surface,
          border: `1px solid ${isActive ? DEALER_HIGHLIGHT + "60" : COLORS.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          style={{
            fontFamily: FONTS.family,
            fontSize: 12,
            fontWeight: 500,
            color: isActive ? DEALER_HIGHLIGHT : COLORS.textHint,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          Dealer
        </span>

        <div style={{ display: "flex", alignItems: "center" }}>
          {display.map((c, i) => {
            if (showHidden && i === 1) {
              return <CardHidden key="hidden" index={i} />;
            }
            const isNew = i >= firstNewIndex;
            return (
              <CardFace
                key={`d-${c.suit}-${c.value}-${i}`}
                card={c}
                index={i}
                isNew={isNew}
                animStart={animStart}
                staggerIndex={isNew ? i - firstNewIndex : 0}
              />
            );
          })}
        </div>

        {val != null && (
          <ValueBadge value={val} bust={bust} standing={!dealerPlaying && !bust} size="sm" />
        )}
      </div>
    </div>
  );
};

// ─── Player zone (fits in half-width) ───────────────────────────────────────

const PlayerZone: React.FC<{
  cards: Card[];
  prevCards: Card[] | null;
  value: number;
  bust: boolean;
  standing: boolean;
  bet: number;
  chips: number;
  player: PlayerInfo;
  side: "left" | "right";
  animStart: number;
  isActive: boolean;
}> = ({
  cards,
  prevCards,
  value,
  bust,
  standing,
  bet,
  chips,
  player,
  side,
  animStart,
  isActive,
}) => {
  const left = side === "left" ? TABLE_PADDING : TABLE_PADDING + HALF_W + PLAYER_GAP;

  // Detect new cards by comparing with previous state
  const prevLen = prevCards?.length ?? 0;
  const handsChanged = prevCards == null
    || prevLen !== cards.length
    || (prevLen > 0 && cards.length > 0 && (prevCards[0].suit !== cards[0].suit || prevCards[0].value !== cards[0].value));
  const isNewRound = handsChanged && cards.length >= 2 && (prevLen === 0 || (prevCards != null && prevCards[0].suit !== cards[0].suit));
  const firstNewIndex = isNewRound ? 0 : prevLen;

  return (
    <div
      style={{
        position: "absolute",
        top: PLAYERS_Y - TABLE_TOP,
        left,
        width: HALF_W,
        height: PLAYER_ZONE_H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        opacity: isActive ? 1 : 0.55,
        padding: 0,
      }}
    >
      {/* Player container */}
      <div
        style={{
          width: "100%",
          padding: "20px 16px",
          borderRadius: 20,
          backgroundColor: COLORS.surface,
          border: `1px solid ${isActive ? player.avatar_color + "60" : COLORS.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Name + chips row */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.family,
              fontSize: 16,
              fontWeight: 600,
              color: player.avatar_color,
              lineHeight: 1.2,
            }}
          >
            {player.display_name}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontFamily: FONTS.family,
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.textPrimary,
                padding: "1px 8px",
                borderRadius: 8,
                backgroundColor: "#141416",
                border: `1px solid ${COLORS.border}`,
              }}
            >
              {chips}
            </span>
            {bet > 0 && (
              <span
                style={{
                  fontFamily: FONTS.family,
                  fontSize: 12,
                  fontWeight: 500,
                  color: player.avatar_color,
                }}
              >
                BET {bet}
              </span>
            )}
          </div>
        </div>

        {/* Cards */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          {cards.map((c, i) => (
            <CardFace
              key={`${c.suit}-${c.value}-${i}`}
              card={c}
              index={i}
              isNew={i >= firstNewIndex}
              animStart={animStart}
              staggerIndex={i - firstNewIndex}
            />
          ))}
        </div>

        {/* Value badge */}
        <ValueBadge value={value} bust={bust} standing={standing} size="sm" />
      </div>
    </div>
  );
};

// ─── Round dots ─────────────────────────────────────────────────────────────

const RoundDots: React.FC<{ current: number; total: number }> = ({
  current,
  total,
}) => (
  <div
    style={{
      position: "absolute",
      top: TABLE_TOP - 30,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 6,
    }}
  >
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        style={{
          width: i + 1 === current ? 20 : 7,
          height: 7,
          borderRadius: 4,
          backgroundColor:
            i + 1 < current
              ? COLORS.textMuted
              : i + 1 === current
                ? COLORS.textPrimary
                : COLORS.border,
        }}
      />
    ))}
    <span
      style={{
        fontFamily: FONTS.family,
        fontSize: 12,
        color: COLORS.textHint,
        marginLeft: 4,
      }}
    >
      {current}/{total}
    </span>
  </div>
);

// ─── Payout flash (inside the table, between dealer and players) ────────────

const PayoutFlash: React.FC<{
  round: BlackJackState["rounds_results"][0];
  players: [PlayerInfo, PlayerInfo];
}> = ({ round, players }) => {
  const items = [
    { payout: round.player_1_payout, color: players[0].avatar_color },
    { payout: round.player_2_payout, color: players[1].avatar_color },
  ];

  return (
    <div
      style={{
        position: "absolute",
        top: PLAYERS_Y - TABLE_TOP - 40,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 80,
      }}
    >
      {items.map((it, i) => (
        <span
          key={i}
          style={{
            fontFamily: FONTS.family,
            fontSize: 24,
            fontWeight: 700,
            color:
              it.payout > 0
                ? "#4ADE80"
                : it.payout < 0
                  ? "#FF6B6B"
                  : COLORS.textMuted,
          }}
        >
          {it.payout > 0 ? `+${it.payout}` : it.payout === 0 ? "push" : it.payout}
        </span>
      ))}
    </div>
  );
};

// ─── Board (main export) ────────────────────────────────────────────────────

interface BlackJackBoardProps {
  state: BlackJackState;
  prevState: BlackJackState | null;
  players: [PlayerInfo, PlayerInfo];
  turnStartFrame: number;
  actionType: string | null;
}

export const BlackJackBoard: React.FC<BlackJackBoardProps> = ({
  state,
  prevState,
  players,
  turnStartFrame,
}) => {
  const phase = state.phase ?? "";

  // Detect dealer reveal: rounds_results grew since previous turn
  const prevRoundsCount = prevState?.rounds_results?.length ?? 0;
  const curRoundsCount = state.rounds_results?.length ?? 0;
  const roundJustEnded = curRoundsCount > prevRoundsCount;

  // Get dealer display data
  let dealerDisplayHand: Card[] = state.dealer_hand;
  let dealerDisplayValue: number | null = null;
  let dealerRevealed = false;
  let lastRound: BlackJackState["rounds_results"][0] | null = null;

  if (state.dealer_final_hand) {
    dealerDisplayHand = state.dealer_final_hand;
    dealerDisplayValue = state.dealer_final_value;
    dealerRevealed = true;
    if (curRoundsCount > 0) lastRound = state.rounds_results[curRoundsCount - 1];
  } else if (roundJustEnded && curRoundsCount > 0) {
    lastRound = state.rounds_results[curRoundsCount - 1];
    dealerDisplayHand = lastRound.dealer_hand;
    dealerDisplayValue = lastRound.dealer_value;
    dealerRevealed = true;
  }

  // During resolution (round just scored), freeze player hands from rounds_results
  // so they show the hands that won/bust, not the new round's deal
  const showResolution = roundJustEnded && lastRound != null;

  const p1Cards = showResolution ? lastRound!.player_1_hand : state.player_1_hand;
  const p1Value = showResolution ? lastRound!.player_1_value : state.player_1_value;
  const p1Bust = showResolution ? lastRound!.player_1_bust : state.player_1_bust;
  const p2Cards = showResolution ? lastRound!.player_2_hand : state.player_2_hand;
  const p2Value = showResolution ? lastRound!.player_2_value : state.player_2_value;
  const p2Bust = showResolution ? lastRound!.player_2_bust : state.player_2_bust;

  return (
    <>
      <RoundDots current={showResolution ? lastRound!.round : state.current_round} total={state.num_rounds} />

      <TableSurface>
        <DealerZone
          hand={state.dealer_hand}
          prevHand={prevState?.dealer_hand ?? null}
          finalHand={dealerRevealed ? dealerDisplayHand : null}
          finalValue={dealerRevealed ? dealerDisplayValue : null}
          phase={phase}
          animStart={turnStartFrame}
          isActive={phase === "dealer_playing"}
        />

        {dealerRevealed && lastRound && (
          <PayoutFlash round={lastRound} players={players} />
        )}

        <PlayerZone
          cards={p1Cards}
          prevCards={showResolution ? null : (prevState?.player_1_hand ?? null)}
          value={p1Value}
          bust={p1Bust}
          standing={showResolution ? true : state.player_1_standing}
          bet={state.player_1_bet}
          chips={state.player_1_chips}
          player={players[0]}
          side="left"
          animStart={turnStartFrame}
          isActive={!showResolution && phase.startsWith("player_1")}
        />

        <PlayerZone
          cards={p2Cards}
          prevCards={showResolution ? null : (prevState?.player_2_hand ?? null)}
          value={p2Value}
          bust={p2Bust}
          standing={showResolution ? true : state.player_2_standing}
          bet={state.player_2_bet}
          chips={state.player_2_chips}
          player={players[1]}
          side="right"
          animStart={turnStartFrame}
          isActive={!showResolution && phase.startsWith("player_2")}
        />
      </TableSurface>
    </>
  );
};

// ─── Victory glow ───────────────────────────────────────────────────────────

interface BlackJackVictoryProps {
  state: BlackJackState;
  winnerId: string | null;
  winnerColor: string;
  startFrame: number;
}

export const BlackJackVictory: React.FC<BlackJackVictoryProps> = ({
  winnerId,
  winnerColor,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const rel = frame - startFrame;
  if (rel < 0 || !winnerId) return null;

  const opacity = interpolate(rel, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Glow around the winning player's container
  const left = winnerId === "player_1"
    ? TABLE_MARGIN + TABLE_PADDING
    : TABLE_MARGIN + TABLE_PADDING + HALF_W + PLAYER_GAP;
  const top = PLAYERS_Y;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: left + 10,
        width: HALF_W - 20,
        height: PLAYER_ZONE_H - 30,
        borderRadius: 20,
        boxShadow: `0 0 60px ${winnerColor}40`,
        border: `2px solid ${winnerColor}60`,
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

// ─── GameRendererInterface implementation ───────────────────────────────────

export const blackjackRenderer: GameRendererInterface = {
  renderBoard({ state, prevState, turn, players, turnStartFrame }) {
    const bjState = state as unknown as BlackJackState;
    const bjPrevState = prevState as unknown as BlackJackState | null;
    const actionType = turn?.action
      ? (turn.action as Record<string, string>).type
      : null;

    return (
      <BlackJackBoard
        state={bjState}
        prevState={bjPrevState}
        players={players}
        turnStartFrame={turnStartFrame}
        actionType={actionType}
      />
    );
  },

  renderVictory({ state, winnerId, winnerColor, startFrame }) {
    return (
      <BlackJackVictory
        state={state as unknown as BlackJackState}
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
    const bjState = state as unknown as BlackJackState;
    return {
      player1: String(bjState.player_1_chips ?? 0),
      player2: String(bjState.player_2_chips ?? 0),
      label: "chips",
    };
  },

  formatOutroStats(playerStats, playerId) {
    const ps = playerStats.find((s) => s.player_id === playerId);
    if (!ps) return [];
    const gs = ps.game_stats as Record<string, unknown>;
    return [
      { label: "Final chips", value: String(gs.final_chips ?? "?") },
      { label: "Rounds won", value: String(gs.rounds_won ?? 0) },
      { label: "Busts", value: String(gs.busts ?? 0) },
      { label: "Avg response", value: `${ps.avg_response_ms}ms` },
    ];
  },

  getSfxEvents(turn) {
    if (turn.skipped) return [{ sfx: "universal/round_change.wav", frameOffset: 0, volume: 0.4 }];
    const action = turn.action as Record<string, string> | null;
    if (!action) return [];

    const isDealer = turn.player_id === "dealer";
    const state = turn.state_after as unknown as BlackJackState;

    // Dealer resolution — cash + optional bust
    if (isDealer && action.type === "stand") {
      return [{ sfx: "blackjack/cash.wav", frameOffset: 0, volume: 0.6 }];
    }
    if (isDealer && action.type === "hit") {
      const dealerVal = handValue(state.dealer_hand);
      if (dealerVal > 21) {
        // Dealer bust → bust sound + cash
        return [
          { sfx: "blackjack/bust.wav", frameOffset: 0, volume: 0.5 },
          { sfx: "blackjack/cash.wav", frameOffset: 4, volume: 0.5 },
        ];
      }
      return [{ sfx: "blackjack/card_deal.wav", frameOffset: 0, volume: 0.4 }];
    }

    // Player hit — check if bust
    if (action.type === "hit") {
      const pid = turn.player_id as "player_1" | "player_2";
      if (state[`${pid}_bust`]) {
        return [
          { sfx: "blackjack/card_deal.wav", frameOffset: 0, volume: 0.5 },
          { sfx: "blackjack/bust.wav", frameOffset: 4, volume: 0.5 },
        ];
      }
      return [{ sfx: "blackjack/card_deal.wav", frameOffset: 0, volume: 0.5 }];
    }

    if (action.type === "stand") return [{ sfx: "blackjack/stand.wav", frameOffset: 0, volume: 0.4 }];
    if (action.type === "bet") return [{ sfx: "blackjack/cash.wav", frameOffset: 0, volume: 0.3 }];
    return [];
  },
};
