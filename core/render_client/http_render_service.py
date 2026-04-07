"""HTTP implementation of RenderServiceInterface — calls the Remotion render service."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import httpx

from core.render_client.interface import RenderJob, RenderServiceInterface, RenderStatus

logger = logging.getLogger(__name__)


class HttpRenderService(RenderServiceInterface):
    """Calls the Remotion Express render service over HTTP."""

    def __init__(self, base_url: str = "http://localhost:3000", timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def submit_render(self, replay_path: str, output_path: str) -> RenderJob:
        replay_data = json.loads(Path(replay_path).read_text())

        response = httpx.post(
            f"{self.base_url}/render",
            json={"replay": replay_data, "output_path": output_path},
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()

        logger.info("Render submitted: job_id=%s, output=%s", data["job_id"], output_path)
        return RenderJob(
            job_id=data["job_id"],
            status=RenderStatus.rendering,
            output_path=output_path,
        )

    def get_render_status(self, job_id: str) -> RenderJob:
        response = httpx.get(
            f"{self.base_url}/status/{job_id}",
            timeout=self.timeout,
        )
        response.raise_for_status()
        data = response.json()

        status_map = {
            "rendering": RenderStatus.rendering,
            "completed": RenderStatus.completed,
            "failed": RenderStatus.failed,
        }

        return RenderJob(
            job_id=job_id,
            status=status_map.get(data["status"], RenderStatus.failed),
            output_path=data.get("output_path"),
            error=data.get("error"),
            duration_seconds=data.get("duration_seconds"),
        )

    def is_available(self) -> bool:
        try:
            response = httpx.get(f"{self.base_url}/health", timeout=3)
            return response.status_code == 200
        except Exception:
            return False
