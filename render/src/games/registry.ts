/**
 * Game renderer registry — maps game_type to its renderer.
 * Adding a new game = implement GameRendererInterface + add one line here.
 */

import { GameRendererInterface } from "./GameRendererInterface";
import { blackjackRenderer } from "./BlackJackRenderer";
import { tictactoeRenderer } from "./TicTacToeRenderer";
import { battleshipRenderer } from "./BattleshipRenderer";
import { chickenGameRenderer } from "./ChickenGameRenderer";

const RENDERERS: Record<string, GameRendererInterface> = {
  blackjack: blackjackRenderer,
  tictactoe: tictactoeRenderer,
  battleship: battleshipRenderer,
  chicken_game: chickenGameRenderer,
};

export function getRenderer(gameType: string): GameRendererInterface | null {
  return RENDERERS[gameType] ?? null;
}

export function getRegisteredGameTypes(): string[] {
  return Object.keys(RENDERERS);
}
