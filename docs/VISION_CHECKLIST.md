# AFS Vision Checklist

- Local-first: no paid AI APIs in the default path.
- Film-first: project data is scene/shot/chunk oriented.
- Keyframe-first: every shot has first/middle/last slots.
- Chunk-first: render jobs operate on 1-3 second chunks.
- Memory-aware: renderer inputs use Temporal Context Packs.
- Audio-native: audio events live in the same timeline as visual events.
- Repairable: failed chunks and audio layers can be regenerated independently.
- Backend-agnostic: renderers are adapters; ComfyUI is optional.
- Research-ready: distillation and acceleration experiments stay outside the stable product path.
