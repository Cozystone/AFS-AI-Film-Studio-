from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from .schemas import Job, Project


class LocalStore:
    def __init__(self) -> None:
        self.root = Path(os.getenv("AFS_STORAGE_ROOT", "storage"))
        self.projects_root = self.root / "projects"
        self.db_path = Path(os.getenv("AFS_DATABASE_PATH", self.root / "afs.sqlite"))
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS projects (project_id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, project_id TEXT, type TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL)"
            )

    def project_dir(self, project_id: str) -> Path:
        path = self.projects_root / project_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def write_json(self, path: Path, data: Any) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        if hasattr(data, "model_dump"):
            payload = data.model_dump(mode="json")
        else:
            payload = data
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        return path

    def read_json(self, path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))

    def save_project(self, project: Project) -> None:
        path = self.project_dir(project.project_id) / "project.json"
        self.write_json(path, project)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO projects(project_id, title, status, path, created_at) VALUES (?, ?, ?, ?, ?)",
                (project.project_id, project.title, project.status.value, str(path), project.created_at),
            )

    def get_project(self, project_id: str) -> Project:
        path = self.project_dir(project_id) / "project.json"
        return Project.model_validate(self.read_json(path))

    def list_projects(self) -> list[Project]:
        with self._connect() as conn:
            rows = conn.execute("SELECT path FROM projects ORDER BY created_at DESC").fetchall()
        return [Project.model_validate(self.read_json(Path(row["path"]))) for row in rows]

    def save_job(self, job: Job) -> None:
        base = self.project_dir(job.project_id) if job.project_id else self.root / "jobs"
        path = base / "jobs" / f"{job.job_id}.json"
        self.write_json(path, job)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO jobs(job_id, project_id, type, target_id, status, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (job.job_id, job.project_id, job.type.value, job.target_id, job.status.value, str(path), job.created_at),
            )

    def get_job(self, job_id: str) -> Job:
        with self._connect() as conn:
            row = conn.execute("SELECT path FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if not row:
            raise FileNotFoundError(job_id)
        return Job.model_validate(self.read_json(Path(row["path"])))

    def list_jobs(self) -> list[Job]:
        with self._connect() as conn:
            rows = conn.execute("SELECT path FROM jobs ORDER BY created_at DESC").fetchall()
        return [Job.model_validate(self.read_json(Path(row["path"]))) for row in rows]
