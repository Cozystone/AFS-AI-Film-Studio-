from __future__ import annotations

import shutil
import subprocess
import uuid
from datetime import datetime
from pathlib import Path

from .formulas import compute_complexity, compute_render_budget, decide_repair, evaluator_final_score
from .schemas import (
    ArtifactMetadata,
    AudioVisualEvent,
    Character,
    Chunk,
    CineGraph,
    EvaluationResult,
    Job,
    JobStatus,
    JobType,
    Location,
    Project,
    Prop,
    RenderPlan,
    RenderPlanChunk,
    Scene,
    Shot,
    WorldState,
    now_iso,
)
from .storage import LocalStore


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def create_job(store: LocalStore, job_type: JobType, target_id: str, project_id: str | None = None) -> Job:
    estimates = {
        JobType.PLAN_PROJECT: 8.0,
        JobType.GENERATE_KEYFRAME: 6.0,
        JobType.RENDER_CHUNK: 15.0,
        JobType.STITCH_SHOT: 20.0,
        JobType.RENDER_AUDIO_LAYER: 10.0,
        JobType.MIX_AUDIO: 8.0,
        JobType.EVALUATE_CHUNK: 6.0,
        JobType.REPAIR_CHUNK: 18.0,
        JobType.EXPORT_PROJECT: 12.0,
    }
    job = Job(
        job_id=new_id("job"),
        project_id=project_id,
        type=job_type,
        target_id=target_id,
        estimated_duration_sec=estimates.get(job_type),
    )
    store.save_job(job)
    return job


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def update_job_progress(store: LocalStore, job: Job, progress: float, status: JobStatus = JobStatus.running) -> Job:
    job.status = status
    job.progress = max(0.0, min(progress, 1.0))
    job.started_at = job.started_at or now_iso()
    started = _parse_iso(job.started_at)
    if started:
        job.elapsed_sec = round((datetime.fromisoformat(now_iso()) - started).total_seconds(), 2)
    if job.estimated_duration_sec is not None:
        job.remaining_sec = round(max(job.estimated_duration_sec - job.elapsed_sec, 0.0), 2)
    store.save_job(job)
    return job


def complete_job(store: LocalStore, job: Job, outputs: list[str]) -> Job:
    job.status = JobStatus.succeeded
    job.progress = 1.0
    job.started_at = job.started_at or now_iso()
    job.ended_at = now_iso()
    started = _parse_iso(job.started_at)
    ended = _parse_iso(job.ended_at)
    if started and ended:
        job.elapsed_sec = round((ended - started).total_seconds(), 2)
    job.remaining_sec = 0.0
    job.outputs = outputs
    store.save_job(job)
    return job


