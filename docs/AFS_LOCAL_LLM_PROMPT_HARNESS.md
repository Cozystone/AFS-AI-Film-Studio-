# AFS Local LLM Prompt Harness

## Goal

AFS needs story, not just clips. The local LLM layer should turn a user script into a narrative harness before any renderer prompt is written.

The harness has four stages:

1. Story Spine
   - protagonist, want, obstacle, turn, reveal, ending image
   - no extra countries, cities, brands, or characters unless requested

2. Scene Beats
   - each scene must change story state
   - each beat has cause/effect, emotion delta, and visual proof

3. Shot Prompts
   - each shot prompt is renderer-facing
   - each prompt includes subject, action, camera, continuity locks, lighting, and forbidden drift

4. Repair Prompts
   - evaluator failures produce targeted prompt patches
   - repairs must not rewrite the whole story

## Local Model Contract

Supported local endpoints:

- Ollama: `http://127.0.0.1:11434/api/chat`
- LM Studio/OpenAI-compatible: `http://127.0.0.1:1234/v1/chat/completions`
- Disabled fallback: deterministic mock planner

Environment:

```text
AFS_LOCAL_LLM_PROVIDER=ollama | openai_compatible | disabled
AFS_LOCAL_LLM_URL=http://127.0.0.1:11434
AFS_LOCAL_LLM_MODEL=qwen2.5:14b-instruct
AFS_LOCAL_LLM_TIMEOUT_SEC=120
```

## Required JSON Output

The LLM must return JSON only:

```json
{
  "story_spine": {
    "protagonist": "",
    "want": "",
    "obstacle": "",
    "turn": "",
    "reveal": "",
    "ending_image": ""
  },
  "continuity_locks": {
    "characters": [],
    "locations": [],
    "props": [],
    "wardrobe": [],
    "visual_rules": []
  },
  "beats": [
    {
      "beat_id": "B01",
      "purpose": "",
      "cause": "",
      "effect": "",
      "emotion_start": "",
      "emotion_end": "",
      "visual_proof": "",
      "audio_proof": ""
    }
  ],
  "shot_prompts": [
    {
      "shot_id": "S01_SH01",
      "story_function": "",
      "renderer_prompt": "",
      "negative_prompt": "",
      "continuity_rules": [],
      "audio_events": []
    }
  ]
}
```

## System Prompt

```text
You are AFS CineDirector, a local-first film planning model.
Convert the user's script into a structured narrative plan.
Preserve the user's premise. Do not add random places, cultures, brands, or characters.
Every shot must serve story causality. Avoid generic beautiful footage.
Return valid JSON only. No markdown.
```

## Prompt Assembly

Renderer prompts should be assembled from structured fields:

```text
{story_function}
Subject: {locked_character_or_object}
Action: {visual_proof}
Camera: {shot_size}, {movement}, {lens_feel}
Location: {locked_location}
Lighting: {world_state.camera_style.color}
Continuity: {continuity_rules}
Style: {project.style.visual}
```

Negative prompt:

```text
SMPTE bars, color bars, test pattern, calibration chart, TV test screen,
random new character, changed wardrobe, changed location, missing hero prop,
logo artifacts, text artifacts, low quality, distorted face, extra fingers
```

## Repair Harness

Evaluator reason to prompt patch:

```text
character_drift -> prepend locked character reference and wardrobe rule
prop_missing_or_changed -> describe prop shape, material, position, and story role
camera_mismatch -> rewrite only camera sentence
artifact_risk_high -> add artifact negatives and reduce motion complexity
audio_sync_mismatch -> shift/shorten audio event, do not rerender whole shot
```

## Product Rule

The UI can expose this as "Story Brain":

- Off: deterministic mock planner
- Local: local LLM planner
- Locked: local LLM can rewrite prompts but not change beats

AFS should store every LLM input and output as sidecar JSON for repeatability.
