"""BlackJack GameService implementation for SLM Arena.

Both players receive the same cards each round and play against the same dealer.
After N rounds, the player with the most chips wins.
"""

from __future__ import annotations

import copy
import random
from typing import Any

from core.arena.models import ActionInfo, ActionOutcome, GameOverResult, ValidationResult
from core.games.game_server import register_game
from core.games.interface import GameServiceInterface

SUITS = ["hearts", "diamonds", "clubs", "spades"]
VALUES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]


def _card_points(value: str) -> list[int]:
    if value in ("J", "Q", "K"):
        return [10]
    if value == "A":
        return [1, 11]
    return [int(value)]


def _hand_value(hand: list[dict]) -> int:
    """Best hand value <= 21, or lowest bust value."""
    totals = [0]
    for card in hand:
        pts = _card_points(card["value"])
        new_totals = []
        for t in totals:
            for p in pts:
                new_totals.append(t + p)
        totals = list(set(new_totals))
    valid = [t for t in totals if t <= 21]
    return max(valid) if valid else min(totals)


def _build_deck(num_decks: int) -> list[dict]:
    deck = []
    for _ in range(num_decks):
        for suit in SUITS:
            for value in VALUES:
                deck.append({"suit": suit, "value": value})
    return deck


def _play_dealer(dealer_hand: list[dict], draw_pile: list[dict], draw_index: int) -> tuple[list[dict], int, int]:
    """Dealer hits until 17+. Returns (final_hand, final_value, new_draw_index)."""
    hand = list(dealer_hand)
    idx = draw_index
    while _hand_value(hand) < 17:
        hand.append(draw_pile[idx])
        idx += 1
    return hand, _hand_value(hand), idx


def _round_payout(player_value: int, player_bust: bool, player_blackjack: bool,
                   dealer_value: int, dealer_bust: bool, bet: int) -> int:
    """Calculate payout for a single round. Returns signed amount (+win, -loss, 0 push)."""
    if player_bust:
        return -bet
    if dealer_bust:
        return int(bet * 1.5) if player_blackjack else bet
    if player_blackjack and player_value == dealer_value:
        # Dealer also has 21 but player has blackjack (2 cards) — player wins
        return int(bet * 1.5)
    if player_value > dealer_value:
        return int(bet * 1.5) if player_blackjack else bet
    if player_value < dealer_value:
        return -bet
    return 0  # push


def _deal_round(rng: random.Random, num_decks: int) -> dict[str, Any]:
    """Deal a fresh round: player hand (2 cards), dealer hand (2 cards), draw pile."""
    deck = _build_deck(num_decks)
    rng.shuffle(deck)
    player_hand = [deck.pop(), deck.pop()]
    dealer_hand = [deck.pop(), deck.pop()]
    return {
        "player_hand": player_hand,
        "dealer_hand": dealer_hand,
        "draw_pile": deck,  # remaining cards for hits
    }


