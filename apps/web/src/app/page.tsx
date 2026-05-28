"use client";

import {
  Activity,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Film,
  Gauge,
  Globe2,
  Loader2,
  MonitorPlay,
  Play,
  Server,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type SystemUsage = {
  timestamp: string;
  cpu: { usage_percent: number; core_count: number };
  memory: { used_mb: number; total_mb: number; usage_percent: number };
  disk: { used_gb: number; total_gb: number; usage_percent: number };
  gpu: {
    available: boolean;
    reason?: string;
    gpus?: {
      index: number;
      name: string;
      utilization_percent: number;
      memory_used_mb: number;
      memory_total_mb: number;
      temperature_c: number;
    }[];
  };
};

type Job = {
  job_id: string;
  project_id: string | null;
  type: string;
  target_id: string;
  status: string;
  progress: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  estimated_duration_sec: number | null;
  elapsed_sec: number;
  remaining_sec: number | null;
};

type RenderShotResponse = {
  shot_id: string;
  preview_artifact_id: string | null;
  preview_url: string | null;
};

type ShotPreviewResponse = {
  shot_id: string;
  media_url: string;
};

type Language = "ko" | "en";

const configuredApiBase = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "/api/orchestrator";

const samplePrompt =
  "버려진 주유소에서 두 청소년이 낡은 캠코더로 서로를 찍다가, 마지막에 사라진 친구의 영상을 발견하는 30초짜리 독립영화풍 영상.";

const copy = {
  ko: {
    appName: "AFS",
    subtitle: "시나리오를 넣고, 컷을 고른 뒤, 프리뷰를 만듭니다.",
    make: "만들기",
    preview: "결과",
    advanced: "고급",
    language: "언어",
    statusReady: "준비됨",
    step1Title: "1. 시나리오 입력",
    step1Body: "영화 내용을 한 문단으로 적으면 AFS가 장면, 컷, 오디오 이벤트를 자동으로 나눕니다.",
    title: "제목",
    script: "시나리오",
    visualStyle: "영상 스타일",
    audioStyle: "소리 스타일",
    createPlan: "자동 기획 만들기",
    recreatePlan: "다시 기획하기",
    step2Title: "2. 생성할 컷 선택",
    step2Body: "생성할 컷을 고르면 chunk를 내부에서 만든 뒤 조립된 프리뷰만 보여줍니다.",
    noShots: "아직 컷이 없습니다. 먼저 자동 기획을 만드세요.",
    shot: "컷",
    seconds: "초",
    step3Title: "3. 프리뷰 생성",
    step3Body: "아래 큰 버튼을 누르면 모든 구간을 만든 뒤 합쳐진 영상만 한 번에 표시합니다.",
    nextButton: "다음 단계 실행",
    planFirst: "자동 기획부터 만들기",
    keyframes: "키프레임 만들기",
    render: "프리뷰 영상 만들기",
    audio: "소리 붙이기",
    export: "내보내기 준비",
    done: "프리뷰 준비 완료",
    noPreview: "모든 구간이 완성되면 조립된 프리뷰 영상이 여기에 표시됩니다.",
    selectedShot: "선택한 컷",
    chunkPlan: "렌더링 구간",
    audioEvents: "소리 이벤트",
    progress: "진행 상황",
    system: "PC 상태",
    elapsed: "현재 소요",
    estimated: "예상",
    remaining: "남은 시간",
    noJobs: "아직 작업이 없습니다.",
    cpu: "CPU",
    gpu: "GPU",
    memory: "메모리",
    disk: "디스크",
    unavailable: "사용 불가",
    expertOpen: "전문가 정보 열기",
    expertClose: "전문가 정보 닫기",
    worldState: "World State",
    projectJson: "Project JSON",
    shotJson: "Shot JSON",
    orchestratorUrl: "Orchestrator URL",
    saveUrl: "저장",
    proxyHint: "배포 환경에서는 자동 프록시를 사용합니다. 직접 테스트할 때만 바꾸세요.",
    missingApiUrl: "Orchestrator URL이 필요합니다.",
    offline: "오케스트레이터 연결 안 됨",
    creatingProject: "로컬 프로젝트 생성 중",
    generatingGraph: "장면과 컷을 구성하는 중",
    storyboardReady: "자동 기획 완료",
    keyframeStatus: "키프레임 생성 완료",
    renderStatus: "프리뷰 영상 생성 완료",
    audioStatus: "오디오 레이어 생성 완료",
    exportStatus: "내보내기 메타데이터 준비 완료",
  },
  en: {
    appName: "AFS",
    subtitle: "Write a script, pick a shot, then generate a preview.",
    make: "Make",
    preview: "Preview",
    advanced: "Advanced",
    language: "Language",
    statusReady: "Ready",
    step1Title: "1. Enter Script",
    step1Body: "Write one paragraph. AFS turns it into scenes, shots, chunks, and audio events.",
    title: "Title",
    script: "Script",
    visualStyle: "Visual style",
    audioStyle: "Audio style",
    createPlan: "Create Plan",
    recreatePlan: "Recreate Plan",
    step2Title: "2. Pick a Shot",
    step2Body: "Pick a shot. AFS renders internal chunks first, then shows only the stitched preview.",
    noShots: "No shots yet. Create a plan first.",
    shot: "Shot",
    seconds: "sec",
    step3Title: "3. Generate Preview",
    step3Body: "Use the large button to finish all segments first, then show the stitched video once.",
    nextButton: "Run Next Step",
    planFirst: "Create plan first",
    keyframes: "Generate keyframes",
    render: "Generate preview video",
    audio: "Add audio",
    export: "Prepare export",
    done: "Preview ready",
    noPreview: "The stitched preview appears here after every segment is complete.",
    selectedShot: "Selected shot",
    chunkPlan: "Render chunks",
    audioEvents: "Audio events",
    progress: "Progress",
    system: "PC status",
    elapsed: "Elapsed",
    estimated: "Estimated",
    remaining: "Remaining",
    noJobs: "No jobs yet.",
    cpu: "CPU",
    gpu: "GPU",
    memory: "Memory",
    disk: "Disk",
    unavailable: "Unavailable",
    expertOpen: "Show expert details",
    expertClose: "Hide expert details",
    worldState: "World State",
    projectJson: "Project JSON",
    shotJson: "Shot JSON",
    orchestratorUrl: "Orchestrator URL",
    saveUrl: "Save",
    proxyHint: "Hosted builds use the proxy automatically. Override only for direct local tests.",
    missingApiUrl: "Set an orchestrator URL first.",
    offline: "Orchestrator offline",
    creatingProject: "Creating local project",
    generatingGraph: "Building scenes and shots",
    storyboardReady: "Plan ready",
    keyframeStatus: "Keyframes ready",
    renderStatus: "Preview video ready",
    audioStatus: "Audio layers ready",
    exportStatus: "Export metadata ready",
  },
} satisfies Record<Language, Record<string, string>>;

function initialOrchestratorUrl() {
  if (configuredApiBase) {
    return configuredApiBase;
  }
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem("afs.orchestratorUrl") ?? "";
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("ko");
  const t = copy[language];
  const [orchestratorUrl, setOrchestratorUrl] = useState(initialOrchestratorUrl);
  const [orchestratorInput, setOrchestratorInput] = useState(initialOrchestratorUrl);
  const [title, setTitle] = useState("Last Tape");
  const [scriptPrompt, setScriptPrompt] = useState(samplePrompt);
  const [styleHint, setStyleHint] = useState("early 2000s camcorder, lo-fi indie film");
  const [audioHint, setAudioHint] = useState("fluorescent buzz, tape hiss, distant wind");
  const [project, setProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<CineGraph | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState(t.statusReady);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const selectedShot = graph?.shots.find((shot) => shot.shot_id === selectedShotId) ?? graph?.shots[0] ?? null;
  const selectedChunks = useMemo(
    () => graph?.chunks.filter((chunk) => chunk.shot_id === selectedShot?.shot_id) ?? [],
    [graph, selectedShot?.shot_id],
  );
  const selectedEvents = useMemo(
    () => graph?.audio_visual_events.filter((event) => event.shot_id === selectedShot?.shot_id) ?? [],
    [graph, selectedShot?.shot_id],
  );

  const latestKeyframeJob = jobs.find(
    (job) => job.type === "GENERATE_KEYFRAME" && job.target_id === selectedShot?.shot_id && job.status === "succeeded",
  );
  const latestRenderJob = jobs.find(
    (job) => job.type === "STITCH_SHOT" && job.target_id === selectedShot?.shot_id && job.status === "succeeded",
  );
  const latestAudioJob = jobs.find(
    (job) => job.type === "RENDER_AUDIO_LAYER" && job.target_id === selectedShot?.shot_id && job.status === "succeeded",
  );
  const latestExportJob = jobs.find(
    (job) => job.type === "EXPORT_PROJECT" && job.project_id === project?.project_id && job.status === "succeeded",
  );

  const currentAction = !graph
    ? t.planFirst
    : !latestKeyframeJob
      ? t.keyframes
      : !latestRenderJob && !previewUrl
        ? t.render
        : !latestAudioJob
          ? t.audio
          : !latestExportJob
            ? t.export
            : t.done;

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!orchestratorUrl) {
        throw new Error(copy[language].missingApiUrl);
      }
      const response = await fetch(`${orchestratorUrl}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      return response.json();
    },
    [language, orchestratorUrl],
  );

  useEffect(() => {
    let active = true;

    async function loadUsage() {
      if (!orchestratorUrl) {
        setUsage(null);
        setUsageError(t.proxyHint);
        return;
      }
      try {
        const nextUsage = await request<SystemUsage>("/api/system/usage");
        if (active) {
          setUsage(nextUsage);
          setUsageError(null);
        }
      } catch {
        if (active) {
          setUsage(null);
          setUsageError(t.offline);
        }
      }
    }

    loadUsage();
    const interval = window.setInterval(loadUsage, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [orchestratorUrl, request, t.offline, t.proxyHint]);

  useEffect(() => {
    let active = true;

    async function loadJobs() {
      if (!orchestratorUrl) {
        setJobs([]);
        return;
      }
      try {
        const nextJobs = await request<Job[]>("/api/jobs");
        if (active) {
          setJobs(nextJobs.slice(0, 8));
        }
      } catch {
        if (active) {
          setJobs([]);
        }
      }
    }

    loadJobs();
    const interval = window.setInterval(loadJobs, 1500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [orchestratorUrl, request]);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (!selectedShot || !orchestratorUrl || !latestRenderJob) {
        setPreviewUrl(null);
        return;
      }
      try {
        const preview = await request<ShotPreviewResponse>(`/api/shots/${selectedShot.shot_id}/preview`);
        if (active) {
          setPreviewUrl(`${orchestratorUrl}${preview.media_url}?t=${Date.now()}`);
        }
      } catch {
        if (active) {
          setPreviewUrl(null);
        }
      }
    }

    loadPreview();
    return () => {
      active = false;
    };
  }, [latestRenderJob, orchestratorUrl, request, selectedShot]);

  function saveOrchestratorUrl() {
    const normalized = orchestratorInput.trim().replace(/\/$/, "");
    setOrchestratorUrl(normalized);
    if (normalized) {
      window.localStorage.setItem("afs.orchestratorUrl", normalized);
    } else {
      window.localStorage.removeItem("afs.orchestratorUrl");
    }
  }

  async function createAndPlan() {
    setBusy(true);
    setPreviewUrl(null);
    try {
      setStatus(t.creatingProject);
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
      setStatus(t.generatingGraph);
      const planned = await request<CineGraph>(`/api/projects/${created.project_id}/plan`, { method: "POST" });
      setGraph(planned);
      setSelectedShotId(planned.shots[0]?.shot_id ?? null);
      setStatus(t.storyboardReady);
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
      setStatus(`${selectedShot.shot_id} ${t.keyframes}`);
      await request(`/api/shots/${selectedShot.shot_id}/keyframes/generate`, {
        method: "POST",
        body: JSON.stringify({ slots: ["first", "middle", "last"], renderer: "mock" }),
      });
      setStatus(t.keyframeStatus);
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
      setStatus(`${selectedShot.shot_id} ${t.render}`);
      const rendered = await request<RenderShotResponse>(`/api/shots/${selectedShot.shot_id}/render`, {
        method: "POST",
        body: JSON.stringify({ preset: "preview", renderer: "mock", audio: true }),
      });
      if (rendered.preview_url) {
        setPreviewUrl(`${orchestratorUrl}${rendered.preview_url}?t=${Date.now()}`);
      }
      setStatus(t.renderStatus);
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
      setStatus(`${selectedShot.shot_id} ${t.audio}`);
      await request(`/api/shots/${selectedShot.shot_id}/audio/render`, {
        method: "POST",
        body: JSON.stringify({ layers: ["foley", "ambience", "music"], adapter: "mock_audio" }),
      });
      setStatus(t.audioStatus);
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
      setStatus(t.export);
      await request(`/api/projects/${project.project_id}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "mp4", resolution: "1280x720", include_audio: true }),
      });
      setStatus(t.exportStatus);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function runNextStep() {
    if (!graph) {
      await createAndPlan();
      return;
    }
    if (!latestKeyframeJob) {
      await generateKeyframes();
      return;
    }
    if (!latestRenderJob && !previewUrl) {
      await renderShot();
      return;
    }
    if (!latestAudioJob) {
      await renderAudio();
      return;
    }
    if (!latestExportJob) {
      await exportProject();
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d10] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0b0d10]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-md bg-emerald-400 text-slate-950">
              <Clapperboard size={22} />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{t.appName}</h1>
              <p className="text-sm text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" href="#make">
              {t.make}
            </a>
            <a className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" href="#preview">
              {t.preview}
            </a>
            <button
              className="flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200"
              type="button"
              onClick={() => setLanguage((current) => (current === "ko" ? "en" : "ko"))}
            >
              <Globe2 size={15} />
              {language === "ko" ? "KO" : "EN"}
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-800 bg-[#10151c]">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-4 md:grid-cols-4">
          <StepPill number="1" label={t.step1Title} done={Boolean(graph)} active={!graph} />
          <StepPill number="2" label={t.step2Title} done={Boolean(selectedShot)} active={Boolean(graph && !selectedShot)} />
          <StepPill number="3" label={t.step3Title} done={Boolean(previewUrl)} active={Boolean(selectedShot && !previewUrl)} />
          <div className="rounded-md border border-slate-800 bg-[#0b0d10] p-3">
            <p className="text-xs text-slate-500">{t.progress}</p>
            <p className="truncate text-sm text-emerald-300">{status}</p>
          </div>
        </div>
      </section>

      <div id="make" className="mx-auto grid max-w-[1500px] gap-4 px-4 py-5 lg:grid-cols-[0.78fr_1.22fr]">
        <section className="space-y-4">
          <Panel title={t.step1Title} description={t.step1Body} icon={<Wand2 size={18} className="text-emerald-300" />}>
            <div className="grid gap-3">
              <label className="text-sm text-slate-300">
                {t.title}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
              <label className="text-sm text-slate-300">
                {t.script}
                <textarea
                  value={scriptPrompt}
                  onChange={(event) => setScriptPrompt(event.target.value)}
                  rows={7}
                  className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-3 text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-300">
                  {t.visualStyle}
                  <input
                    value={styleHint}
                    onChange={(event) => setStyleHint(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 text-slate-100 outline-none focus:border-emerald-400"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  {t.audioStyle}
                  <input
                    value={audioHint}
                    onChange={(event) => setAudioHint(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 text-slate-100 outline-none focus:border-emerald-400"
                  />
                </label>
              </div>
              <button
                className="flex h-12 items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 font-semibold text-slate-950 disabled:opacity-60"
                disabled={busy}
                type="button"
                onClick={createAndPlan}
              >
                {busy && !graph ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {graph ? t.recreatePlan : t.createPlan}
              </button>
            </div>
          </Panel>

          <Panel title={t.step2Title} description={t.step2Body} icon={<Film size={18} className="text-sky-300" />}>
            {graph ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {graph.shots.map((shot, index) => (
                  <button
                    key={shot.shot_id}
                    className={`rounded-md border p-3 text-left transition ${
                      selectedShot?.shot_id === shot.shot_id
                        ? "border-emerald-400 bg-emerald-400/10"
                        : "border-slate-800 bg-[#0b0d10] hover:border-slate-600"
                    }`}
                    type="button"
                    onClick={() => {
                      setSelectedShotId(shot.shot_id);
                      setPreviewUrl(null);
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">
                        {t.shot} {index + 1}
                      </span>
                      <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400">
                        {shot.duration}s
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-100">{shot.purpose}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">{shot.visual_action}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState text={t.noShots} />
            )}
          </Panel>
        </section>

        <section id="preview" className="space-y-4">
          <Panel title={t.step3Title} description={t.step3Body} icon={<MonitorPlay size={18} className="text-amber-300" />}>
            <div className="mb-4 rounded-md border border-slate-800 bg-[#0b0d10] p-3">
              <p className="text-xs text-slate-500">{t.selectedShot}</p>
              <p className="mt-1 text-base font-semibold text-slate-100">{selectedShot?.shot_id ?? "-"}</p>
              <p className="mt-1 text-sm text-slate-400">{selectedShot?.purpose ?? t.noShots}</p>
            </div>

            <button
              className="mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 font-semibold text-slate-950 disabled:opacity-60"
              disabled={busy || Boolean(graph && !selectedShot)}
              type="button"
              onClick={runNextStep}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              {currentAction === t.done ? t.done : `${t.nextButton}: ${currentAction}`}
            </button>

            <div className="overflow-hidden rounded-md border border-slate-800 bg-black shadow-2xl shadow-black/30">
              {previewUrl ? (
                <video key={previewUrl} controls className="aspect-video min-h-[360px] w-full bg-black object-contain" src={previewUrl} />
              ) : (
                <div className="grid aspect-video min-h-[360px] place-items-center p-6 text-center text-sm text-slate-500">
                  <div>
                    <MonitorPlay className="mx-auto mb-3 text-slate-700" size={36} />
                    {t.noPreview}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title={t.progress} icon={<Activity size={18} className="text-violet-300" />}>
            <JobProgressPanel jobs={jobs} t={t} />
          </Panel>

          <Panel title={t.system} icon={<Gauge size={18} className="text-rose-300" />}>
            <SystemUsagePanel usage={usage} error={usageError} t={t} />
          </Panel>
        </section>
      </div>

      <section className="mx-auto max-w-7xl px-4 pb-8">
        <button
          className="flex h-11 w-full items-center justify-between rounded-md border border-slate-800 bg-[#11151b] px-4 text-left text-sm font-medium text-slate-200"
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          <span>{advancedOpen ? t.expertClose : t.expertOpen}</span>
          <ChevronDown className={advancedOpen ? "rotate-180 transition" : "transition"} size={18} />
        </button>

        {advancedOpen ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title={t.chunkPlan}>
              <div className="space-y-2">
                {selectedChunks.map((chunk) => (
                  <div key={chunk.chunk_id} className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm">
                    <p className="font-mono text-xs text-emerald-300">{chunk.chunk_id}</p>
                    <p className="mt-1 text-slate-300">
                      {chunk.start}s - {chunk.end}s / complexity {chunk.complexity}
                    </p>
                  </div>
                ))}
                {selectedChunks.length === 0 ? <EmptyState text="-" /> : null}
              </div>
            </Panel>

            <Panel title={t.audioEvents}>
              <div className="space-y-2">
                {selectedEvents.map((event) => (
                  <div key={event.event_id} className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm">
                    <p className="font-mono text-xs text-slate-500">
                      {event.time}s / {event.audio.type}
                    </p>
                    <p className="mt-1 text-slate-200">{event.audio.description}</p>
                  </div>
                ))}
                {selectedEvents.length === 0 ? <EmptyState text="-" /> : null}
              </div>
            </Panel>

            <Panel title={t.orchestratorUrl} icon={<Server size={18} className="text-slate-300" />}>
              <div className="flex gap-2">
                <input
                  value={orchestratorInput}
                  onChange={(event) => setOrchestratorInput(event.target.value)}
                  placeholder="/api/orchestrator"
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
                />
                <button
                  className="rounded-md bg-emerald-400 px-3 text-sm font-semibold text-slate-950"
                  type="button"
                  onClick={saveOrchestratorUrl}
                >
                  {t.saveUrl}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{t.proxyHint}</p>
            </Panel>

            <Inspector title={t.worldState} data={graph?.world_state} />
            <Inspector title={t.projectJson} data={project} />
            <Inspector title={t.shotJson} data={selectedShot} />
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StepPill({ number, label, done, active }: { number: string; label: string; done: boolean; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-3 ${
        done
          ? "border-emerald-400 bg-emerald-400/10"
          : active
            ? "border-amber-300 bg-amber-300/10"
            : "border-slate-800 bg-[#0b0d10]"
      }`}
    >
      <div className="grid size-8 shrink-0 place-items-center rounded bg-slate-900 font-mono text-sm text-slate-300">
        {done ? <CheckCircle2 size={17} className="text-emerald-300" /> : number}
      </div>
      <p className="text-sm font-medium text-slate-100">{label}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#11151b] p-4">
      <div className="mb-4 flex items-start gap-2">
        {icon ? <div className="mt-0.5">{icon}</div> : null}
        <div>
          <h2 className="font-semibold text-slate-100">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-5 text-slate-400">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-md border border-dashed border-slate-700 bg-[#0b0d10] p-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function SystemUsagePanel({
  usage,
  error,
  t,
}: {
  usage: SystemUsage | null;
  error: string | null;
  t: Record<string, string>;
}) {
  const gpu = usage?.gpu.gpus?.[0];
  if (error) {
    return <p className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-amber-300">{error}</p>;
  }
  return (
    <div className="grid gap-2">
      <UsageMeter label={t.cpu} value={usage?.cpu.usage_percent ?? 0} detail={usage ? `${usage.cpu.core_count} cores` : "-"} />
      <UsageMeter
        label={t.gpu}
        value={gpu?.utilization_percent ?? 0}
        detail={gpu ? `${gpu.name} | ${gpu.memory_used_mb}/${gpu.memory_total_mb} MB | ${gpu.temperature_c}C` : t.unavailable}
      />
      <UsageMeter
        label={t.memory}
        value={usage?.memory.usage_percent ?? 0}
        detail={usage ? `${usage.memory.used_mb}/${usage.memory.total_mb} MB` : "-"}
      />
      <UsageMeter label={t.disk} value={usage?.disk.usage_percent ?? 0} detail={usage ? `${usage.disk.used_gb}/${usage.disk.total_gb} GB` : "-"} />
    </div>
  );
}

function UsageMeter({ label, value, detail }: { label: string; value: number; detail: string }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-md border border-slate-800 bg-[#0b0d10] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="font-mono text-xs text-slate-400">{normalized.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-emerald-400" style={{ width: `${normalized}%` }} />
      </div>
      <p className="mt-2 truncate text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function JobProgressPanel({ jobs, t }: { jobs: Job[]; t: Record<string, string> }) {
  if (jobs.length === 0) {
    return <EmptyState text={t.noJobs} />;
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobProgressItem key={job.job_id} job={job} t={t} />
      ))}
    </div>
  );
}

function JobProgressItem({ job, t }: { job: Job; t: Record<string, string> }) {
  const percent = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
  return (
    <div className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-200">{job.type}</p>
          <p className="truncate font-mono text-xs text-slate-500">{job.target_id}</p>
        </div>
        <span className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-300">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-emerald-400 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <span>
          {t.elapsed}: {formatSeconds(job.elapsed_sec)}
        </span>
        <span>
          {t.estimated}: {formatSeconds(job.estimated_duration_sec)}
        </span>
        <span>
          {t.remaining}: {formatSeconds(job.remaining_sec)}
        </span>
      </div>
    </div>
  );
}

function formatSeconds(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function Inspector({ title, data }: { title: string; data: unknown }) {
  return (
    <Panel title={title}>
      <pre className="max-h-72 overflow-auto rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-xs leading-5 text-slate-300">
        {data ? JSON.stringify(data, null, 2) : "-"}
      </pre>
    </Panel>
  );
}
