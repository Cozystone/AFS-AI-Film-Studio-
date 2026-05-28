from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_project_plan_render_repair_flow() -> None:
    created = client.post(
        "/api/projects",
        json={
            "title": "Last Tape",
            "script_prompt": "Two teenagers find a strange old camera.",
            "duration": 10,
            "aspect_ratio": "16:9",
            "style_hint": "lo-fi camcorder",
            "audio_hint": "wind and tape hiss",
        },
    )
    assert created.status_code == 200
    project_id = created.json()["project_id"]

    planned = client.post(f"/api/projects/{project_id}/plan")
    assert planned.status_code == 200
    graph = planned.json()
    assert graph["shots"]
    assert graph["chunks"]

    shot_id = graph["shots"][0]["shot_id"]
    chunk_id = graph["chunks"][0]["chunk_id"]

    keyframes = client.post(f"/api/shots/{shot_id}/keyframes/generate", json={"slots": ["first", "middle", "last"], "renderer": "mock"})
    assert keyframes.status_code == 200

    rendered = client.post(f"/api/chunks/{chunk_id}/render", json={"preset": "preview", "renderer": "mock"})
    assert rendered.status_code == 200
    assert rendered.json()["artifact"]["type"] == "video_chunk"

    repaired = client.post(f"/api/chunks/{chunk_id}/repair", json={"repair_reasons": ["camera_mismatch"], "lock_existing_audio": True})
    assert repaired.status_code == 200

    audio = client.post(f"/api/shots/{shot_id}/audio/render", json={"layers": ["foley", "ambience"], "adapter": "mock_audio"})
    assert audio.status_code == 200

    exported = client.post(f"/api/projects/{project_id}/export", json={"format": "mp4", "resolution": "1280x720", "include_audio": True})
    assert exported.status_code == 200