def mock_plan(project: Project) -> CineGraph:
    character = Character(
        character_id="person_a",
        name="Person A",
        appearance="consistent protagonist derived from the script",
        wardrobe="locked wardrobe from the initial concept",
        personality="focused and emotionally readable",
    )
    location = Location(
        location_id="primary_location",
        name="Primary Location",
        description=f"main cinematic location for: {project.script_prompt[:120]}",
        lighting=project.style.visual or "controlled cinematic practical lighting",
        persistent_props=["hero_prop"],
    )
    prop = Prop(
        prop_id="hero_prop",
        name="Hero Prop",
        description="recurring prop used to preserve continuity",
        importance="high",
    )
    world = WorldState(
        project_id=project.project_id,
        time_period="unspecified",
        tone=project.style.visual or "cinematic, controlled",
        characters={character.character_id: character},
        locations={location.location_id: location},
        props={prop.prop_id: prop},
        camera_style={
            "format": project.style.visual or "cinematic local preview",
            "stability": "intentional handheld",
            "color": "consistent look across shots",
        },
    )

    shot_count = max(3, min(8, round(project.format.duration / 5)))
    shot_duration = round(project.format.duration / shot_count, 2)
    shots: list[Shot] = []
    chunks: list[Chunk] = []
    events: list[AudioVisualEvent] = []
    plans: list[RenderPlan] = []

    for idx in range(shot_count):
        shot_id = f"S01_SH{idx + 1:02d}"
        shot = Shot(
            shot_id=shot_id,
            scene_id="S01",
            duration=shot_duration,
            purpose=f"advance story beat {idx + 1} while preserving the original script intent",
            camera={
                "shot_size": "medium shot" if idx % 2 == 0 else "close-up",
                "movement": "slow push-in" if idx == shot_count - 1 else "controlled handheld drift",
                "lens_feel": "naturalistic local preview",
                "target": "person_a and hero_prop",
                "stability": "slightly shaky",
            },
            visual_action=f"story action beat {idx + 1}: {project.script_prompt[:80]}",
            characters=["person_a"],
            props=["hero_prop"],
            location="primary_location",
            continuity_rules=[
                "person_a visual identity remains locked",
                "hero_prop remains visible when referenced",
                "primary_location lighting stays consistent",
            ],
        )
        shots.append(shot)

        complexity = compute_complexity(0.45 + idx * 0.04, 0.7, 0.6, 0.4, 0.55)
        budget = compute_render_budget(complexity)
        cursor = 0.0
        plan_chunks: list[RenderPlanChunk] = []
        chunk_idx = 1
        while cursor < shot.duration - 0.01:
            length = min(budget["chunk_seconds"], shot.duration - cursor)
            chunk_id = f"{shot_id}_C{chunk_idx:02d}"
            chunk = Chunk(
                chunk_id=chunk_id,
                shot_id=shot_id,
                start=round(cursor, 2),
                end=round(cursor + length, 2),
                duration=round(length, 2),
                complexity=round(complexity, 3),
            )
            chunks.append(chunk)
            plan_chunks.append(
                RenderPlanChunk(
                    chunk_id=chunk_id,
                    start=chunk.start,
                    end=chunk.end,
                    complexity=chunk.complexity,
                    steps=budget["steps"],
                    resolution=project.format.working_resolution,
                    cache_strength=budget["cache_strength"],
                    required_refs=["person_a_ref", "primary_location_ref", "hero_prop_ref"],
                )
            )
            cursor += length
            chunk_idx += 1
        plans.append(RenderPlan(shot_id=shot_id, chunks=plan_chunks))

        events.append(
            AudioVisualEvent(
                event_id=f"E_{shot_id}_AMBIENCE",
                shot_id=shot_id,
                time=0.0,
                duration=shot.duration,
                visual={"type": "shot_ambience", "target": "primary_location", "action": "maintain atmosphere"},
                audio={
                    "type": "ambience",
                    "description": project.style.audio or "room tone and subtle environmental bed",
                    "volume": 0.35,
                    "position": "wide",
                    "sync_importance": 0.4,
                },
                story_meaning="maintain continuity and mood",
            )
        )
        events.append(
            AudioVisualEvent(
                event_id=f"E_{shot_id}_FOLEY",
                shot_id=shot_id,
                time=round(shot.duration / 2, 2),
                duration=0.4,
                visual={"type": "action_accent", "target": "hero_prop", "action": "important beat"},
                audio={
                    "type": "foley",
                    "description": "small synchronized tactile sound",
                    "volume": 0.65,
                    "position": "center",
                    "sync_importance": 0.9,
                },
                story_meaning="highlight the key visual event",
            )
        )

    scene = Scene(
        scene_id="S01",
        title="Generated Scene",
        duration=project.format.duration,
        location="primary_location",
        dramatic_purpose="convert the user script into editable film structure",
        characters=["person_a"],
        shots=[shot.shot_id for shot in shots],
    )
    return CineGraph(world_state=world, scenes=[scene], shots=shots, chunks=chunks, audio_visual_events=events, render_plans=plans)


