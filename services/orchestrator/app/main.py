from __future__ import annotations

import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .pipeline import complete_job, create_job, mock_plan, render_mock_audio, render_mock_chunk, write_placeholder_keyframes
from .schemas import (
    AudioRenderRequest,
    CineGraph,
    ExportRequest,
    Job,
    JobType,
    KeyframeGenerateRequest,
    Project,
    ProjectCreate,
    ProjectFormat,
    ProjectStyle,
    RenderRequest,
    RepairRequest,
)
from .storage import LocalStore

app = FastAPI(title="AFS Orchestrator", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = LocalStore()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "afs-orchestrator"}


@app.post("/api/projects")
def create_project(payload: ProjectCreate) -> dict:
    project_id = f"proj_{uuid.uuid4().hex[:8]}"
    project = Project(
        project_id=project_id,
        title=payload.title,
        script_prompt=payload.script_prompt,
        format=ProjectFormat(aspect_ratio=payload.aspect_ratio, duration=payload.duration),
        style=ProjectStyle(visual=payload.style_hint, audio=payload.audio_hint),
    )
    project_dir = store.project_dir(project_id)
    for relative in ["characters", "locations", "props", "scenes", "shots", "exports"]:
        (project_dir / relative).mkdir(parents=True, exist_ok=True)
    store.save_project(project)
    return {"project_id": project_id, "status": project.status.value}


@app.get("/api/projects")
def list_projects() -> list[Project]:
    return store.list_projects()


@app.get("/api/projects/{project_id}")
def get_project(project_id: str) -> Project:
    try:
        return store.get_project(project_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="project not found") from exc


@app.post("/api/projects/{project_id}/plan")
def generate_plan(project_id: str) -> CineGraph:
    project = store.get_project(project_id)
    job = create_job(store, JobType.PLAN_PROJECT, project_id, project_id)
    graph = mock_plan(project)
    project_dir = store.project_dir(project_id)
    store.write_json(project_dir / "world_state.json", graph.world_state)
    store.write_json(project_dir / "cinegraph.json", graph)
    store.write_json(project_dir / "render_plan.json", {"render_plans": [plan.model_dump(mode="json") for plan in graph.render_plans]})
    complete_job(store, job, [str(project_dir / "cinegraph.json")])
    return graph


def _find_project_for_shot(shot_id: str) -> tuple[str, CineGraph]:
    for project in store.list_projects():
        graph_path = store.project_dir(project.project_id) / "cinegraph.json"
        if graph_path.exists():
            graph = CineGraph.model_validate(store.read_json(graph_path))
            if any(shot.shot_id == shot_id for shot in graph.shots):
                return project.project_id, graph
    raise HTTPException(status_code=404, detail="shot not found")


def _find_project_for_chunk(chunk_id: str) -> tuple[str, CineGraph]:
    for project in store.list_projects():
        graph_path = store.project_dir(project.project_id) / "cinegraph.json"
        if graph_path.exists():
            graph = CineGraph.model_validate(store.read_json(graph_path))
            if any(chunk.chunk_id == chunk_id for chunk in graph.chunks):
                return project.project_id, graph
    raise HTTPException(status_code=404, detail="chunk not found")


@app.post("/api/shots/{shot_id}/keyframes/generate")
def generate_keyframes(shot_id: str, payload: KeyframeGenerateRequest) -> dict:
    project_id, _ = _find_project_for_shot(shot_id)
    job = create_job(store, JobType.GENERATE_KEYFRAME, shot_id, project_id)
    outputs = write_placeholder_keyframes(store, project_id, shot_id, payload.slots)
    complete_job(store, job, outputs)
    return {"shot_id": shot_id, "outputs": outputs}


@app.post("/api/chunks/{chunk_id}/render")
def render_chunk(chunk_id: str, payload: RenderRequest) -> dict:
    project_id, _ = _find_project_for_chunk(chunk_id)
    job = create_job(store, JobType.RENDER_CHUNK, chunk_id, project_id)
    artifact, evaluation = render_mock_chunk(store, project_id, chunk_id, payload.renderer)
    complete_job(store, job, [artifact.path])
    return {"artifact": artifact, "evaluation": evaluation}


@app.post("/api/shots/{shot_id}/render")
def render_shot(shot_id: str, payload: RenderRequest) -> dict:
    project_id, graph = _find_project_for_shot(shot_id)
    job = create_job(store, JobType.STITCH_SHOT, shot_id, project_id)
    artifacts = []
    evaluations = []
    for chunk in [chunk for chunk in graph.chunks if chunk.shot_id == shot_id]:
        artifact, evaluation = render_mock_chunk(store, project_id, chunk.chunk_id, payload.renderer)
        artifacts.append(artifact)
        evaluations.append(evaluation)
    outputs = [artifact.path for artifact in artifacts]
    complete_job(store, job, outputs)
    return {"shot_id": shot_id, "artifacts": artifacts, "evaluations": evaluations}


@app.post("/api/chunks/{chunk_id}/repair")
def repair_chunk(chunk_id: str, payload: RepairRequest) -> dict:
    project_id, _ = _find_project_for_chunk(chunk_id)
    job = create_job(store, JobType.REPAIR_CHUNK, chunk_id, project_id)
    artifact, evaluation = render_mock_chunk(store, project_id, chunk_id, "MockRendererRepair")
    complete_job(store, job, [artifact.path])
    return {"chunk_id": chunk_id, "repair_reasons": payload.repair_reasons, "artifact": artifact, "evaluation": evaluation}


@app.post("/api/shots/{shot_id}/audio/render")
def render_audio(shot_id: str, payload: AudioRenderRequest) -> dict:
    project_id, _ = _find_project_for_shot(shot_id)
    job = create_job(store, JobType.RENDER_AUDIO_LAYER, shot_id, project_id)
    outputs = render_mock_audio(store, project_id, shot_id, payload.layers)
    complete_job(store, job, outputs)
    return {"shot_id": shot_id, "outputs": outputs}


@app.post("/api/projects/{project_id}/export")
def export_project(project_id: str, payload: ExportRequest) -> dict:
    project = store.get_project(project_id)
    job = create_job(store, JobType.EXPORT_PROJECT, project_id, project_id)
    export_dir = store.project_dir(project_id) / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    path = export_dir / f"final_{payload.resolution.replace('x', 'p')}.{payload.format}"
    sidecar = {
        "project_id": project.project_id,
        "title": project.title,
        "format": payload.format,
        "resolution": payload.resolution,
        "include_audio": payload.include_audio,
        "status": "mock_export_metadata_only",
    }
    store.write_json(path.with_suffix(".json"), sidecar)
    complete_job(store, job, [str(path.with_suffix(".json"))])
    return {"export_path": str(path), "metadata_path": str(path.with_suffix(".json"))}


@app.get("/api/jobs")
def list_jobs() -> list[Job]:
    return store.list_jobs()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> Job:
    try:
        return store.get_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
