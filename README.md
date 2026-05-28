# AFS - AI Film Studio

AFS is a local-first cinematic audio-video generation system. The MVP converts a
script into editable film structure, then validates the pipeline with mock video
and audio renderers before real model adapters are added.

## Local Development

```powershell
python -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
pip install -r services/orchestrator/requirements.txt
uvicorn app.main:app --reload --app-dir services/orchestrator
```

In another shell:

```powershell
npm run dev:web
```

Open `http://localhost:3000`.

## Vision Anchors

- PRD summary: `docs/AFS_PRD_v0.1.txt`
- Vision checklist: `docs/VISION_CHECKLIST.md`

## Deployment Direction

The Next.js UI can be deployed to Vercel. The local orchestrator/GPU services
should remain on the user's PC and be exposed intentionally through Cloudflare
Tunnel for trusted external testers.

The Vercel CLI is currently expected to be installed separately:

```powershell
npm i -g vercel
```