def build_context_pack(store: LocalStore, project_id: str, shot_id: str, chunk_id: str) -> dict:
    project_dir = store.project_dir(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    shot = next(s for s in graph.shots if s.shot_id == shot_id)
    return {
        "last_frame": None,
        "current_shot_keyframes": [
            str(project_dir / "shots" / shot_id / "keyframes" / f"{slot}.png") for slot in ["first", "middle", "last"]
        ],
        "character_refs": shot.characters,
        "location_refs": [shot.location],
        "prop_refs": shot.props,
        "world_state_summary": graph.world_state.model_dump(mode="json"),
        "audio_events": [event.model_dump(mode="json") for event in graph.audio_visual_events if event.shot_id == shot_id],
        "chunk_id": chunk_id,
    }


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def write_placeholder_keyframes(store: LocalStore, project_id: str, shot_id: str, slots: list[str]) -> list[str]:
    paths: list[str] = []
    keyframe_dir = store.project_dir(project_id) / "shots" / shot_id / "keyframes"
    for slot in slots:
        path = keyframe_dir / f"{slot}.txt"
        store.write_json(
            path.with_suffix(".json"),
            {"slot": slot, "shot_id": shot_id, "renderer": "mock", "approved": False, "locked": False},
        )
        path.write_text(f"Mock keyframe placeholder for {shot_id}::{slot}\n", encoding="utf-8")
        paths.append(str(path))
    return paths


def render_mock_chunk(store: LocalStore, project_id: str, chunk_id: str, renderer: str = "MockRenderer") -> tuple[ArtifactMetadata, EvaluationResult]:
    project_dir = store.project_dir(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    chunk = next(c for c in graph.chunks if c.chunk_id == chunk_id)
    shot = next(s for s in graph.shots if s.shot_id == chunk.shot_id)
    out_dir = project_dir / "shots" / shot.shot_id / "chunks" / chunk_id.split("_")[-1]
    out_dir.mkdir(parents=True, exist_ok=True)
    context = build_context_pack(store, project_id, shot.shot_id, chunk_id)
    store.write_json(out_dir / "context_pack.json", context)

    video_path = out_dir / "video.mp4"
    if _ffmpeg_available():
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"testsrc2=size=832x480:rate=24:duration={chunk.duration}",
                "-pix_fmt",
                "yuv420p",
                str(video_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode != 0 or not video_path.exists():
            video_path = out_dir / "video.ffmpeg_failed.txt"
            video_path.write_text("ffmpeg failed; mock video metadata only\n", encoding="utf-8")
    else:
        video_path = out_dir / "video.ffmpeg_missing.txt"
        video_path.write_text("ffmpeg not found; mock video metadata only\n", encoding="utf-8")

    for frame_name in ["first_frame.txt", "last_frame.txt"]:
        (out_dir / frame_name).write_text(f"{frame_name} placeholder for {chunk_id}\n", encoding="utf-8")

    budget = compute_render_budget(chunk.complexity)
    artifact = ArtifactMetadata(
        artifact_id=f"art_{chunk_id}_video",
        type="video_chunk",
        path=str(video_path),
        renderer=renderer,
        input_context=context,
        render_budget=budget,
        outputs={
            "first_frame": str(out_dir / "first_frame.txt"),
            "last_frame": str(out_dir / "last_frame.txt"),
            "video": str(video_path),
        },
    )
    store.write_json(out_dir / "artifact.video.json", artifact)

    scores = {
        "prompt_match": 0.82,
        "character_consistency": 0.78,
        "prop_consistency": 0.86,
        "location_consistency": 0.84,
        "camera_match": 0.72,
        "motion_quality": 0.75,
        "temporal_stability": 0.8,
        "audio_sync": 0.82,
        "artifact_risk": 0.18,
    }
    decision = decide_repair(scores)
    evaluation = EvaluationResult(
        chunk_id=chunk_id,
        scores=scores,
        final_score=evaluator_final_score(scores),
        repair_required=decision["repair_required"],
        repair_reasons=decision["repair_reasons"],
    )
    store.write_json(out_dir / "eval.json", evaluation)
    return artifact, evaluation


def stitch_mock_shot(store: LocalStore, project_id: str, shot_id: str, chunk_artifacts: list[ArtifactMetadata], renderer: str = "MockRenderer") -> ArtifactMetadata:
    project_dir = store.project_dir(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    shot = next(s for s in graph.shots if s.shot_id == shot_id)
    out_dir = project_dir / "shots" / shot_id / "final"
    out_dir.mkdir(parents=True, exist_ok=True)
    video_path = out_dir / "shot.mp4"
    chunk_paths = [Path(artifact.path) for artifact in chunk_artifacts if Path(artifact.path).suffix == ".mp4"]

    if _ffmpeg_available() and chunk_paths:
        concat_list = out_dir / "chunks.txt"
        concat_list.write_text(
            "".join(f"file '{path.resolve().as_posix()}'\n" for path in chunk_paths),
            encoding="utf-8",
        )
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(video_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode != 0 or not video_path.exists():
            fallback = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    f"testsrc2=size=832x480:rate=24:duration={shot.duration}",
                    "-pix_fmt",
                    "yuv420p",
                    str(video_path),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if fallback.returncode != 0 or not video_path.exists():
                video_path = out_dir / "shot.ffmpeg_failed.txt"
                video_path.write_text("ffmpeg failed; stitched mock shot metadata only\n", encoding="utf-8")
    else:
        video_path = out_dir / "shot.ffmpeg_missing.txt"
        video_path.write_text("ffmpeg not found or no chunk media; stitched mock shot metadata only\n", encoding="utf-8")

    artifact = ArtifactMetadata(
        artifact_id=f"art_{shot_id}_shot_video",
        type="video_shot",
        path=str(video_path),
        renderer=renderer,
        input_context={"chunk_artifacts": [artifact.artifact_id for artifact in chunk_artifacts]},
        outputs={
            "video": str(video_path),
            "chunks": str([artifact.path for artifact in chunk_artifacts]),
        },
    )
    store.write_json(out_dir / "artifact.shot.json", artifact)
    return artifact


def stitch_project_movie(store: LocalStore, project_id: str, renderer: str = "MockRenderer") -> ArtifactMetadata:
    project_dir = store.project_dir(project_id)
    project = store.get_project(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    export_dir = project_dir / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    video_path = export_dir / "final_1280p720.mp4"
    shot_paths = [project_dir / "shots" / shot.shot_id / "final" / "shot.mp4" for shot in graph.shots]
    available_shots = [path for path in shot_paths if path.exists()]

    if _ffmpeg_available() and available_shots:
        concat_list = export_dir / "shots.txt"
        concat_list.write_text(
            "".join(f"file '{path.resolve().as_posix()}'\n" for path in available_shots),
            encoding="utf-8",
        )
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_list),
                "-c",
                "copy",
                str(video_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode != 0 or not video_path.exists():
            fallback = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    f"testsrc2=size=832x480:rate=24:duration={project.format.duration}",
                    "-pix_fmt",
                    "yuv420p",
                    str(video_path),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if fallback.returncode != 0 or not video_path.exists():
                video_path = export_dir / "final.ffmpeg_failed.txt"
                video_path.write_text("ffmpeg failed; project movie metadata only\n", encoding="utf-8")
    else:
        video_path = export_dir / "final.ffmpeg_missing.txt"
        video_path.write_text("ffmpeg not found or no shot media; project movie metadata only\n", encoding="utf-8")

    artifact = ArtifactMetadata(
        artifact_id=f"art_{project_id}_final_movie",
        type="video_project",
        path=str(video_path),
        renderer=renderer,
        input_context={"shot_count": len(graph.shots), "shot_paths": [str(path) for path in shot_paths]},
        outputs={"video": str(video_path)},
    )
    store.write_json(export_dir / "artifact.final.json", artifact)
    return artifact


def render_mock_audio(store: LocalStore, project_id: str, shot_id: str, layers: list[str]) -> list[str]:
    project_dir = store.project_dir(project_id)
    audio_dir = project_dir / "shots" / shot_id / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []
    for layer in layers:
        path = audio_dir / f"{layer}.wav"
        if _ffmpeg_available():
            freq = {"dialogue": 220, "foley": 440, "ambience": 110, "music": 330}.get(layer, 220)
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration=2", str(path)],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            path = audio_dir / f"{layer}.ffmpeg_missing.txt"
            path.write_text("ffmpeg not found; mock audio metadata only\n", encoding="utf-8")
        metadata = ArtifactMetadata(
            artifact_id=f"art_{shot_id}_{layer}_audio",
            type="audio_layer",
            path=str(path),
            renderer="MockAudioRenderer",
            outputs={"audio": str(path)},
        )
        store.write_json(audio_dir / f"{layer}.json", metadata)
        outputs.append(str(path))
    return outputs
