from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProjectStatus(StrEnum):
    planning = "planning"
    keyframing = "keyframing"
    rendering = "rendering"
    evaluating = "evaluating"
    completed = "completed"


class JobStatus(StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
    paused = "paused"
    resumable = "resumable"


class JobType(StrEnum):
    PLAN_PROJECT = "PLAN_PROJECT"
    GENERATE_KEYFRAME = "GENERATE_KEYFRAME"
    RENDER_CHUNK = "RENDER_CHUNK"
    STITCH_SHOT = "STITCH_SHOT"
    RENDER_AUDIO_LAYER = "RENDER_AUDIO_LAYER"
    MIX_AUDIO = "MIX_AUDIO"
    EVALUATE_CHUNK = "EVALUATE_CHUNK"
    REPAIR_CHUNK = "REPAIR_CHUNK"
    EXPORT_PROJECT = "EXPORT_PROJECT"


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1)
    script_prompt: str = Field(min_length=1)
    duration: int = 30
    aspect_ratio: str = "16:9"
    style_hint: str = ""
    audio_hint: str = ""


class ProjectFormat(BaseModel):
    aspect_ratio: str = "16:9"
    target_resolution: str = "1280x720"
    working_resolution: str = "832x480"
    fps: int = 24
    duration: int = 30


class ProjectStyle(BaseModel):
    visual: str = ""
    audio: str = ""


class Project(BaseModel):
    project_id: str
    title: str
    script_prompt: str
    created_at: str = Field(default_factory=now_iso)
    format: ProjectFormat
    style: ProjectStyle
    status: ProjectStatus = ProjectStatus.planning


class Character(BaseModel):
    character_id: str
    name: str
    appearance: str
    wardrobe: str
    personality: str
    reference_images: list[str] = []
    lock: dict[str, bool] = {"face": True, "wardrobe": True, "body_shape": True}


class Location(BaseModel):
    location_id: str
    name: str
    description: str
    lighting: str
    reference_images: list[str] = []
    persistent_props: list[str] = []


class Prop(BaseModel):
    prop_id: str
    name: str
    description: str
    importance: Literal["low", "medium", "high"] = "medium"
    lock_visual_identity: bool = True


class WorldState(BaseModel):
    project_id: str
    time_period: str = "unspecified"
    tone: str = "cinematic, controlled, local-first"
    characters: dict[str, Character]
    locations: dict[str, Location]
    props: dict[str, Prop]
    camera_style: dict[str, Any]


class Scene(BaseModel):
    scene_id: str
    title: str
    duration: float
    location: str
    dramatic_purpose: str
    characters: list[str]
    shots: list[str]


class Shot(BaseModel):
    shot_id: str
    scene_id: str
    duration: float
    purpose: str
    camera: dict[str, Any]
    visual_action: str
    characters: list[str]
    props: list[str]
    location: str
    continuity_rules: list[str]


class Chunk(BaseModel):
    chunk_id: str
    shot_id: str
    start: float
    end: float
    duration: float
    complexity: float
    render_status: str = "queued"
    locked: bool = False


class AudioVisualEvent(BaseModel):
    event_id: str
    shot_id: str
    time: float
    duration: float
    visual: dict[str, Any]
    audio: dict[str, Any]
    story_meaning: str


class RenderPlanChunk(BaseModel):
    chunk_id: str
    start: float
    end: float
    complexity: float
    steps: int
    resolution: str
    cache_strength: float
    required_refs: list[str]


class RenderPlan(BaseModel):
    shot_id: str
    chunks: list[RenderPlanChunk]


class CineGraph(BaseModel):
    world_state: WorldState
    scenes: list[Scene]
    shots: list[Shot]
    chunks: list[Chunk]
    audio_visual_events: list[AudioVisualEvent]
    render_plans: list[RenderPlan]


class ArtifactMetadata(BaseModel):
    artifact_id: str
    type: str
    path: str
    created_at: str = Field(default_factory=now_iso)
    renderer: str
    model: str = "mock"
    seed: int = 1234
    input_context: dict[str, Any] = {}
    render_budget: dict[str, Any] = {}
    outputs: dict[str, str | None] = {}


class EvaluationResult(BaseModel):
    chunk_id: str
    scores: dict[str, float]
    final_score: float
    repair_required: bool
    repair_reasons: list[str]


class Job(BaseModel):
    job_id: str
    project_id: str | None = None
    type: JobType
    target_id: str
    status: JobStatus = JobStatus.queued
    progress: float = 0.0
    created_at: str = Field(default_factory=now_iso)
    started_at: str | None = None
    ended_at: str | None = None
    error: str | None = None
    outputs: list[str] = []
    estimated_duration_sec: float | None = None
    elapsed_sec: float = 0.0
    remaining_sec: float | None = None


class KeyframeGenerateRequest(BaseModel):
    slots: list[Literal["first", "middle", "last"]] = ["first", "middle", "last"]
    renderer: str = "mock"


class RenderRequest(BaseModel):
    preset: str = "preview"
    renderer: str = "mock"
    audio: bool = True


class RepairRequest(BaseModel):
    repair_reasons: list[str] = []
    lock_existing_audio: bool = True


class AudioRenderRequest(BaseModel):
    layers: list[Literal["dialogue", "foley", "ambience", "music"]] = ["foley", "ambience", "music"]
    adapter: str = "mock_audio"


class ExportRequest(BaseModel):
    format: str = "mp4"
    resolution: str = "1280x720"
    include_audio: bool = True
