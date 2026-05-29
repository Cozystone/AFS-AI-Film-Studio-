from __future__ import annotations

import threading
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .pipeline import (
    complete_job,
    create_job,
    mock_plan,
    render_mock_audio,
    render_mock_chunk,
    render_comfy_ltx_shot,
    stitch_project_movie,
    stitch_mock_shot,
    update_job_progress,
    write_placeholder_keyframes,
)
from .schemas import (
    AudioRenderRequest,
    CineGraph,
    ExportRequest,
    Job,
    JobStatus,
    JobType,
    KeyframeGenerateRequest,
    Project,
    ProjectCreate,
    ProjectFormat,
    ProjectStyle,
    RenderRequest,
    RepairRequest,
    now_iso,
)
from .storage import LocalStore
from .system_usage import system_usage

app = FastAPI(title="AFS Orchestrator", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = LocalStore()


def _fail_job(job: Job, error: Exception) -> None:
    job.status = JobStatus.failed
    job.error = str(error)
    job.ended_at = now_iso()
    store.save_job(job)


def _render_mock_shot(project_id: str, graph: CineGraph, shot_id: str, renderer: str):
    artifacts = []
    shot_chunks = [chunk for chunk in graph.chunks if chunk.shot_id == shot_id]
    for chunk in shot_chunks:
        artifact, _ = render_mock_chunk(store, project_id, chunk.chunk_id, renderer)
        artifacts.append(artifact)
    return stitch_mock_shot(store, project_id, shot_id, artifacts, renderer)


def _run_project_render_job(job_id: str, project_id: str, payload: RenderRequest) -> None:
    job = store.get_job(job_id)
    try:
        project = store.get_project(project_id)
        graph_path = store.project_dir(project_id) / "cinegraph.json"
        if not graph_path.exists():
            raise FileNotFoundError("cinegraph.json not found; run project planning first")
        graph = CineGraph.model_validate(store.read_json(graph_path))
        shots = graph.shots
        total_shots = max(len(shots), 1)
        renderer = "mock" if payload.renderer.lower() == "mock" else payload.renderer
        model_renderer = renderer.lower()

        job.estimated_duration_sec = max(
            20.0,
            total_shots
            * (
                2.0
                if model_renderer == "mock"
                else {"fast": 75.0, "draft": 75.0, "preview": 95.0, "balanced": 125.0, "high": 160.0, "ultra": 210.0}.get(
                    payload.preset.lower(), 95.0
                )
            )
            + (total_shots * 3.0 if payload.audio else 0.0)
            + 12.0,
        )
        store.save_job(job)
        update_job_progress(store, job, 0.02)

        for index, shot in enumerate(shots, start=1):
            write_placeholder_keyframes(store, project_id, shot.shot_id, ["first", "middle", "last"])
            update_job_progress(store, job, 0.05 + 0.10 * (index / total_shots))

        for index, shot in enumerate(shots, start=1):
            if model_renderer in {"comfy", "comfy_ltx", "ltx", "ltxrenderer"}:
                render_comfy_ltx_shot(store, project_id, shot.shot_id, renderer, payload.preset)
            else:
                _render_mock_shot(project_id, graph, shot.shot_id, renderer)
            update_job_progress(store, job, 0.15 + 0.70 * (index / total_shots))

        if payload.audio:
            for index, shot in enumerate(shots, start=1):
                render_mock_audio(store, project_id, shot.shot_id, ["foley", "ambience", "music"])
                update_job_progress(store, job, 0.85 + 0.10 * (index / total_shots))
        else:
            update_job_progress(store, job, 0.95)

        export_dir = store.project_dir(project_id) / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        artifact = stitch_project_movie(store, project_id)
        sidecar_path = export_dir / "final_1280p720.json"
        store.write_json(
            sidecar_path,
            {
                "project_id": project.project_id,
                "title": project.title,
                "format": "mp4",
                "resolution": "1280x720",
                "include_audio": payload.audio,
                "status": "async_export_ready",
                "artifact_id": artifact.artifact_id,
                "media_url": f"/api/projects/{project.project_id}/artifacts/{artifact.artifact_id}/media"
                if artifact.path.endswith(".mp4")
                else None,
            },
        )
        complete_job(store, job, [artifact.path, str(sidecar_path)])
    except Exception as exc:
        _fail_job(job, exc)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "afs-orchestrator"}


