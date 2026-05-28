"use client";

import {
  CheckCircle2,
  Clapperboard,
  Film,
  KeyRound,
  Loader2,
  Music2,
  Play,
  RefreshCw,
  Save,
  Scissors,
  Server,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { FormEvent, useMemo, useState } from "react";

type Project = {
  project_id: string;
  title: string;
  script_prompt: string;
  status: string;
  format: { duration: number; working_resolution: string; fps: number };
  style: { visual: string; audio: string };
};

type Shot = {
  shot_id: string;
  duration: number;
  purpose: string;
  visual_action: string;
  camera: Record<string, string>;
};

type Chunk = {
  chunk_id: string;
  shot_id: string;
  start: number;
  end: number;
  complexity: number;
};

type AudioVisualEvent = {
  event_id: string;
  shot_id: string;
  time: number;
  duration: number;
  audio: { type: string; description: string; sync_importance: number };
  story_meaning: string;
};

type CineGraph = {
  world_state: {
    tone: string;
    characters: Record<string, unknown>;
    locations: Record<string, unknown>;
    props: Record<string, unknown>;
    camera_style: Record<string, string>;
  };
  scenes: { scene_id: string; title: string; shots: string[] }[];
  shots: Shot[];
  chunks: Chunk[];
  audio_visual_events: AudioVisualEvent[];
};

const apiBase = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:8000";

const samplePrompt =
  "Two teenagers find a strange old camera in an abandoned roadside building. The image on the tape shows something that has not happened yet.";

export default function Home() {
  const [title, setTitle] = useState("Last Tape");
  const [scriptPrompt, setScriptPrompt] = useState(samplePrompt);
  const [styleHint, setStyleHint] = useState("early 2000s camcorder, lo-fi indie film");
  const [audioHint, setAudioHint] = useState("fluorescent buzz, tape hiss, distant wind");
  const [project, setProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<CineGraph | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);

  const selectedShot = graph?.shots.find((shot) => shot.shot_id === selectedShotId) ?? graph?.shots[0];
  const selectedChunks = useMemo(
    () => graph?.chunks.filter((chunk) => chunk.shot_id === selectedShot?.shot_id) ?? [],
    [graph, selectedShot?.shot_id],
  );
  const selectedEvents = useMemo(
    () => graph?.audio_visual_events.filter((event) => event.shot_id === selectedShot?.shot_id) ?? [],
    [graph, selectedShot?.shot_id],
  );

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }

  async function createAndPlan(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      setStatus("Creating local project");
      const created = await request<{ project_id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          title,
          script_prompt: scriptPrompt,
          duration: 30,
          aspect_ratio: "16:9",
          style_hint: styleHint,
          audio_hint: audioHint,
        }),
      });
      const loaded = await request<Project>(`/api/projects/${created.project_id}`);
      setProject(loaded);
      setStatus("Generating CineGraph");
      const planned = await request<CineGraph>(`/api/projects/${created.project_id}/plan`, { method: "POST" });
      setGraph(planned);
      setSelectedShotId(planned.shots[0]?.shot_id ?? null);
      setStatus("Storyboard ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateKeyframes() {
    if (!selectedShot) return;
    setBusy(true);
    try {
      setStatus(`Generating keyframe slots for ${selectedShot.shot_id}`);
      await request(`/api/shots/${selectedShot.shot_id}/keyframes/generate`, {
        method: "POST",
        body: JSON.stringify({ slots: ["first", "middle", "last"], renderer: "mock" }),
      });
      setStatus("Keyframe sidecars written");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Keyframe generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function renderShot() {
    if (!selectedShot) return;
    setBusy(true);
    try {
      setStatus(`Rendering ${selectedShot.shot_id} with MockRenderer`);
      await request(`/api/shots/${selectedShot.shot_id}/render`, {
        method: "POST",
        body: JSON.stringify({ preset: "preview", renderer: "mock", audio: true }),
      });
      setStatus("Mock video chunks rendered");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Render failed");
    } finally {
      setBusy(false);
    }
  }

  async function renderAudio() {
    if (!selectedShot) return;
    setBusy(true);
    try {
      setStatus(`Rendering audio layers for ${selectedShot.shot_id}`);
      await request(`/api/shots/${selectedShot.shot_id}/audio/render`, {
        method: "POST",
        body: JSON.stringify({ layers: ["foley", "ambience", "music"], adapter: "mock_audio" }),
      });
      setStatus("Mock audio layers rendered");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Audio render failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportProject() {
    if (!project) return;
    setBusy(true);
    try {
      setStatus("Writing export metadata");
      await request(`/api/projects/${project.project_id}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "mp4", resolution: "1280x720", include_audio: true }),
      });
      setStatus("Mock export metadata ready");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d10] text-slate-100">
      <header className="border-b border-slate-800 bg-[#11151b]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-emerald-500 text-slate-950">
              <Clapperboard size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold">AFS - AI Film Studio</h1>
              <p className="text-sm text-slate-400">Local-first cinematic generation workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300">
            <Server size={16} />
            <span>{apiBase}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[340px_1fr_340px]">
        <section className="space-y-4">
          <form onSubmit={createAndPlan} className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Wand2 size={18} className="text-emerald-400" />
              <h2 className="font-medium">Project Intake</h2>
            </div>
            <label className="mb-3 block text-sm text-slate-300">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="mb-3 block text-sm text-slate-300">
              Script Prompt
              <textarea
                value={scriptPrompt}
                onChange={(event) => setScriptPrompt(event.target.value)}
                rows={7}
                className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="mb-3 block text-sm text-slate-300">
              Visual Style
              <input
                value={styleHint}
                onChange={(event) => setStyleHint(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="mb-4 block text-sm text-slate-300">
              Audio Style
              <input
                value={audioHint}
                onChange={(event) => setAudioHint(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <button
              disabled={busy}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 font-medium text-slate-950 disabled:opacity-60"
            >
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
              Create CineGraph
            </button>
          </form>

          <section className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Film size={18} className="text-sky-300" />
              <h2 className="font-medium">Scene / Shot Tree</h2>
            </div>
            <div className="space-y-2">
              {graph?.shots.map((shot) => (
                <button
                  key={shot.shot_id}
                  onClick={() => setSelectedShotId(shot.shot_id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selectedShot?.shot_id === shot.shot_id
                      ? "border-emerald-400 bg-emerald-400/10"
                      : "border-slate-800 bg-[#0b0d10] hover:border-slate-600"
                  }`}
                >
                  <span className="font-mono text-xs text-slate-400">{shot.shot_id}</span>
                  <span className="mt-1 block text-slate-100">{shot.purpose}</span>
                </button>
              )) ?? <p className="text-sm text-slate-500">Create a project to generate shots.</p>}
            </div>
          </section>
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-slate-500">{project?.project_id ?? "no project"}</p>
                <h2 className="text-lg font-semibold">{selectedShot?.shot_id ?? "Storyboard Timeline"}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={generateKeyframes} disabled={!selectedShot || busy} icon={<KeyRound size={16} />} label="Keyframes" />
                <ActionButton onClick={renderShot} disabled={!selectedShot || busy} icon={<Play size={16} />} label="Render" />
                <ActionButton onClick={renderAudio} disabled={!selectedShot || busy} icon={<Music2 size={16} />} label="Audio" />
                <ActionButton onClick={exportProject} disabled={!project || busy} icon={<Save size={16} />} label="Export" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {["first", "middle", "last"].map((slot) => (
                <div key={slot} className="aspect-video rounded-md border border-slate-700 bg-[#0b0d10] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{slot}</span>
                    <CheckCircle2 size={15} className="text-slate-600" />
                  </div>
                  <p className="mt-8 text-sm text-slate-500">Mock keyframe slot</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-md border border-slate-800 bg-[#0b0d10] p-4">
              <p className="mb-2 text-sm font-medium text-slate-300">Chunk Timeline</p>
              <div className="flex min-h-20 items-stretch gap-2 overflow-x-auto">
                {selectedChunks.map((chunk) => (
                  <div key={chunk.chunk_id} className="min-w-36 rounded-md border border-slate-700 bg-slate-900 p-3">
                    <p className="font-mono text-xs text-emerald-300">{chunk.chunk_id.split("_").pop()}</p>
                    <p className="mt-2 text-sm">{chunk.start}s - {chunk.end}s</p>
                    <p className="text-xs text-slate-500">complexity {chunk.complexity}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-md border border-slate-800 bg-[#0b0d10] p-4">
              <p className="mb-2 text-sm font-medium text-slate-300">Video Preview</p>
              <div className="grid aspect-video place-items-center rounded-md bg-slate-950 text-center text-sm text-slate-500">
                MockRenderer writes placeholder chunks to local storage.
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Scissors size={18} className="text-amber-300" />
              <h2 className="font-medium">Evaluator / Repair</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {["Prompt Match 82", "Camera Match 72", "Artifact Risk 18"].map((metric) => (
                <div key={metric} className="rounded-md border border-slate-800 bg-[#0b0d10] px-3 py-2 text-sm text-slate-300">
                  {metric}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <RefreshCw size={18} className="text-violet-300" />
              <h2 className="font-medium">Run State</h2>
            </div>
            <p className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-slate-300">{status}</p>
          </div>

          <Inspector title="World State" data={graph?.world_state} />
          <Inspector title="Selected Shot" data={selectedShot} />

          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Music2 size={18} className="text-rose-300" />
              <h2 className="font-medium">Audio Events</h2>
            </div>
            <div className="space-y-2">
              {selectedEvents.map((event) => (
                <div key={event.event_id} className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm">
                  <p className="font-mono text-xs text-slate-500">{event.time}s / {event.audio.type}</p>
                  <p className="mt-1 text-slate-200">{event.audio.description}</p>
                  <p className="mt-1 text-xs text-slate-500">sync {event.audio.sync_importance}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 items-center gap-2 rounded-md border border-slate-700 bg-[#0b0d10] px-3 text-sm text-slate-200 hover:border-emerald-400 disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

function Inspector({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
      <h2 className="mb-3 font-medium">{title}</h2>
      <pre className="max-h-72 overflow-auto rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-xs leading-5 text-slate-300">
        {data ? JSON.stringify(data, null, 2) : "No data yet"}
      </pre>
    </div>
  );
}