@register_game("blackjack")
class BlackJackGameService(GameServiceInterface):

    def init_game(self, config: dict[str, Any], seed: int) -> dict[str, Any]:
        num_rounds = config.get("num_rounds", 5)
        num_decks = config.get("num_decks", 1)
        starting_chips = config.get("starting_chips", 250)
        allowed_bets = config.get("allowed_bets", [10, 20, 50, 100, 150 ,200])

        # Pre-generate all rounds with a seeded RNG so both players face identical cards
        rng = random.Random(seed)
        rounds_deals = []
        for _ in range(num_rounds):
            rounds_deals.append(_deal_round(rng, num_decks))

        # Start round 1
        deal = rounds_deals[0]

        return {
            "config": config,
            "num_rounds": num_rounds,
            "allowed_bets": allowed_bets,
            "current_round": 1,
            # Pre-dealt rounds (immutable reference)
            "rounds_deals": rounds_deals,
            # Dealer for current round
            "dealer_hand": deal["dealer_hand"],
            "dealer_final_hand": None,
            "dealer_final_value": None,
            "draw_pile": deal["draw_pile"],
            # Phase: "player_1_betting" → "player_2_betting" → "player_1_playing" → "player_2_playing"
            "phase": "player_1_betting",
            # Per-player state for current round (independent, same starting hand)
            "player_1_hand": list(deal["player_hand"]),
            "player_1_value": _hand_value(deal["player_hand"]),
            "player_1_standing": False,
            "player_1_bust": False,
            "player_1_draw_index": 0,
            "player_1_bet": 0,
            "player_2_hand": list(deal["player_hand"]),
            "player_2_value": _hand_value(deal["player_hand"]),
            "player_2_standing": False,
            "player_2_bust": False,
            "player_2_draw_index": 0,
            "player_2_bet": 0,
            # Bankrolls
            "player_1_chips": starting_chips,
            "player_2_chips": starting_chips,
            # Round history
            "rounds_results": [],
            # Orchestrator fields
            "turn_order": ["player_1", "player_2"],
            "turn_index": 0,
            "game_over": False,
            "winner": None,
            "reason": None,
        }

    def get_rules_prompt(self, config: dict[str, Any]) -> str:
        num_rounds = config.get("num_rounds", 5)
        starting_chips = config.get("starting_chips", 250)
        allowed_bets = config.get("allowed_bets", [10, 20, 50, 100])
        bets_str = ", ".join(str(b) for b in allowed_bets)
        return f"""You are playing BlackJack against a dealer in the SLM Arena.
Another AI model receives the EXACT SAME cards as you each round. You cannot see their decisions.

## Rules
- You play {num_rounds} rounds of BlackJack against a dealer.
- You start with {starting_chips} chips.
- Each round has 2 phases:
  1. **Bet**: choose your wager from [{bets_str}]. You cannot bet more than your current chips.
  2. **Play**: you see your 2 cards and the dealer's face-up card, then choose "hit" or "stand".
- Card values: 2-10 = face value, J/Q/K = 10, A = 1 or 11 (best for you).
- If your hand exceeds 21, you "bust" and lose your bet immediately.
- After you stand, the dealer reveals their hidden card and hits until reaching 17+.
- Blackjack (21 with first 2 cards) pays 1.5x your bet.
- Win = +bet, Lose = -bet, Push (tie) = 0, Blackjack win = +1.5x bet.
- After {num_rounds} rounds, the AI with the most chips wins.

## Win condition
Have more chips than the other AI after {num_rounds} rounds. Your decisions (bets + hit/stand) are all that matter — you both get the same cards.

## Good example — Betting phase

State received:
```json
{{"phase": "betting", "your_chips": 250, "opponent_chips": 250, "round": 1, "total_rounds": 5}}
```

Good response:
```json
{{"action": {{"type": "bet", "amount": 20}}, "reasoning": "Round 1, starting conservatively to assess the game.", "strategy": "Bet small early, increase bets when ahead."}}
```

## Good example — Playing phase

State received:
```json
{{"your_hand": [{{"suit": "hearts", "value": "10"}}, {{"suit": "clubs", "value": "5"}}], "your_hand_value": 15, "dealer_face_up_card": {{"suit": "spades", "value": "6"}}, "your_bet": 20, "your_chips": 250, "opponent_chips": 250, "round": 1, "total_rounds": 5}}
```

Good response:
```json
{{"action": {{"type": "stand"}}, "reasoning": "Dealer shows 6, likely has 16. Dealer must hit and risks busting.", "strategy": "Stand on 12+ when dealer shows 4-6. Hit on 12+ when dealer shows 7+."}}
```

## Bad example

State received:
```json
{{"your_hand": [{{"suit": "hearts", "value": "K"}}, {{"suit": "clubs", "value": "9"}}], "your_hand_value": 19, "dealer_face_up_card": {{"suit": "diamonds", "value": "5"}}, "your_bet": 50, "your_chips": 200, "opponent_chips": 260, "round": 4, "total_rounds": 5}}
```

Bad response:
```json
{{"action": {{"type": "hit"}}}}
```
Why it's bad: hitting on 19 almost always busts. Standing on 19 is very strong against any dealer hand."""

    def get_state_schema(self) -> str:
        return """- "phase": either "betting" or "playing". Determines which action you must take.
- "your_hand": (playing phase only) array of card objects with "suit" and "value" fields.
- "your_hand_value": (playing phase only) integer, the current best total of your hand.
- "dealer_face_up_card": (playing phase only) the dealer's visible card.
- "your_bet": (playing phase only) integer, your current bet for this round.
- "your_chips": integer, your current chip count.
- "opponent_chips": integer, the other AI's current chip count.
- "round": integer, current round number.
- "total_rounds": integer, how many rounds in total.
- "allowed_bets": (betting phase only) array of valid bet amounts.
- "rounds_history": array of past round results (your payout and opponent payout per round)."""

    def get_player_view(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        opponent_id = "player_2" if player_id == "player_1" else "player_1"

        # Build rounds history (only show payouts, not hands)
        rounds_history = []
        for r in state["rounds_results"]:
            rounds_history.append({
                "round": r["round"],
                "your_payout": r[f"{player_id}_payout"],
                "opponent_payout": r[f"{opponent_id}_payout"],
            })

        is_betting = state["phase"].endswith("_betting")

        if is_betting:
            # Betting phase: no cards shown yet, just chips and allowed bets
            affordable = [b for b in state["allowed_bets"] if b <= state[f"{player_id}_chips"]]
            return {
                "phase": "betting",
                "your_chips": state[f"{player_id}_chips"],
                "opponent_chips": state[f"{opponent_id}_chips"],
                "round": state["current_round"],
                "total_rounds": state["num_rounds"],
                "allowed_bets": affordable,
                "rounds_history": rounds_history,
            }
        else:
            # Playing phase: show cards and current bet
            return {
                "phase": "playing",
                "your_hand": state[f"{player_id}_hand"],
                "your_hand_value": state[f"{player_id}_value"],
                "dealer_face_up_card": state["dealer_hand"][0],
                "your_bet": state[f"{player_id}_bet"],
                "your_chips": state[f"{player_id}_chips"],
                "opponent_chips": state[f"{opponent_id}_chips"],
                "round": state["current_round"],
                "total_rounds": state["num_rounds"],
                "rounds_history": rounds_history,
            }

    def get_available_actions(self, state: dict[str, Any], player_id: str) -> ActionInfo:
        phase = state["phase"]

        # Betting phase
        if phase == f"{player_id}_betting":
            affordable = [b for b in state["allowed_bets"] if b <= state[f"{player_id}_chips"]]
            if not affordable:
                return ActionInfo(format="", actions=[])
            bets_str = ", ".join(str(b) for b in affordable)
            return ActionInfo(
                format=f'Respond with {{"type": "bet", "amount": N}} where N is one of [{bets_str}]',
                actions=[{"type": "bet", "amount": b} for b in affordable],
            )

        # Playing phase
        if phase == f"{player_id}_playing":
            if state[f"{player_id}_standing"] or state[f"{player_id}_bust"]:
                return ActionInfo(format="", actions=[])
            return ActionInfo(
                format='Respond with {"type": "hit"} or {"type": "stand"}',
                actions=["hit", "stand"],
            )

        # Not this player's turn
        return ActionInfo(format="", actions=[])

    def validate_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> ValidationResult:
        if "type" not in action:
            return ValidationResult(valid=False, error='Action must have a "type" field.')

        action_type = action["type"]
        phase = state["phase"]

        # Betting phase validation
        if phase == f"{player_id}_betting":
            if action_type != "bet":
                return ValidationResult(valid=False, error=f'During betting phase, action type must be "bet", got "{action_type}".')
            amount = action.get("amount")
            if amount is None:
                return ValidationResult(valid=False, error='Bet action must have an "amount" field.')
            affordable = [b for b in state["allowed_bets"] if b <= state[f"{player_id}_chips"]]
            if amount not in affordable:
                return ValidationResult(valid=False, error=f'Invalid bet amount {amount}. Must be one of {affordable}.')
            return ValidationResult(valid=True)

        # Playing phase validation
        if action_type not in ("hit", "stand"):
            return ValidationResult(valid=False, error=f'Invalid action type "{action_type}". Must be "hit" or "stand".')

        if state[f"{player_id}_standing"]:
            return ValidationResult(valid=False, error="You have already chosen to stand.")

        if state[f"{player_id}_bust"]:
            return ValidationResult(valid=False, error="You have already busted.")

        return ValidationResult(valid=True)

    def apply_action(self, state: dict[str, Any], player_id: str, action: dict[str, Any]) -> tuple[dict[str, Any], ActionOutcome]:
        new_state = copy.deepcopy(state)
        action_type = action["type"]

        # Dealer action
        if player_id == "dealer":
            outcome = self._apply_dealer_action(new_state, action)
            return new_state, outcome

        # Betting action
        if action_type == "bet":
            amount = action["amount"]
            new_state[f"{player_id}_bet"] = amount
            self._advance_after_bet(new_state, player_id)
            return new_state, ActionOutcome(result="bet", details={"amount": amount})

        if action_type == "stand":
            new_state[f"{player_id}_standing"] = True
            self._maybe_advance_phase(new_state, player_id)
            return new_state, ActionOutcome(result="stand", details={})

        # Hit — draw from the player's independent draw index
        draw_idx = new_state[f"{player_id}_draw_index"]
        card = new_state["draw_pile"][draw_idx]
        new_state[f"{player_id}_draw_index"] = draw_idx + 1
        new_state[f"{player_id}_hand"].append(card)
        new_value = _hand_value(new_state[f"{player_id}_hand"])
        new_state[f"{player_id}_value"] = new_value

        if new_value > 21:
            new_state[f"{player_id}_bust"] = True
            self._maybe_advance_phase(new_state, player_id)
            return new_state, ActionOutcome(
                result="bust",
                details={"card_drawn": card, "new_value": new_value},
            )

        if new_value == 21:
            new_state[f"{player_id}_standing"] = True
            self._maybe_advance_phase(new_state, player_id)
            return new_state, ActionOutcome(
                result="blackjack" if len(new_state[f"{player_id}_hand"]) == 2 else "twenty_one",
                details={"card_drawn": card, "new_value": new_value},
            )

        return new_state, ActionOutcome(
            result="hit",
            details={"card_drawn": card, "new_value": new_value},
        )

    def get_auto_action(self, state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
        """Dealer plays automatically: hit until 17+, then stand."""
        if player_id != "dealer" or state["phase"] != "dealer_playing":
            return None
        dealer_value = _hand_value(state["dealer_hand"])
        if dealer_value < 17:
            return {"type": "hit"}
        return {"type": "stand"}

    def _advance_after_bet(self, state: dict[str, Any], player_id: str) -> None:
        """After a player bets, advance to next betting or playing phase."""
        if state["phase"] == "player_1_betting":
            state["phase"] = "player_2_betting"
        elif state["phase"] == "player_2_betting":
            state["phase"] = "player_1_playing"

    def _maybe_advance_phase(self, state: dict[str, Any], player_id: str) -> None:
        """After a player finishes (stand/bust/21), advance phase or start dealer."""
        if state["phase"] == "player_1_playing" and (state["player_1_standing"] or state["player_1_bust"]):
            state["phase"] = "player_2_playing"

        elif state["phase"] == "player_2_playing" and (state["player_2_standing"] or state["player_2_bust"]):
            # Both players done → dealer's turn
            state["phase"] = "dealer_playing"
            # Set up dealer draw index after both players' cards
            state["dealer_draw_index"] = max(state["player_1_draw_index"], state["player_2_draw_index"])

    def _apply_dealer_action(self, state: dict[str, Any], action: dict[str, Any]) -> ActionOutcome:
        """Apply a single dealer action (hit or stand)."""
        action_type = action["type"]

        if action_type == "hit":
            idx = state["dealer_draw_index"]
            card = state["draw_pile"][idx]
            state["dealer_draw_index"] = idx + 1
            state["dealer_hand"].append(card)
            dealer_value = _hand_value(state["dealer_hand"])

            if dealer_value > 21:
                # Dealer busts — score the round
                state["phase"] = "dealer_done"
                self._score_round(state)
                return ActionOutcome(result="bust", details={"card_drawn": card, "dealer_value": dealer_value})

            # Dealer still playing — stay in dealer_playing (get_auto_action will decide next)
            return ActionOutcome(result="hit", details={"card_drawn": card, "dealer_value": dealer_value})

        # Stand — dealer is done, score the round
        state["phase"] = "dealer_done"
        self._score_round(state)
        return ActionOutcome(result="stand", details={"dealer_value": _hand_value(state["dealer_hand"])})

    def _score_round(self, state: dict[str, Any]) -> None:
        """Compute payouts and advance to next round or end game. Dealer has already played."""
        p1_bet = state["player_1_bet"]
        p2_bet = state["player_2_bet"]

        dealer_hand = state["dealer_hand"]
        dealer_value = _hand_value(dealer_hand)
        dealer_bust = dealer_value > 21
        state["dealer_final_hand"] = list(dealer_hand)
        state["dealer_final_value"] = dealer_value

        p1_blackjack = state["player_1_value"] == 21 and len(state["player_1_hand"]) == 2
        p2_blackjack = state["player_2_value"] == 21 and len(state["player_2_hand"]) == 2

        p1_payout = _round_payout(state["player_1_value"], state["player_1_bust"], p1_blackjack, dealer_value, dealer_bust, p1_bet)
        p2_payout = _round_payout(state["player_2_value"], state["player_2_bust"], p2_blackjack, dealer_value, dealer_bust, p2_bet)

        state["player_1_chips"] += p1_payout
        state["player_2_chips"] += p2_payout

        state["rounds_results"].append({
            "round": state["current_round"],
            "player_1_hand": state["player_1_hand"],
            "player_1_value": state["player_1_value"],
            "player_1_bust": state["player_1_bust"],
            "player_1_payout": p1_payout,
            "player_2_hand": state["player_2_hand"],
            "player_2_value": state["player_2_value"],
            "player_2_bust": state["player_2_bust"],
            "player_2_payout": p2_payout,
            "dealer_hand": list(dealer_hand),
            "dealer_value": dealer_value,
            "dealer_bust": dealer_bust,
        })

        # Next round or game over
        if state["current_round"] >= state["num_rounds"]:
            state["game_over"] = True
            p1 = state["player_1_chips"]
            p2 = state["player_2_chips"]
            if p1 > p2:
                state["winner"] = "player_1"
                state["reason"] = "most_chips"
            elif p2 > p1:
                state["winner"] = "player_2"
                state["reason"] = "most_chips"
            else:
                state["winner"] = None
                state["reason"] = "draw"
        else:
            # Deal next round
            state["current_round"] += 1
            deal = state["rounds_deals"][state["current_round"] - 1]
            state["dealer_hand"] = deal["dealer_hand"]
            state["dealer_final_hand"] = None
            state["dealer_final_value"] = None
            state["draw_pile"] = deal["draw_pile"]
            state["phase"] = "player_1_betting"
            for pid in ["player_1", "player_2"]:
                state[f"{pid}_hand"] = list(deal["player_hand"])
                state[f"{pid}_value"] = _hand_value(deal["player_hand"])
                state[f"{pid}_standing"] = False
                state[f"{pid}_bust"] = False
                state[f"{pid}_draw_index"] = 0
                state[f"{pid}_bet"] = 0

    def get_next_player(self, state: dict[str, Any]) -> str:
        phase = state["phase"]
        if phase in ("player_1_betting", "player_1_playing"):
            return "player_1"
        if phase in ("player_2_betting", "player_2_playing"):
            return "player_2"
        if phase == "dealer_playing":
            return "dealer"
        return state["turn_order"][0]

    def get_max_turns(self, config: dict[str, Any]) -> int:
        # Each round: up to ~10 hits per player (very generous). 2 players per round.
        num_rounds = config.get("num_rounds", 5)
        return num_rounds * 20

    def is_game_over(self, state: dict[str, Any]) -> GameOverResult:
        if not state["game_over"]:
            return GameOverResult(over=False)
        return GameOverResult(
            over=True,
            winner_id=state["winner"],
            reason=state["reason"],
        )

    def get_player_stats(self, state: dict[str, Any], player_id: str) -> dict[str, Any]:
        rounds_won = 0
        rounds_lost = 0
        rounds_pushed = 0
        total_busts = 0
        for r in state["rounds_results"]:
            payout = r[f"{player_id}_payout"]
            if payout > 0:
                rounds_won += 1
            elif payout < 0:
                rounds_lost += 1
            else:
                rounds_pushed += 1
            if r[f"{player_id}_bust"]:
                total_busts += 1
        return {
            "final_chips": state[f"{player_id}_chips"],
            "rounds_won": rounds_won,
            "rounds_lost": rounds_lost,
            "rounds_pushed": rounds_pushed,
            "total_busts": total_busts,
        }
