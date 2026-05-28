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
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type Language = "en" | "ko";

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

const configuredApiBase = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "/api/orchestrator";

const samplePrompt =
  "Two teenagers find a strange old camera in an abandoned roadside building. The image on the tape shows something that has not happened yet.";

const keyframeSlots = ["first", "middle", "last"] as const;

function initialOrchestratorUrl() {
  if (configuredApiBase) {
    return configuredApiBase;
  }
  if (typeof window === "undefined") {
    return "";
  }
  const saved = window.localStorage.getItem("afs.orchestratorUrl");
  if (saved) {
    return saved;
  }
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "/api/orchestrator"
    : "";
}

const translations = {
  en: {
    subtitle: "Local-first cinematic generation workspace",
    projectIntake: "Project Intake",
    title: "Title",
    scriptPrompt: "Script Prompt",
    visualStyle: "Visual Style",
    audioStyle: "Audio Style",
    createCineGraph: "Create CineGraph",
    sceneShotTree: "Scene / Shot Tree",
    emptyShots: "Create a project to generate shots.",
    noProject: "no project",
    storyboardTimeline: "Storyboard Timeline",
    keyframes: "Keyframes",
    render: "Render",
    audio: "Audio",
    export: "Export",
    first: "first",
    middle: "middle",
    last: "last",
    keyframeSlot: "Mock keyframe slot",
    chunkTimeline: "Chunk Timeline",
    complexity: "complexity",
    videoPreview: "Video Preview",
    previewText: "MockRenderer writes placeholder chunks to local storage.",
    noPreview: "Render a shot to generate a preview.",
    previewUnavailable: "Preview media is not available yet.",
    evaluatorRepair: "Evaluator / Repair",
    promptMatch: "Prompt Match 82",
    cameraMatch: "Camera Match 72",
    artifactRisk: "Artifact Risk 18",
    runState: "Run State",
    worldState: "World State",
    selectedShot: "Selected Shot",
    audioEvents: "Audio Events",
    noData: "No data yet",
    language: "Language",
    systemUsage: "System Usage",
    renderQueue: "Render Queue",
    progress: "Progress",
    elapsed: "Elapsed",
    estimated: "Estimated",
    remaining: "Remaining",
    noJobs: "No jobs yet.",
    workflow: "Workflow",
    nextAction: "Next Action",
    stepProject: "Project",
    stepShot: "Shot",
    stepKeyframes: "Keyframes",
    stepRender: "Render",
    stepAudio: "Audio",
    stepExport: "Export",
    actionCreate: "Create the project plan first.",
    actionSelectShot: "Select a shot from the shot tree.",
    actionKeyframes: "Generate keyframes for the selected shot.",
    actionRender: "Render the selected shot.",
    actionAudio: "Add mock audio layers.",
    actionExport: "Export the project metadata.",
    actionDone: "Preview is ready. Continue refining or export.",
    cpu: "CPU",
    gpu: "GPU",
    memory: "Memory",
    disk: "Disk",
    unavailable: "Unavailable",
    offline: "Orchestrator offline",
    orchestratorUrl: "Orchestrator URL",
    localOnlyHint: "AFS uses the hosted proxy automatically. Override this only for direct local testing.",
    saveUrl: "Save URL",
    missingApiUrl: "Set an orchestrator URL first.",
    ready: "Ready",
    creatingProject: "Creating local project",
    generatingGraph: "Generating CineGraph",
    storyboardReady: "Storyboard ready",
    keyframeStatus: "Keyframe sidecars written",
    renderStatus: "Mock video chunks rendered",
    audioStatus: "Mock audio layers rendered",
    exportStatus: "Mock export metadata ready",
  },
  ko: {
    subtitle: "로컬 우선 영화형 생성 워크스페이스",
    projectIntake: "프로젝트 입력",
    title: "제목",
    scriptPrompt: "시나리오 프롬프트",
    visualStyle: "비주얼 스타일",
    audioStyle: "오디오 스타일",
    createCineGraph: "CineGraph 생성",
    sceneShotTree: "씬 / 샷 트리",
    emptyShots: "프로젝트를 만들면 샷이 생성됩니다.",
    noProject: "프로젝트 없음",
    storyboardTimeline: "스토리보드 타임라인",
    keyframes: "키프레임",
    render: "렌더",
    audio: "오디오",
    export: "내보내기",
    first: "첫 장면",
    middle: "중간",
    last: "마지막",
    keyframeSlot: "Mock 키프레임 슬롯",
    chunkTimeline: "청크 타임라인",
    complexity: "복잡도",
    videoPreview: "비디오 프리뷰",
    previewText: "MockRenderer가 로컬 저장소에 placeholder 청크를 기록합니다.",
    noPreview: "샷을 렌더하면 프리뷰가 표시됩니다.",
    previewUnavailable: "아직 프리뷰 미디어가 없습니다.",
    evaluatorRepair: "평가기 / 리페어",
    promptMatch: "프롬프트 일치 82",
    cameraMatch: "카메라 일치 72",
    artifactRisk: "아티팩트 위험 18",
    runState: "실행 상태",
    worldState: "월드 상태",
    selectedShot: "선택된 샷",
    audioEvents: "오디오 이벤트",
    noData: "아직 데이터 없음",
    language: "언어",
    systemUsage: "시스템 사용량",
    renderQueue: "렌더 큐",
    progress: "진행률",
    elapsed: "현재 소요",
    estimated: "예상 소요",
    remaining: "남은 시간",
    noJobs: "아직 작업이 없습니다.",
    workflow: "생성 순서",
    nextAction: "다음 단계",
    stepProject: "프로젝트",
    stepShot: "샷 선택",
    stepKeyframes: "키프레임",
    stepRender: "렌더",
    stepAudio: "오디오",
    stepExport: "내보내기",
    actionCreate: "먼저 프로젝트 계획을 생성하세요.",
    actionSelectShot: "샷 트리에서 샷을 선택하세요.",
    actionKeyframes: "선택한 샷의 키프레임을 생성하세요.",
    actionRender: "선택한 샷을 렌더하세요.",
    actionAudio: "Mock 오디오 레이어를 추가하세요.",
    actionExport: "프로젝트 메타데이터를 내보내세요.",
    actionDone: "프리뷰가 준비됐습니다. 계속 수정하거나 내보내세요.",
    cpu: "CPU",
    gpu: "GPU",
    memory: "메모리",
    disk: "디스크",
    unavailable: "사용 불가",
    offline: "오케스트레이터 오프라인",
    orchestratorUrl: "Orchestrator URL",
    localOnlyHint: "AFS가 호스팅 프록시를 자동 사용합니다. 직접 로컬 테스트할 때만 바꾸세요.",
    saveUrl: "URL 저장",
    missingApiUrl: "먼저 orchestrator URL을 설정하세요.",
    ready: "준비됨",
    creatingProject: "로컬 프로젝트 생성 중",
    generatingGraph: "CineGraph 생성 중",
    storyboardReady: "스토리보드 준비 완료",
    keyframeStatus: "키프레임 sidecar 기록 완료",
    renderStatus: "Mock 비디오 청크 렌더 완료",
    audioStatus: "Mock 오디오 레이어 렌더 완료",
    exportStatus: "Mock export metadata 준비 완료",
  },
} satisfies Record<Language, Record<string, string>>;

