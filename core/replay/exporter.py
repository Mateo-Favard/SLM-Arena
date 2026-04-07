"""Export ReplayJSON to disk."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from core.arena.models import ReplayJSON

logger = logging.getLogger(__name__)


def export_replay(replay: ReplayJSON, output_dir: str) -> str:
    """Write the replay JSON to a file. Returns the file path."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    meta = replay.metadata
    ts = meta.started_at.strftime("%Y-%m-%d_%H%M%S")
    p1_name = meta.players[0].model_name.replace("/", "-")
    p2_name = meta.players[1].model_name.replace("/", "-")
    filename = f"{ts}_{meta.game_type}_{p1_name}_vs_{p2_name}_seed{meta.seed}.json"
    filepath = os.path.join(output_dir, filename)

    data = replay.model_dump(mode="json")
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger.info("Replay exported: %s", filepath)
    return filepath
