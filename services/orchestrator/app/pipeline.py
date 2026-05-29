from __future__ import annotations

import shutil
import subprocess
import uuid
import re
from datetime import datetime
from pathlib import Path

from .comfy_adapter import ComfyAdapterError, render_ltx_video
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


PRECISION_TERMS = (
    "knife",
    "knives",
    "blade",
    "blades",
    "sword",
    "swords",
    "dagger",
    "weapon",
    "clash",
    "strike",
    "sparks",
    "contact",
    "touch",
    "grab",
    "hold",
    "hand",
    "hands",
    "finger",
    "fingers",
    "face",
    "eyes",
    "mouth",
    "product",
    "logo",
    "text",
    "letters",
    "glass",
    "liquid",
    "wire",
    "rope",
    "key",
    "phone",
    "camera",
    "close-up",
    "closeup",
    "macro",
    "detail",
    "칼",
    "검",
    "날",
    "무기",
    "부딪",
    "맞닿",
    "충돌",
    "접촉",
    "쥐다",
    "잡다",
    "손",
    "손가락",
    "얼굴",
    "눈",
    "입",
    "제품",
    "로고",
    "글자",
    "유리",
    "액체",
    "전선",
    "줄",
    "열쇠",
    "휴대폰",
    "카메라",
    "클로즈업",
    "디테일",
    "스파크",
)

BLADE_TERMS = ("knife", "knives", "blade", "blades", "sword", "swords", "dagger", "칼", "검", "날")


def _requires_precision_render(text: str) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in PRECISION_TERMS)


def _contains_blade_action(text: str) -> bool:
    lowered = text.lower()
    return any(term in lowered for term in BLADE_TERMS)


def _hero_prop_for_script(script: str) -> Prop:
    if _contains_blade_action(script):
        return Prop(
            prop_id="hero_blade",
            name="Hero Blade",
            description="a consistent sharp metal blade with a clean silhouette, visible edge, stable handle, and clear contact point",
            importance="high",
        )
    if _requires_precision_render(script):
        return Prop(
            prop_id="hero_detail_prop",
            name="Hero Detail Prop",
            description="a recurring high-detail object with crisp edges, stable silhouette, and no warped or melted surfaces",
            importance="high",
        )
    return Prop(
        prop_id="hero_prop",
        name="Hero Prop",
        description="recurring prop used to preserve continuity",
        importance="high",
    )


def _continuity_bible(project: Project, graph: CineGraph | None = None) -> str:
    if graph:
        characters = "; ".join(
            f"{character.name}: {character.appearance}, wardrobe: {character.wardrobe}"
            for character in graph.world_state.characters.values()
        )
        locations = "; ".join(
            f"{location.name}: {location.description}, lighting: {location.lighting}"
            for location in graph.world_state.locations.values()
        )
        props = "; ".join(f"{prop.name}: {prop.description}" for prop in graph.world_state.props.values())
        style = graph.world_state.camera_style.get("format", project.style.visual)
    else:
        characters = "same protagonist, same face, same wardrobe, same body shape across every shot"
        locations = f"same primary location and lighting: {project.style.visual}"
        props = "same recurring hero prop"
        style = project.style.visual
    return (
        f"VISUAL CONTINUITY LOCK. {characters}. {locations}. {props}. "
        f"Camera/style must stay consistent: {style}. "
        "Do not change character identity, wardrobe, location layout, prop shape, or lighting palette between shots."
    )


def _precision_detail_prompt(text: str) -> str:
    if not _requires_precision_render(text):
        return ""
    detail = (
        "HIGH-PRECISION ACTION. Preserve crisp edges, stable hands, faces, object boundaries, contact points, product details, logos, and readable text. "
        "No melted objects, no fused hands, no smeared edges, no warped faces, no mushy contact, no illegible text."
    )
    if _contains_blade_action(text):
        detail += (
            " For blades or striking objects, keep the metal silhouette physically separate and show the exact contact point with two distinct hard edges."
        )
    return detail


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


def _extract_style_int(style: str, key: str) -> int | None:
    match = re.search(rf"(?:^|,\s*){re.escape(key)}=(\d+)", style)
    if not match:
        return None
    return int(match.group(1))