@app.get("/api/system/usage")
def get_system_usage() -> dict:
    return system_usage()


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
    update_job_progress(store, job, 0.15)
    graph = mock_plan(project)
    update_job_progress(store, job, 0.75)
    project_dir = store.project_dir(project_id)
    store.write_json(project_dir / "world_state.json", graph.world_state)
    store.write_json(project_dir / "cinegraph.json", graph)
    store.write_json(project_dir / "render_plan.json", {"render_plans": [plan.model_dump(mode="json") for plan in graph.render_plans]})
    complete_job(store, job, [str(project_dir / "cinegraph.json")])
    return graph


@app.post("/api/projects/{project_id}/render_async")
def render_project_async(project_id: str, payload: RenderRequest) -> dict:
    store.get_project(project_id)
    graph_path = store.project_dir(project_id) / "cinegraph.json"
    if not graph_path.exists():
        raise HTTPException(status_code=409, detail="project must be planned before rendering")
    job = create_job(store, JobType.EXPORT_PROJECT, project_id, project_id)
    update_job_progress(store, job, 0.01)
    thread = threading.Thread(target=_run_project_render_job, args=(job.job_id, project_id, payload), daemon=True)
    thread.start()
    return {"job_id": job.job_id, "status": job.status.value}


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


def _find_artifact(artifact_id: str) -> dict:
    for project in store.list_projects():
        project_dir = store.project_dir(project.project_id)
        for artifact_path in project_dir.rglob("*.json"):
            if not artifact_path.name.startswith(("artifact.", "foley", "ambience", "music", "dialogue")):
                continue
            try:
                payload = store.read_json(artifact_path)
            except Exception:
                continue
            if payload.get("artifact_id") == artifact_id:
                payload["_metadata_path"] = str(artifact_path)
                return payload
    raise HTTPException(status_code=404, detail="artifact not found")


@app.get("/api/artifacts/{artifact_id}/media")
def get_artifact_media(artifact_id: str) -> FileResponse:
    artifact = _find_artifact(artifact_id)
    path = artifact.get("path")
    if not path:
        raise HTTPException(status_code=404, detail="artifact has no media path")
    media_path = store.root.parent / path
    if not media_path.exists() or media_path.suffix not in {".mp4", ".wav"}:
        raise HTTPException(status_code=404, detail="media file not available")
    media_type = "video/mp4" if media_path.suffix == ".mp4" else "audio/wav"
    return FileResponse(media_path, media_type=media_type, filename=media_path.name)


@app.get("/api/projects/{project_id}/artifacts/{artifact_id}/media")
def get_project_artifact_media(project_id: str, artifact_id: str) -> FileResponse:
    project_dir = store.project_dir(project_id)
    for artifact_path in project_dir.rglob("*.json"):
        if not artifact_path.name.startswith(("artifact.", "foley", "ambience", "music", "dialogue")):
            continue
        try:
            artifact = store.read_json(artifact_path)
        except Exception:
            continue
        if artifact.get("artifact_id") != artifact_id:
            continue
        media_path = store.root.parent / artifact.get("path", "")
        if not media_path.exists() or media_path.suffix not in {".mp4", ".wav"}:
            raise HTTPException(status_code=404, detail="media file not available")
        media_type = "video/mp4" if media_path.suffix == ".mp4" else "audio/wav"
        return FileResponse(media_path, media_type=media_type, filename=media_path.name)
    raise HTTPException(status_code=404, detail="artifact not found")


