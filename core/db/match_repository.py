"""Simplified match repository — single matches table, no ELO."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class MatchRepository:

    def __init__(self, db_path: str = "./data/arena_v2.db"):
        self.db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self):
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                game_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                config TEXT,
                players TEXT,
                replay TEXT,
                winner_id TEXT,
                score TEXT,
                video_status TEXT DEFAULT 'none',
                video_path TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                duration_ms INTEGER
            )
        """)
        self._conn.commit()

    def create_match(self, match_id: str, game_type: str, config: dict, players: list[dict]) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            "INSERT INTO matches (id, game_type, status, config, players, created_at) VALUES (?, ?, 'queued', ?, ?, ?)",
            (match_id, game_type, json.dumps(config), json.dumps(players), now),
        )
        self._conn.commit()
        return self.get_match(match_id)

    def update_status(self, match_id: str, status: str):
        self._conn.execute("UPDATE matches SET status = ? WHERE id = ?", (status, match_id))
        self._conn.commit()

    def update_result(
        self,
        match_id: str,
        winner_id: str | None,
        score: str | None,
        replay: dict,
        duration_ms: int,
    ):
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            "UPDATE matches SET status = 'completed', winner_id = ?, score = ?, replay = ?, duration_ms = ?, completed_at = ? WHERE id = ?",
            (winner_id, score, json.dumps(replay), duration_ms, now, match_id),
        )
        self._conn.commit()

    def update_failed(self, match_id: str, error: str):
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            "UPDATE matches SET status = 'failed', score = ?, completed_at = ? WHERE id = ?",
            (json.dumps({"error": error}), now, match_id),
        )
        self._conn.commit()

    def update_video(self, match_id: str, video_status: str, video_path: str | None = None):
        self._conn.execute(
            "UPDATE matches SET video_status = ?, video_path = ? WHERE id = ?",
            (video_status, video_path, match_id),
        )
        self._conn.commit()

    def get_match(self, match_id: str) -> dict | None:
        row = self._conn.execute("SELECT * FROM matches WHERE id = ?", (match_id,)).fetchone()
        if not row:
            return None
        return self._row_to_dict(row)

    def list_matches(
        self,
        game_type: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict]:
        query = "SELECT * FROM matches WHERE 1=1"
        params: list[Any] = []
        if game_type:
            query += " AND game_type = ?"
            params.append(game_type)
        if status:
            query += " AND status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        rows = self._conn.execute(query, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def _row_to_dict(self, row: sqlite3.Row) -> dict:
        d = dict(row)
        for key in ("config", "players", "replay", "score"):
            if d.get(key) and isinstance(d[key], str):
                try:
                    d[key] = json.loads(d[key])
                except (json.JSONDecodeError, TypeError):
                    pass
        return d
