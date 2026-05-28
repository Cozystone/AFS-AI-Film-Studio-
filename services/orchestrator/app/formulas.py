from __future__ import annotations

from math import ceil


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(value, max_value))


def latent_token_count(width: int, height: int, frames: int, sx: int = 16, sy: int = 16, st: int = 4) -> int:
    return ceil(width / sx) * ceil(height / sy) * ceil(frames / st)


def compute_complexity(
    motion_score: float,
    identity_importance: float,
    detail_importance: float,
    camera_motion: float,
    audio_sync_importance: float,
) -> float:
    return (
        0.30 * motion_score
        + 0.25 * identity_importance
        + 0.20 * detail_importance
        + 0.15 * camera_motion
        + 0.10 * audio_sync_importance
    )


def compute_render_budget(complexity: float) -> dict:
    steps = int(clamp(round(4 + 8 * complexity), 4, 12))
    if complexity > 0.75:
        chunk_seconds = 1.25
    elif complexity >= 0.45:
        chunk_seconds = 2.0
    else:
        chunk_seconds = 3.0
    return {
        "steps": steps,
        "chunk_seconds": chunk_seconds,
        "cache_strength": round(clamp(1.0 - complexity, 0.0, 1.0), 3),
    }


def evaluator_final_score(scores: dict[str, float]) -> float:
    return round(
        0.18 * scores["prompt_match"]
        + 0.16 * scores["character_consistency"]
        + 0.12 * scores["prop_consistency"]
        + 0.10 * scores["location_consistency"]
        + 0.12 * scores["camera_match"]
        + 0.12 * scores["motion_quality"]
        + 0.10 * scores["temporal_stability"]
        + 0.06 * scores["audio_sync"]
        - 0.14 * scores["artifact_risk"],
        4,
    )


def decide_repair(scores: dict[str, float]) -> dict:
    reasons: list[str] = []
    if scores["artifact_risk"] > 0.35:
        reasons.append("artifact_risk_high")
    if scores["character_consistency"] < 0.70:
        reasons.append("character_drift")
    if scores["prop_consistency"] < 0.70:
        reasons.append("prop_missing_or_changed")
    if scores["camera_match"] < 0.65:
        reasons.append("camera_mismatch")
    if scores["audio_sync"] < 0.70:
        reasons.append("audio_sync_mismatch")
    return {"repair_required": bool(reasons), "repair_reasons": reasons}
