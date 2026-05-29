# AFS Upscale Strategy

AFS should not upscale every generated frame blindly. That makes local rendering slower, increases storage, and wastes VRAM on shots that may be rejected.

## v1 Policy

1. Generate shots at fast working resolution.
2. Stitch only completed shots into a preview.
3. Upscale the stitched preview to 1280x720 with Lanczos during export.
4. Keep original shot files untouched for repair and re-export.

This is currently implemented as `final_only_ffmpeg_lanczos`.

## Next Adapter

Add an `UpscaleAdapter` after shot approval:

```text
shot render
-> evaluator
-> approve or repair
-> selective upscale only approved shots
-> stitch master
```

Candidate local backends:

- Real-ESRGAN NCNN/Vulkan for fast 2x spatial SR
- Video2X as a wrapper option
- RIFE only when frame interpolation is explicitly requested
- Topaz CLI only as an optional external adapter

## Cost Control

- Draft: no SR, preview encode only
- Preview: final-only Lanczos 720p
- Final: approved-shot 2x SR, then 720p/1080p encode
- Master: cache approved SR frames, repair failed shots only

## Structural Rule

Upscale should be a repairable pipeline stage, not part of raw generation. AFS saves both raw shot media and upscaled exports so changing upscale settings does not require re-rendering the model.