export default function Home() {
  const [language, setLanguage] = useState<Language>("ko");
  const [orchestratorUrl, setOrchestratorUrl] = useState(initialOrchestratorUrl);
  const [orchestratorInput, setOrchestratorInput] = useState(initialOrchestratorUrl);
  const [title, setTitle] = useState("Last Tape");
  const [scriptPrompt, setScriptPrompt] = useState(samplePrompt);
  const [styleHint, setStyleHint] = useState("early 2000s camcorder, lo-fi indie film");
  const [audioHint, setAudioHint] = useState("fluorescent buzz, tape hiss, distant wind");
  const [project, setProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<CineGraph | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [status, setStatus] = useState(translations.ko.ready);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const t = translations[language];

  const selectedShot = graph?.shots.find((shot) => shot.shot_id === selectedShotId) ?? graph?.shots[0];
  const selectedChunks = useMemo(
    () => graph?.chunks.filter((chunk) => chunk.shot_id === selectedShot?.shot_id) ?? [],
    [graph, selectedShot?.shot_id],
  );
  const selectedEvents = useMemo(
    () => graph?.audio_visual_events.filter((event) => event.shot_id === selectedShot?.shot_id) ?? [],
    [graph, selectedShot?.shot_id],
  );
  const latestKeyframeJob = jobs.find((job) => job.type === "GENERATE_KEYFRAME" && job.target_id === selectedShot?.shot_id && job.status === "succeeded");
  const latestRenderJob = jobs.find((job) => job.type === "STITCH_SHOT" && job.target_id === selectedShot?.shot_id && job.status === "succeeded");
  const latestAudioJob = jobs.find((job) => job.type === "RENDER_AUDIO_LAYER" && job.target_id === selectedShot?.shot_id && job.status === "succeeded");
  const latestExportJob = jobs.find((job) => job.type === "EXPORT_PROJECT" && job.project_id === project?.project_id && job.status === "succeeded");
  const workflowSteps = [
    { key: "project", label: t.stepProject, done: Boolean(project && graph), active: !graph },
    { key: "shot", label: t.stepShot, done: Boolean(selectedShot), active: Boolean(graph && !selectedShot) },
    { key: "keyframes", label: t.stepKeyframes, done: Boolean(latestKeyframeJob), active: Boolean(selectedShot && !latestKeyframeJob) },
    { key: "render", label: t.stepRender, done: Boolean(latestRenderJob || previewUrl), active: Boolean(latestKeyframeJob && !latestRenderJob && !previewUrl) },
    { key: "audio", label: t.stepAudio, done: Boolean(latestAudioJob), active: Boolean((latestRenderJob || previewUrl) && !latestAudioJob) },
    { key: "export", label: t.stepExport, done: Boolean(latestExportJob), active: Boolean(latestAudioJob && !latestExportJob) },
  ];
  const nextAction = !graph
    ? t.actionCreate
    : !selectedShot
      ? t.actionSelectShot
      : !latestKeyframeJob
        ? t.actionKeyframes
        : !latestRenderJob && !previewUrl
          ? t.actionRender
          : !latestAudioJob
            ? t.actionAudio
            : !latestExportJob
              ? t.actionExport
              : t.actionDone;

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!orchestratorUrl) {
      throw new Error(t.missingApiUrl);
    }
    const response = await fetch(`${orchestratorUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  }, [orchestratorUrl, t.missingApiUrl]);

  function saveOrchestratorUrl() {
    const normalized = orchestratorInput.trim().replace(/\/$/, "");
    setOrchestratorUrl(normalized);
    if (normalized) {
      window.localStorage.setItem("afs.orchestratorUrl", normalized);
    } else {
      window.localStorage.removeItem("afs.orchestratorUrl");
    }
    setStatus(normalized ? `${t.orchestratorUrl}: ${normalized}` : t.missingApiUrl);
  }

  useEffect(() => {
    let active = true;

    async function loadUsage() {
      if (!orchestratorUrl) {
        setUsage(null);
        setUsageError(t.localOnlyHint);
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
  }, [orchestratorUrl, request, t.localOnlyHint, t.offline]);

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
      if (!selectedShot || !orchestratorUrl) {
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
  }, [orchestratorUrl, request, selectedShot]);

  async function createAndPlan(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
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
      setStatus(`Generating keyframe slots for ${selectedShot.shot_id}`);
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
      setStatus(`Rendering ${selectedShot.shot_id} with MockRenderer`);
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
      setStatus(`Rendering audio layers for ${selectedShot.shot_id}`);
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
      setStatus("Writing export metadata");
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
              <p className="text-sm text-slate-400">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center rounded-md border border-slate-700 p-1 text-sm">
              <button
                onClick={() => setLanguage("ko")}
                className={`h-7 rounded px-3 ${language === "ko" ? "bg-emerald-400 text-slate-950" : "text-slate-300"}`}
                title={t.language}
              >
                KO
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`h-7 rounded px-3 ${language === "en" ? "bg-emerald-400 text-slate-950" : "text-slate-300"}`}
                title={t.language}
              >
                EN
              </button>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300">
              <Server size={16} />
              <span>{orchestratorUrl || t.missingApiUrl}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-800 bg-[#0d1117]">
        <div className="mx-auto max-w-7xl px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">{t.workflow}</p>
              <p className="text-sm text-emerald-300">{t.nextAction}: {nextAction}</p>
            </div>
            <PrimaryWorkflowAction
              t={t}
              busy={busy}
              graphReady={Boolean(graph)}
              selectedShot={Boolean(selectedShot)}
              keyframesDone={Boolean(latestKeyframeJob)}
              renderDone={Boolean(latestRenderJob || previewUrl)}
              audioDone={Boolean(latestAudioJob)}
              exportDone={Boolean(latestExportJob)}
              onCreate={(event) => createAndPlan(event)}
              onKeyframes={generateKeyframes}
              onRender={renderShot}
              onAudio={renderAudio}
              onExport={exportProject}
            />
          </div>
          <div className="grid gap-2 md:grid-cols-6">
            {workflowSteps.map((step, index) => (
              <div
                key={step.key}
                className={`rounded-md border px-3 py-2 ${
                  step.done
                    ? "border-emerald-400 bg-emerald-400/10"
                    : step.active
                      ? "border-amber-300 bg-amber-300/10"
                      : "border-slate-800 bg-[#11151b]"
                }`}
              >
                <p className="font-mono text-xs text-slate-500">{String(index + 1).padStart(2, "0")}</p>
                <p className="text-sm font-medium text-slate-100">{step.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-[340px_1fr_340px]">
        <section className="space-y-4">
          <section className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <label className="block text-sm text-slate-300">
              {t.orchestratorUrl}
              <div className="mt-1 flex gap-2">
                <input
                  value={orchestratorInput}
                  onChange={(event) => setOrchestratorInput(event.target.value)}
                  placeholder="/api/orchestrator"
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={saveOrchestratorUrl}
                  className="h-10 rounded-md bg-emerald-400 px-3 text-sm font-medium text-slate-950"
                >
                  {t.saveUrl}
                </button>
              </div>
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-500">{t.localOnlyHint}</p>
          </section>

          <form onSubmit={createAndPlan} className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Wand2 size={18} className="text-emerald-400" />
              <h2 className="font-medium">{t.projectIntake}</h2>
            </div>
            <label className="mb-3 block text-sm text-slate-300">
              {t.title}
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="mb-3 block text-sm text-slate-300">
              {t.scriptPrompt}
              <textarea
                value={scriptPrompt}
                onChange={(event) => setScriptPrompt(event.target.value)}
                rows={7}
                className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="mb-3 block text-sm text-slate-300">
              {t.visualStyle}
              <input
                value={styleHint}
                onChange={(event) => setStyleHint(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
              />
            </label>
            <label className="mb-4 block text-sm text-slate-300">
              {t.audioStyle}
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
              {t.createCineGraph}
            </button>
          </form>

          <section className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Film size={18} className="text-sky-300" />
              <h2 className="font-medium">{t.sceneShotTree}</h2>
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
              )) ?? <p className="text-sm text-slate-500">{t.emptyShots}</p>}
            </div>
          </section>
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-slate-500">{project?.project_id ?? t.noProject}</p>
                <h2 className="text-lg font-semibold">{selectedShot?.shot_id ?? t.storyboardTimeline}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={generateKeyframes} disabled={!selectedShot || busy} icon={<KeyRound size={16} />} label={t.keyframes} />
                <ActionButton onClick={renderShot} disabled={!selectedShot || busy} icon={<Play size={16} />} label={t.render} />
                <ActionButton onClick={renderAudio} disabled={!selectedShot || busy} icon={<Music2 size={16} />} label={t.audio} />
                <ActionButton onClick={exportProject} disabled={!project || busy} icon={<Save size={16} />} label={t.export} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {keyframeSlots.map((slot) => (
                <div key={slot} className="aspect-video rounded-md border border-slate-700 bg-[#0b0d10] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{t[slot]}</span>
                    <CheckCircle2 size={15} className="text-slate-600" />
                  </div>
                  <p className="mt-8 text-sm text-slate-500">{t.keyframeSlot}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-md border border-slate-800 bg-[#0b0d10] p-4">
              <p className="mb-2 text-sm font-medium text-slate-300">{t.chunkTimeline}</p>
              <div className="flex min-h-20 items-stretch gap-2 overflow-x-auto">
                {selectedChunks.map((chunk) => (
                  <div key={chunk.chunk_id} className="min-w-36 rounded-md border border-slate-700 bg-slate-900 p-3">
                    <p className="font-mono text-xs text-emerald-300">{chunk.chunk_id.split("_").pop()}</p>
                    <p className="mt-2 text-sm">{chunk.start}s - {chunk.end}s</p>
                    <p className="text-xs text-slate-500">{t.complexity} {chunk.complexity}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-md border border-slate-800 bg-[#0b0d10] p-4">
              <p className="mb-2 text-sm font-medium text-slate-300">{t.videoPreview}</p>
              {previewUrl ? (
                <video key={previewUrl} controls className="aspect-video w-full rounded-md bg-slate-950" src={previewUrl}>
                  {t.previewUnavailable}
                </video>
              ) : (
                <div className="grid aspect-video place-items-center rounded-md bg-slate-950 p-6 text-center text-sm text-slate-500">
                  <span>{t.noPreview}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Scissors size={18} className="text-amber-300" />
              <h2 className="font-medium">{t.evaluatorRepair}</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[t.promptMatch, t.cameraMatch, t.artifactRisk].map((metric) => (
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
              <h2 className="font-medium">{t.runState}</h2>
            </div>
            <p className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-slate-300">{status}</p>
          </div>

          <SystemUsagePanel usage={usage} error={usageError} t={t} />
          <JobProgressPanel jobs={jobs} t={t} />

          <Inspector title={t.worldState} data={graph?.world_state} emptyText={t.noData} />
          <Inspector title={t.selectedShot} data={selectedShot} emptyText={t.noData} />

          <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Music2 size={18} className="text-rose-300" />
              <h2 className="font-medium">{t.audioEvents}</h2>
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

function PrimaryWorkflowAction({
  t,
  busy,
  graphReady,
  selectedShot,
  keyframesDone,
  renderDone,
  audioDone,
  exportDone,
  onCreate,
  onKeyframes,
  onRender,
  onAudio,
  onExport,
}: {
  t: Record<string, string>;
  busy: boolean;
  graphReady: boolean;
  selectedShot: boolean;
  keyframesDone: boolean;
  renderDone: boolean;
  audioDone: boolean;
  exportDone: boolean;
  onCreate: (event: FormEvent) => void;
  onKeyframes: () => void;
  onRender: () => void;
  onAudio: () => void;
  onExport: () => void;
}) {
  if (!graphReady) {
    return (
      <button
        disabled={busy}
        onClick={(event) => onCreate(event)}
        className="flex h-10 items-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-medium text-slate-950 disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {t.createCineGraph}
      </button>
    );
  }
  if (!selectedShot) {
    return <span className="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-200">{t.actionSelectShot}</span>;
  }
  if (!keyframesDone) {
    return <WorkflowButton busy={busy} icon={<KeyRound size={16} />} label={t.keyframes} onClick={onKeyframes} />;
  }
  if (!renderDone) {
    return <WorkflowButton busy={busy} icon={<Play size={16} />} label={t.render} onClick={onRender} />;
  }
  if (!audioDone) {
    return <WorkflowButton busy={busy} icon={<Music2 size={16} />} label={t.audio} onClick={onAudio} />;
  }
  if (!exportDone) {
    return <WorkflowButton busy={busy} icon={<Save size={16} />} label={t.export} onClick={onExport} />;
  }
  return <span className="rounded-md border border-emerald-400 px-3 py-2 text-sm text-emerald-300">{t.actionDone}</span>;
}

function WorkflowButton({
  busy,
  icon,
  label,
  onClick,
}: {
  busy: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-md bg-emerald-400 px-4 text-sm font-medium text-slate-950 disabled:opacity-60"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}
      {label}
    </button>
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
  return (
    <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
      <h2 className="mb-3 font-medium">{t.systemUsage}</h2>
      {error ? (
        <p className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-amber-300">{error}</p>
      ) : (
        <div className="grid gap-2 text-sm">
          <UsageMeter label={t.cpu} value={usage?.cpu.usage_percent ?? 0} detail={usage ? `${usage.cpu.core_count} cores` : "-"} />
          <UsageMeter label={t.memory} value={usage?.memory.usage_percent ?? 0} detail={usage ? `${usage.memory.used_mb} / ${usage.memory.total_mb} MB` : "-"} />
          <UsageMeter label={t.disk} value={usage?.disk.usage_percent ?? 0} detail={usage ? `${usage.disk.used_gb} / ${usage.disk.total_gb} GB` : "-"} />
          <UsageMeter
            label={t.gpu}
            value={gpu?.utilization_percent ?? 0}
            detail={gpu ? `${gpu.name} | ${gpu.memory_used_mb} / ${gpu.memory_total_mb} MB | ${gpu.temperature_c}C` : t.unavailable}
          />
        </div>
      )}
    </div>
  );
}

function JobProgressPanel({ jobs, t }: { jobs: Job[]; t: Record<string, string> }) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
      <h2 className="mb-3 font-medium">{t.renderQueue}</h2>
      {jobs.length === 0 ? (
        <p className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-slate-500">{t.noJobs}</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <JobProgressItem key={job.job_id} job={job} t={t} />
          ))}
        </div>
      )}
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
        <span>{t.elapsed}: {formatSeconds(job.elapsed_sec)}</span>
        <span>{t.estimated}: {formatSeconds(job.estimated_duration_sec)}</span>
        <span>{t.remaining}: {formatSeconds(job.remaining_sec)}</span>
      </div>
      <p className="mt-1 font-mono text-xs text-slate-600">{job.status}</p>
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

function UsageMeter({ label, value, detail }: { label: string; value: number; detail: string }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-md border border-slate-800 bg-[#0b0d10] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium text-slate-200">{label}</span>
        <span className="font-mono text-xs text-slate-400">{normalized.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-emerald-400" style={{ width: `${normalized}%` }} />
      </div>
      <p className="mt-2 truncate text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Inspector({ title, data, emptyText }: { title: string; data: unknown; emptyText: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#11151b] p-4">
      <h2 className="mb-3 font-medium">{title}</h2>
      <pre className="max-h-72 overflow-auto rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-xs leading-5 text-slate-300">
        {data ? JSON.stringify(data, null, 2) : emptyText}
      </pre>
    </div>
  );
}