def mock_plan(project: Project) -> CineGraph:
    character = Character(
        character_id="person_a",
        name="Person A",
        appearance="same protagonist from the script, consistent face, hair, body shape, and age in every shot",
        wardrobe="locked wardrobe from the initial concept, unchanged color and silhouette",
        personality="focused and emotionally readable",
    )
    prop = _hero_prop_for_script(project.script_prompt)
    location = Location(
        location_id="primary_location",
        name="Primary Location",
        description=f"main cinematic location for: {project.script_prompt[:120]}",
        lighting=project.style.visual or "controlled cinematic practical lighting",
        persistent_props=[prop.prop_id],
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
            "continuity_bible": _continuity_bible(project),
        },
    )

    requested_shots = _extract_style_int(project.style.visual, "shots")
    single_long_take = "source=single_long_take" in project.style.visual or "long_take" in project.style.visual
    if requested_shots is not None:
        shot_count = max(1, min(12, requested_shots))
    elif single_long_take:
        shot_count = 1
    else:
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
                "target": f"person_a and {prop.prop_id}",
                "stability": "slightly shaky",
            },
            visual_action=f"story action beat {idx + 1}: {project.script_prompt[:80]}",
            characters=["person_a"],
            props=[prop.prop_id],
            location="primary_location",
            continuity_rules=[
                "person_a visual identity remains locked",
                f"{prop.prop_id} shape, material, size, and position remain consistent when referenced",
                "primary_location lighting stays consistent",
                "do not introduce a new character, new wardrobe, new location, or new prop design",
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


def _write_cinematic_placeholder_video(path: Path, duration: float, size: str = "832x480") -> bool:
    if not _ffmpeg_available():
        return False
    fade_out_start = max(0.0, duration - 0.25)
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=0x101820:size={size}:rate=24:duration={duration}",
            "-vf",
            f"noise=alls=8:allf=t+u,fade=t=in:st=0:d=0.25,fade=t=out:st={fade_out_start:.2f}:d=0.25",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0 and path.exists()


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
    if renderer.lower() in {"comfy", "comfy_ltx", "ltx", "ltxrenderer"}:
        project = store.get_project(project_id)
        continuity = _continuity_bible(project, graph)
        precision = _precision_detail_prompt(f"{shot.visual_action} {project.script_prompt}")
        prompt = (
            f"{continuity} "
            f"{shot.visual_action}. {shot.purpose}. "
            f"Camera: {shot.camera.get('movement', 'cinematic motion')}. "
            f"{precision} "
            f"Continuity rules: {'; '.join(shot.continuity_rules)}. "
            "Cinematic, coherent, natural motion, detailed scene, grounded live-action footage."
        )
        try:
            render_ltx_video(
                text=prompt,
                destination=video_path,
                seconds=chunk.duration,
                seed=1234 + abs(hash(chunk_id)) % 100000,
                preset="preview",
                video_only=True,
            )
        except ComfyAdapterError as exc:
            failure_path = out_dir / "video.comfy_failed.txt"
            failure_path.write_text(str(exc), encoding="utf-8")
            raise
    elif _ffmpeg_available():
        if not _write_cinematic_placeholder_video(video_path, chunk.duration):
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
            if not _write_cinematic_placeholder_video(video_path, shot.duration):
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


def render_comfy_ltx_shot(
    store: LocalStore,
    project_id: str,
    shot_id: str,
    renderer: str = "ComfyLTXRenderer",
    preset: str = "preview",
) -> ArtifactMetadata:
    project_dir = store.project_dir(project_id)
    project = store.get_project(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    shot = next(s for s in graph.shots if s.shot_id == shot_id)
    out_dir = project_dir / "shots" / shot_id / "final"
    out_dir.mkdir(parents=True, exist_ok=True)
    raw_path = out_dir / "shot.raw.mp4"
    final_path = out_dir / "shot.mp4"
    source_limits = {
        "turbo": 1.0,
        "fast": 1.2,
        "draft": 1.35,
        "preview": 1.75,
        "balanced": 2.25,
        "high": 2.92,
        "ultra": 2.92,
    }
    speed_floor = {
        "turbo": 0.5,
        "fast": 0.75,
        "draft": 0.65,
        "preview": 0.8,
        "balanced": 1.0,
        "high": 1.0,
        "ultra": 1.0,
    }
    preset_key = preset.lower()
    precision_text = f"{project.script_prompt} {shot.visual_action}"
    precision_critical = _requires_precision_render(precision_text)
    contact_critical = _contains_blade_action(precision_text)
    source_seconds = min(
        shot.duration,
        shot.duration
        if precision_critical
        else max(source_limits.get(preset_key, 1.75), shot.duration * speed_floor.get(preset_key, 0.8)),
    )
    render_preset = preset
    if precision_critical and preset_key in {"turbo", "fast", "draft", "preview"}:
        render_preset = "balanced"
    elif precision_critical and preset_key == "balanced":
        render_preset = "high"
    continuity = _continuity_bible(project, graph)
    precision = _precision_detail_prompt(precision_text)
    prompt = (
        f"{continuity} "
        f"{shot.visual_action}. {shot.purpose}. "
        f"Camera: {shot.camera.get('movement', 'cinematic motion')}, {shot.camera.get('shot_size', 'film shot')}. "
        f"{precision} "
        f"Continuity rules: {'; '.join(shot.continuity_rules)}. "
        "Cinematic realistic video, coherent motion, natural lighting, grounded live-action footage."
    )
    render_ltx_video(
        text=prompt,
        destination=raw_path,
        seconds=source_seconds,
        seed=1234 + abs(hash(shot_id)) % 100000,
        preset=render_preset,
        video_only=True,
    )
    if _ffmpeg_available() and shot.duration > source_seconds and raw_path.exists():
        ratio = shot.duration / source_seconds
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(raw_path),
                "-filter:v",
                f"setpts={ratio:.6f}*PTS",
                "-an",
                "-pix_fmt",
                "yuv420p",
                str(final_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode != 0 or not final_path.exists():
            shutil.copy2(raw_path, final_path)
    else:
        shutil.copy2(raw_path, final_path)

    artifact = ArtifactMetadata(
        artifact_id=f"art_{shot_id}_shot_video",
        type="video_shot",
        path=str(final_path),
        renderer=renderer,
        input_context={
            "shot_id": shot_id,
            "source_seconds": source_seconds,
            "target_seconds": shot.duration,
            "prompt": prompt,
            "precision_critical": precision_critical,
            "contact_critical": contact_critical,
            "render_preset": render_preset,
        },
        outputs={"video": str(final_path), "raw_video": str(raw_path)},
    )
    store.write_json(out_dir / "artifact.shot.json", artifact)
    return artifact


def _mix_shot_audio(project_dir: Path, shot: Shot, export_dir: Path) -> Path | None:
    if not _ffmpeg_available():
        return None
    audio_dir = project_dir / "shots" / shot.shot_id / "audio"
    layer_paths = [audio_dir / f"{layer}.wav" for layer in ("ambience", "foley", "music", "dialogue")]
    available_layers = [path for path in layer_paths if path.exists()]
    output_path = export_dir / f"{shot.shot_id}.mix.wav"
    duration = max(0.25, float(shot.duration))

    if not available_layers:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                f"anullsrc=channel_layout=stereo:sample_rate=48000:d={duration:.3f}",
                "-t",
                f"{duration:.3f}",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return output_path if result.returncode == 0 and output_path.exists() else None

    command = ["ffmpeg", "-y"]
    for path in available_layers:
        command += ["-i", str(path)]

    parts: list[str] = []
    for index, path in enumerate(available_layers):
        volume = {"ambience": 0.24, "foley": 0.28, "music": 0.18, "dialogue": 0.6}.get(path.stem, 0.22)
        parts.append(
            f"[{index}:a]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo,"
            f"volume={volume},apad,atrim=0:{duration:.3f},asetpts=N/SR/TB[a{index}]"
        )
    inputs = "".join(f"[a{index}]" for index in range(len(available_layers)))
    filter_complex = ";".join(parts) + f";{inputs}amix=inputs={len(available_layers)}:duration=longest:normalize=0,atrim=0:{duration:.3f},alimiter=limit=0.82[out]"

    result = subprocess.run(
        command
        + [
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return output_path if result.returncode == 0 and output_path.exists() else None


def _build_project_audio(project_dir: Path, graph: CineGraph, export_dir: Path) -> Path | None:
    if not _ffmpeg_available() or not graph.shots:
        return None
    shot_audio_paths = [_mix_shot_audio(project_dir, shot, export_dir) for shot in graph.shots]
    available_audio = [path for path in shot_audio_paths if path and path.exists()]
    if not available_audio:
        return None
    concat_list = export_dir / "audio.txt"
    concat_list.write_text(
        "".join(f"file '{path.resolve().as_posix()}'\n" for path in available_audio),
        encoding="utf-8",
    )
    final_audio = export_dir / "final_audio.wav"
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
            "-c:a",
            "pcm_s16le",
            str(final_audio),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return final_audio if result.returncode == 0 and final_audio.exists() else None


def _write_silence_audio(path: Path, duration: float) -> bool:
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=channel_layout=stereo:sample_rate=48000:d={duration:.3f}",
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0 and path.exists()


def _wants_music(audio_hint: str) -> bool:
    lowered = audio_hint.lower()
    return any(term in lowered for term in ("music", "score", "bgm", "soundtrack", "음악", "브금", "스코어"))


def _render_ambience_audio(path: Path, duration: float, audio_hint: str) -> bool:
    if not audio_hint.strip():
        return _write_silence_audio(path, duration)
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            (
                f"anoisesrc=color=brown:duration={duration:.3f}:amplitude=0.018,"
                "highpass=f=70,lowpass=f=1800,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo,"
                f"afade=t=in:st=0:d=0.25,afade=t=out:st={max(0.0, duration - 0.45):.3f}:d=0.45"
            ),
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0 and path.exists()


def _render_music_audio(path: Path, duration: float, audio_hint: str) -> bool:
    if not _wants_music(audio_hint):
        return _write_silence_audio(path, duration)
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            (
                f"sine=frequency=73:duration={duration:.3f},volume=0.026,"
                "aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo,"
                f"afade=t=in:st=0:d=0.6,afade=t=out:st={max(0.0, duration - 0.8):.3f}:d=0.8"
            ),
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0 and path.exists()


def _render_foley_audio(path: Path, duration: float, events: list[AudioVisualEvent]) -> bool:
    foley_events = [event for event in events if event.audio.get("type") == "foley"]
    if not foley_events:
        return _write_silence_audio(path, duration)

    command = ["ffmpeg", "-y", "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:d={duration:.3f}"]
    for index, _event in enumerate(foley_events, start=1):
        frequency = 680 + (index % 3) * 170
        command += ["-f", "lavfi", "-i", f"sine=frequency={frequency}:duration=0.085"]

    parts = [f"[0:a]volume=0.0,atrim=0:{duration:.3f}[base]"]
    for index, event in enumerate(foley_events, start=1):
        delay_ms = max(0, int(float(event.time) * 1000))
        volume = min(0.16, max(0.035, float(event.audio.get("volume", 0.35)) * 0.12))
        parts.append(
            f"[{index}:a]volume={volume:.3f},afade=t=out:st=0.015:d=0.07,"
            f"adelay={delay_ms}:all=1,apad,atrim=0:{duration:.3f}[a{index}]"
        )
    inputs = "[base]" + "".join(f"[a{index}]" for index in range(1, len(foley_events) + 1))
    filter_complex = ";".join(parts) + f";{inputs}amix=inputs={len(foley_events) + 1}:duration=first:normalize=0,alimiter=limit=0.55[out]"

    result = subprocess.run(
        command
        + [
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-t",
            f"{duration:.3f}",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0 and path.exists()


def stitch_project_movie(store: LocalStore, project_id: str, renderer: str = "MockRenderer", include_audio: bool = True) -> ArtifactMetadata:
    project_dir = store.project_dir(project_id)
    project = store.get_project(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    export_dir = project_dir / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    video_path = export_dir / "final_1280p720.mp4"
    silent_video_path = export_dir / "final_1280p720.video.mp4"
    shot_paths = [project_dir / "shots" / shot.shot_id / "final" / "shot.mp4" for shot in graph.shots]
    available_shots = [path for path in shot_paths if path.exists()]
    audio_mix_path = _build_project_audio(project_dir, graph, export_dir) if include_audio else None

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
                "-vf",
                "scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,eq=contrast=1.04:saturation=1.03,unsharp=5:5:0.95:3:3:0.35",
                "-c:v",
                "libx264",
                "-preset",
                "slow",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(silent_video_path if audio_mix_path else video_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        rendered_video_path = silent_video_path if audio_mix_path else video_path
        if result.returncode != 0 or not rendered_video_path.exists():
            fallback = subprocess.run(
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
                    "-pix_fmt",
                    "yuv420p",
                    str(rendered_video_path),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if fallback.returncode != 0 or not rendered_video_path.exists():
                video_path = export_dir / "final.ffmpeg_failed.txt"
                video_path.write_text("ffmpeg failed; project movie metadata only\n", encoding="utf-8")
        if isinstance(video_path, Path) and audio_mix_path and rendered_video_path.exists():
            mux_result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(rendered_video_path),
                    "-i",
                    str(audio_mix_path),
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-shortest",
                    "-movflags",
                    "+faststart",
                    str(video_path),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if mux_result.returncode != 0 or not video_path.exists():
                shutil.copy2(rendered_video_path, video_path)
                audio_mix_path = None
    else:
        video_path = export_dir / "final.ffmpeg_missing.txt"
        video_path.write_text("ffmpeg not found or no shot media; project movie metadata only\n", encoding="utf-8")

    artifact = ArtifactMetadata(
        artifact_id=f"art_{project_id}_final_movie",
        type="video_project",
        path=str(video_path),
        renderer=renderer,
        input_context={
            "shot_count": len(graph.shots),
            "available_shot_count": len(available_shots),
            "shot_paths": [str(path) for path in shot_paths],
            "include_audio": include_audio,
            "audio_mix_path": str(audio_mix_path) if audio_mix_path else None,
            "upscale": {
                "method": "final_only_ffmpeg_lanczos",
                "resolution": "1280x720",
                "crf": 18,
                "policy": "upscale only the stitched preview to avoid per-shot render cost explosion",
            },
        },
        outputs={"video": str(video_path)},
    )
    store.write_json(export_dir / "artifact.final.json", artifact)
    return artifact


def render_mock_audio(store: LocalStore, project_id: str, shot_id: str, layers: list[str]) -> list[str]:
    project_dir = store.project_dir(project_id)
    project = store.get_project(project_id)
    graph = CineGraph.model_validate(store.read_json(project_dir / "cinegraph.json"))
    shot = next((candidate for candidate in graph.shots if candidate.shot_id == shot_id), None)
    duration = max(0.25, float(shot.duration if shot else 2.0))
    events = [event for event in graph.audio_visual_events if event.shot_id == shot_id]
    audio_dir = project_dir / "shots" / shot_id / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []
    for layer in layers:
        path = audio_dir / f"{layer}.wav"
        if _ffmpeg_available():
            rendered = False
            if layer == "ambience":
                rendered = _render_ambience_audio(path, duration, project.style.audio)
            elif layer == "foley":
                rendered = _render_foley_audio(path, duration, events)
            elif layer == "music":
                rendered = _render_music_audio(path, duration, project.style.audio)
            elif layer == "dialogue":
                rendered = _write_silence_audio(path, duration)
            if not rendered:
                _write_silence_audio(path, duration)
        else:
            path = audio_dir / f"{layer}.ffmpeg_missing.txt"
            path.write_text("ffmpeg not found; mock audio metadata only\n", encoding="utf-8")
        metadata = ArtifactMetadata(
            artifact_id=f"art_{shot_id}_{layer}_audio",
            type="audio_layer",
            path=str(path),
            renderer="MockAudioRenderer",
            input_context={
                "layer": layer,
                "duration": duration,
                "policy": "procedural story-safe audio; dialogue stays silent unless a real dialogue adapter is attached",
                "events": [event.model_dump(mode="json") for event in events if event.audio.get("type") == layer],
            },
            outputs={"audio": str(path)},
        )
        store.write_json(audio_dir / f"{layer}.json", metadata)
        outputs.append(str(path))
    return outputs
