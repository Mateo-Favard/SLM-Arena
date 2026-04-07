"""Abstract interface for render services (Dependency Inversion)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum


class RenderStatus(str, Enum):
    pending = "pending"
    rendering = "rendering"
    completed = "completed"
    failed = "failed"


@dataclass
class RenderJob:
    job_id: str
    status: RenderStatus
    output_path: str | None = None
    error: str | None = None
    duration_seconds: int | None = None


class RenderServiceInterface(ABC):
    """Contract for triggering video renders.

    Swap HTTP for local CLI, cloud render, etc.
    """

    @abstractmethod
    def submit_render(self, replay_path: str, output_path: str) -> RenderJob:
        """Submit a replay for video rendering. Returns the job handle."""

    @abstractmethod
    def get_render_status(self, job_id: str) -> RenderJob:
        """Check the status of a render job."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if the render service is reachable."""
