#!/usr/bin/env python3
"""Generate TTS announcement for a match replay using edge-tts."""

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

VOICE = "en-US-GuyNeural"

GAME_NAMES = {
    "blackjack": "Black Jack",
    "tictactoe": "Tic Tac Toe",
    "battleship": "Battleship",
    "chicken_game": "Chicken Game",
    "prisoners_dilemma": "Prisoner's Dilemma",
}


def build_text(replay: dict) -> str:
    meta = replay["metadata"]
    p1 = meta["players"][0]
    p2 = meta["players"][1]
    game = GAME_NAMES.get(meta["game_type"], meta["game_type"].replace("_", " ").title())

    name1 = f'{p1["display_name"]} {p1["display_sub"]}'
    name2 = f'{p2["display_name"]} {p2["display_sub"]}'

    return f"{name1} versus {name2}. {game}. Go."


async def generate(text: str, output: str) -> None:
    comm = edge_tts.Communicate(text, VOICE)
    await comm.save(output)


def main() -> None:
    if len(sys.argv) < 3:
        print("Usage: generate-tts.py <replay.json> <output.mp3>", file=sys.stderr)
        sys.exit(1)

    replay_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(replay_path) as f:
        replay = json.load(f)

    text = build_text(replay)
    print(f"TTS: {text}")

    asyncio.run(generate(text, output_path))
    print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
