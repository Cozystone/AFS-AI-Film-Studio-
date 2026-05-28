from app.formulas import compute_complexity, compute_render_budget, decide_repair, evaluator_final_score, latent_token_count


def test_latent_token_count() -> None:
    assert latent_token_count(832, 480, 48) == 18720


def test_render_budget() -> None:
    complexity = compute_complexity(0.5, 0.7, 0.6, 0.4, 0.8)
    budget = compute_render_budget(complexity)
    assert 4 <= budget["steps"] <= 12
    assert budget["chunk_seconds"] in {1.25, 2.0, 3.0}
    assert 0 <= budget["cache_strength"] <= 1


def test_evaluator_and_repair() -> None:
    scores = {
        "prompt_match": 0.8,
        "character_consistency": 0.5,
        "prop_consistency": 0.9,
        "location_consistency": 0.8,
        "camera_match": 0.6,
        "motion_quality": 0.8,
        "temporal_stability": 0.8,
        "audio_sync": 0.9,
        "artifact_risk": 0.2,
    }
    assert evaluator_final_score(scores) > 0
    decision = decide_repair(scores)
    assert decision["repair_required"] is True
    assert "character_drift" in decision["repair_reasons"]