@app.get("/api/shots/{shot_id}/preview")
def get_shot_preview(shot_id: str) -> dict:
    project_id, _ = _find_project_for_shot(shot_id)
    shot_dir = store.project_dir(project_id) / "shots" / shot_id
    final_artifacts = sorted((shot_dir / "final").glob("artifact.shot.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    artifacts = final_artifacts
    for artifact_path in artifacts:
        artifact = store.read_json(artifact_path)
        media_path = store.root.parent / artifact.get("path", "")
        if media_path.exists() and media_path.suffix == ".mp4":
            return {
                "shot_id": shot_id,
                "artifact": artifact,
                "media_url": f"/api/artifacts/{artifact['artifact_id']}/media",
            }
    raise HTTPException(status_code=404, detail="preview media not available")


@app.get("/api/projects/{project_id}/preview")
def get_project_preview(project_id: str) -> dict:
    project_dir = store.project_dir(project_id)
    artifacts = sorted((project_dir / "exports").glob("artifact.final.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for artifact_path in artifacts:
        artifact = store.read_json(artifact_path)
        media_path = store.root.parent / artifact.get("path", "")
        if media_path.exists() and media_path.suffix == ".mp4":
            return {
                "project_id": project_id,
                "artifact": artifact,
                "media_url": f"/api/artifacts/{artifact['artifact_id']}/media",
            }
    raise HTTPException(status_code=404, detail="project preview media not available")


@app.get("/api/gallery")
def list_gallery() -> list[dict]:
    items: list[dict] = []
    for project in store.list_projects():
        project_dir = store.project_dir(project.project_id)
        artifact_paths = list((project_dir / "exports").glob("artifact.final.json"))
        artifact_paths.extend((project_dir / "shots").glob("*/final/artifact.shot.json"))
        for artifact_path in artifact_paths:
            try:
                artifact = store.read_json(artifact_path)
            except Exception:
                continue
            media_path = store.root.parent / artifact.get("path", "")
            if not media_path.exists() or media_path.suffix != ".mp4":
                continue
            artifact_type = artifact.get("type", "")
            shot_id = artifact.get("input_context", {}).get("shot_id")
            is_final = artifact_type in {"final_movie", "video_project"}
            items.append(
                {
                    "artifact_id": artifact.get("artifact_id"),
                    "project_id": project.project_id,
                    "project_title": project.title,
                    "type": artifact_type,
                    "label": "Final movie" if is_final else (shot_id or "Shot preview"),
                    "renderer": artifact.get("renderer"),
                    "created_at": artifact.get("created_at"),
                    "media_url": f"/api/projects/{project.project_id}/artifacts/{artifact['artifact_id']}/media",
                    "duration": project.format.duration if is_final else artifact.get("input_context", {}).get("target_seconds"),
                }
            )
    return sorted(items, key=lambda item: item.get("created_at") or "", reverse=True)


@app.post("/api/shots/{shot_id}/keyframes/generate")
def generate_keyframes(shot_id: str, payload: KeyframeGenerateRequest) -> dict:
    project_id, _ = _find_project_for_shot(shot_id)
    job = create_job(store, JobType.GENERATE_KEYFRAME, shot_id, project_id)
    update_job_progress(store, job, 0.2)
    outputs = write_placeholder_keyframes(store, project_id, shot_id, payload.slots)
    complete_job(store, job, outputs)
    return {"shot_id": shot_id, "outputs": outputs}


@app.post("/api/chunks/{chunk_id}/render")
def render_chunk(chunk_id: str, payload: RenderRequest) -> dict:
    project_id, _ = _find_project_for_chunk(chunk_id)
    job = create_job(store, JobType.RENDER_CHUNK, chunk_id, project_id)
    update_job_progress(store, job, 0.1)
    artifact, evaluation = render_mock_chunk(store, project_id, chunk_id, payload.renderer)
    complete_job(store, job, [artifact.path])
    return {"artifact": artifact, "evaluation": evaluation}


@app.post("/api/shots/{shot_id}/render")
def render_shot(shot_id: str, payload: RenderRequest) -> dict:
    project_id, graph = _find_project_for_shot(shot_id)
    job = create_job(store, JobType.STITCH_SHOT, shot_id, project_id)
    if payload.renderer.lower() in {"comfy", "comfy_ltx", "ltx", "ltxrenderer"}:
        update_job_progress(store, job, 0.05)
        shot_artifact = render_comfy_ltx_shot(store, project_id, shot_id, payload.renderer, payload.preset)
        update_job_progress(store, job, 0.95)
        complete_job(store, job, [shot_artifact.path])
        return {
            "shot_id": shot_id,
            "artifacts": [],
            "evaluations": [],
            "stitched_artifact": shot_artifact,
            "preview_artifact_id": shot_artifact.artifact_id,
            "preview_url": f"/api/artifacts/{shot_artifact.artifact_id}/media",
        }
    artifacts = []
    evaluations = []
    shot_chunks = [chunk for chunk in graph.chunks if chunk.shot_id == shot_id]
    total = max(len(shot_chunks), 1)
    update_job_progress(store, job, 0.05)
    for index, chunk in enumerate(shot_chunks, start=1):
        artifact, evaluation = render_mock_chunk(store, project_id, chunk.chunk_id, payload.renderer)
        artifacts.append(artifact)
        evaluations.append(evaluation)
        update_job_progress(store, job, min(0.75 * (index / total), 0.75))
    shot_artifact = stitch_mock_shot(store, project_id, shot_id, artifacts, payload.renderer)
    update_job_progress(store, job, 0.95)
    outputs = [artifact.path for artifact in artifacts] + [shot_artifact.path]
    complete_job(store, job, outputs)
    return {
        "shot_id": shot_id,
        "artifacts": artifacts,
        "evaluations": evaluations,
        "stitched_artifact": shot_artifact,
        "preview_artifact_id": shot_artifact.artifact_id if shot_artifact.path.endswith(".mp4") else None,
        "preview_url": f"/api/artifacts/{shot_artifact.artifact_id}/media" if shot_artifact.path.endswith(".mp4") else None,
    }


@app.post("/api/chunks/{chunk_id}/repair")
def repair_chunk(chunk_id: str, payload: RepairRequest) -> dict:
    project_id, _ = _find_project_for_chunk(chunk_id)
    job = create_job(store, JobType.REPAIR_CHUNK, chunk_id, project_id)
    update_job_progress(store, job, 0.1)
    artifact, evaluation = render_mock_chunk(store, project_id, chunk_id, "MockRendererRepair")
    complete_job(store, job, [artifact.path])
    return {"chunk_id": chunk_id, "repair_reasons": payload.repair_reasons, "artifact": artifact, "evaluation": evaluation}


@app.post("/api/shots/{shot_id}/audio/render")
def render_audio(shot_id: str, payload: AudioRenderRequest) -> dict:
    project_id, _ = _find_project_for_shot(shot_id)
    job = create_job(store, JobType.RENDER_AUDIO_LAYER, shot_id, project_id)
    update_job_progress(store, job, 0.2)
    outputs = render_mock_audio(store, project_id, shot_id, payload.layers)
    complete_job(store, job, outputs)
    return {"shot_id": shot_id, "outputs": outputs}


@app.post("/api/projects/{project_id}/export")
def export_project(project_id: str, payload: ExportRequest) -> dict:
    project = store.get_project(project_id)
    job = create_job(store, JobType.EXPORT_PROJECT, project_id, project_id)
    update_job_progress(store, job, 0.25)
    export_dir = store.project_dir(project_id) / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    artifact = stitch_project_movie(store, project_id)
    update_job_progress(store, job, 0.85)
    path = export_dir / f"final_{payload.resolution.replace('x', 'p')}.{payload.format}"
    sidecar = {
        "project_id": project.project_id,
        "title": project.title,
        "format": payload.format,
        "resolution": payload.resolution,
        "include_audio": payload.include_audio,
        "status": "mock_export_ready",
        "artifact_id": artifact.artifact_id,
        "media_url": f"/api/projects/{project.project_id}/artifacts/{artifact.artifact_id}/media" if artifact.path.endswith(".mp4") else None,
    }
    store.write_json(path.with_suffix(".json"), sidecar)
    complete_job(store, job, [artifact.path, str(path.with_suffix(".json"))])
    return {
        "export_path": artifact.path,
        "metadata_path": str(path.with_suffix(".json")),
        "artifact": artifact,
        "media_url": f"/api/projects/{project.project_id}/artifacts/{artifact.artifact_id}/media" if artifact.path.endswith(".mp4") else None,
    }


@app.get("/api/jobs")
def list_jobs() -> list[Job]:
    return store.list_jobs()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> Job:
    try:
        return store.get_job(job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="job not found") from exc
