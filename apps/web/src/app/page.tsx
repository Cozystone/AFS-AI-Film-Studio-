"use client";

import {
  Activity,
  ChevronDown,
  Clapperboard,
  ExternalLink,
  Film,
  Gauge,
  Globe2,
  Images,
  Loader2,
  MonitorPlay,
  Play,
  Server,
  Sparkles,
  X,
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
  audio: { type: string; description: string; sync_importance: number };
};

type CineGraph = {
  world_state: unknown;
  scenes: { scene_id: string; title: string; shots: string[] }[];
  shots: Shot[];
  chunks: Chunk[];
  audio_visual_events: AudioVisualEvent[];
};

type SystemUsage = {
  cpu: { usage_percent: number; core_count: number };
  memory: { used_mb: number; total_mb: number; usage_percent: number };
  disk: { used_gb: number; total_gb: number; usage_percent: number };
  gpu: {
    available: boolean;
    gpus?: {
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
  estimated_duration_sec: number | null;
  elapsed_sec: number;
  remaining_sec: number | null;
  error: string | null;
};

type GalleryItem = {
  artifact_id: string;
  project_id: string;
  project_title: string;
  type: string;
  label: string;
  renderer: string;
  created_at: string;
  media_url: string;
  duration: number | null;
};

type ProductionProgress = {
  active: boolean;
  completed: boolean;
  label: string;
  basePercent: number;
  segmentPercent: number;
  taskStartedAt: number;
  taskEstimateSec: number;
  startedAt: number;
  totalEstimateSec: number;
};

type Language = "ko" | "en";

const configuredApiBase = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "/api/orchestrator";
void
  "버려진 주유소에서 두 청소년이 낡은 캠코더로 서로를 찍다가, 마지막에 사라진 친구의 영상을 발견하는 30초짜리 독립영화풍 영상.";

const checkpoints = ["ltx-2.3-22b-dev-fp8.safetensors", "wan2.1_t2v_1.3B_fp16.safetensors", "mock"];
const loras = ["ltx-2.3-22b-distilled-lora-384.safetensors", "none"];
const textEncoders = ["gemma_3_12B_it_fp4_mixed.safetensors", "umt5_xxl_fp8_e4m3fn_scaled.safetensors"];
const qualityOptions = [
  { label: "Turbo - fastest draft", value: "turbo" },
  { label: "Fast - 384px preview", value: "fast" },
  { label: "Balanced - 720p export", value: "balanced" },
  { label: "High - approved shots", value: "high" },
  { label: "Ultra - master only", value: "ultra" },
];
const exampleScript =
  "예: 버려진 주유소에서 두 청소년이 낡은 캠코더로 서로를 찍다가, 마지막에 사라진 친구의 영상을 발견하는 30초짜리 독립영화풍 영상.";
const exampleTitle = "예: Last Tape";

const copy = {
  ko: {
    appName: "AFS",
    subtitle: "텍스트를 넣으면 하나의 영화 프리뷰로 조립합니다.",
    make: "새 영상",
    result: "결과",
    title: "제목",
    script: "시나리오",
    visualStyle: "영상 스타일",
    audioStyle: "소리 스타일",
    textToMovie: "텍스트로 영화 만들기",
    making: "영화 만드는 중",
    ready: "준비됨",
    inputTitle: "텍스트 투 무비",
    inputBody: "시나리오만 넣고 실행하세요. AFS가 내부적으로 컷과 구간을 나누지만, 화면에는 최종 조립된 영화와 제작 타임라인을 보여줍니다.",
    previewTitle: "영화 프리뷰",
    previewBody: "중간 조각은 프리뷰 아래 타임라인에 표시하고, 모든 컷이 완성되면 통합 영상이 한 번에 나타납니다.",
    noPreview: "완성된 영화 프리뷰가 여기에 표시됩니다.",
    progress: "진행 상황",
    pcStatus: "PC 상태",
    advancedOpen: "고급 정보 열기",
    advancedClose: "고급 정보 닫기",
    shots: "내부 컷",
    chunks: "내부 렌더 구간",
    audioEvents: "소리 이벤트",
    worldState: "World State",
    projectJson: "Project JSON",
    orchestratorUrl: "Orchestrator URL",
    save: "저장",
    proxyHint: "배포 환경에서는 자동 프록시를 사용합니다. 직접 테스트할 때만 바꾸세요.",
    offline: "오케스트레이터 연결 안 됨",
    noJobs: "아직 작업이 없습니다.",
    cpu: "CPU",
    gpu: "GPU",
    memory: "메모리",
    disk: "디스크",
    unavailable: "사용 불가",
    elapsed: "소요",
    estimated: "예상",
    remaining: "남음",
    creating: "프로젝트 생성 중",
    planning: "장면과 컷을 설계하는 중",
    keyframing: "키프레임 준비 중",
    rendering: "모든 컷을 렌더링하고 조립하는 중",
    audio: "오디오 레이어 생성 중",
    exporting: "최종 영화 파일을 만드는 중",
    complete: "영화 프리뷰 완료",
    album: "앨범",
    results: "결과물",
    latestOutputs: "생성된 영상",
    noOutputs: "아직 생성된 결과물이 없습니다.",
    noFinalOutputs: "아직 통합 영상이 없습니다.",
    editTimeline: "제작 타임라인",
    editTimelineHint: "계획된 컷과 생성된 컷을 순서대로 확인합니다.",
    sceneTrack: "컷",
    bridgeTrack: "연결",
    bridgeClip: "연결 영상",
    open: "열기",
    finalMovie: "최종 영화",
    shotPreview: "컷 프리뷰",
    buildPreview: "통합 프리뷰 만들기",
    partialPreviewHint: "완성된 컷들을 하나의 프리뷰로 묶습니다.",
    close: "닫기",
  },
  en: {
    appName: "AFS",
    subtitle: "Turn text into one stitched movie preview.",
    make: "New video",
    result: "Result",
    title: "Title",
    script: "Script",
    visualStyle: "Visual style",
    audioStyle: "Audio style",
    textToMovie: "Create Movie from Text",
    making: "Creating movie",
    ready: "Ready",
    inputTitle: "Text to Movie",
    inputBody: "Enter a script and run. AFS still uses shots and chunks internally, but only the final stitched movie appears here.",
    previewTitle: "Movie Preview",
    previewBody: "No 1-2 second fragments are shown. The preview appears once every shot is complete and stitched.",
    noPreview: "The finished movie preview appears here.",
    progress: "Progress",
    pcStatus: "PC status",
    advancedOpen: "Show advanced details",
    advancedClose: "Hide advanced details",
    shots: "Internal shots",
    chunks: "Internal chunks",
    audioEvents: "Audio events",
    worldState: "World State",
    projectJson: "Project JSON",
    orchestratorUrl: "Orchestrator URL",
    save: "Save",
    proxyHint: "Hosted builds use the proxy automatically. Override only for direct local tests.",
    offline: "Orchestrator offline",
    noJobs: "No jobs yet.",
    cpu: "CPU",
    gpu: "GPU",
    memory: "Memory",
    disk: "Disk",
    unavailable: "Unavailable",
    elapsed: "Elapsed",
    estimated: "Estimated",
    remaining: "Remaining",
    creating: "Creating project",
    planning: "Planning scenes and shots",
    keyframing: "Preparing keyframes",
    rendering: "Rendering and stitching every shot",
    audio: "Generating audio layers",
    exporting: "Creating final movie file",
    complete: "Movie preview ready",
    album: "Album",
    results: "Results",
    latestOutputs: "Generated videos",
    noOutputs: "No generated outputs yet.",
    noFinalOutputs: "No stitched movies yet.",
    editTimeline: "Edit timeline",
    editTimelineHint: "Generated shot fragments stay here in sequence.",
    sceneTrack: "Cuts",
    bridgeTrack: "Bridges",
    bridgeClip: "Bridge",
    open: "Open",
    finalMovie: "Final movie",
    shotPreview: "Shot preview",
    buildPreview: "Build stitched preview",
    partialPreviewHint: "Stitch completed shots into one preview.",
    close: "Close",
  },
} satisfies Record<Language, Record<string, string>>;

function initialOrchestratorUrl() {
  if (configuredApiBase) return configuredApiBase;
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("afs.orchestratorUrl") ?? "";
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("ko");
  const t = copy[language];
  const [orchestratorUrl, setOrchestratorUrl] = useState(initialOrchestratorUrl);
  const [orchestratorInput, setOrchestratorInput] = useState(initialOrchestratorUrl);
  const [title, setTitle] = useState("");
  const [scriptPrompt, setScriptPrompt] = useState("");
  const [styleHint, setStyleHint] = useState("early 2000s camcorder, lo-fi indie film");
  const [audioHint, setAudioHint] = useState("fluorescent buzz, tape hiss, distant wind");
  const [movieSource, setMovieSource] = useState("auto_storyboard");
  const [storyboardScenes, setStoryboardScenes] = useState(6);
  const [keepContinuity, setKeepContinuity] = useState(true);
  const [checkpoint, setCheckpoint] = useState(checkpoints[0]);
  const [lora, setLora] = useState(loras[0]);
  const [textEncoder, setTextEncoder] = useState(textEncoders[0]);
  const [outputQuality, setOutputQuality] = useState("fast");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [clipLength, setClipLength] = useState(3);
  const [renderStyle, setRenderStyle] = useState("cinematic");
  const [seed, setSeed] = useState("");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [graph, setGraph] = useState<CineGraph | null>(null);
  const [moviePreviewUrl, setMoviePreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState(t.ready);
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<SystemUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [selectedGalleryItem, setSelectedGalleryItem] = useState<GalleryItem | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [progressClock, setProgressClock] = useState(0);
  const [smoothProgressPercent, setSmoothProgressPercent] = useState(0);
  const [productionProgress, setProductionProgress] = useState<ProductionProgress>({
    active: false,
    completed: false,
    label: "Ready",
    basePercent: 0,
    segmentPercent: 0,
    taskStartedAt: 0,
    taskEstimateSec: 1,
    startedAt: 0,
    totalEstimateSec: 1,
  });

  const latestJobs = useMemo(() => jobs.slice(0, 6), [jobs]);
  const finalGallery = gallery.filter(isFinalGalleryItem);
  const timelineItems = getTimelineItems(gallery, project?.project_id ?? null);
  const progressSnapshot = getProductionProgressSnapshot(productionProgress, progressClock);
  const displayProgressSnapshot = { ...progressSnapshot, percent: smoothProgressPercent };

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!orchestratorUrl) throw new Error("Missing orchestrator URL");
      const response = await fetch(`${orchestratorUrl}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!response.ok) {
        const text = await response.text();
        if (text.includes("Cloudflare Tunnel error") || text.includes("<!DOCTYPE html") || text.includes("<html")) {
          throw new Error("Orchestrator tunnel error. Restart the AFS tunnel and redeploy the web URL.");
        }
        throw new Error(text.slice(0, 500));
      }
      return response.json();
    },
    [orchestratorUrl],
  );

  useEffect(() => {
    if (configuredApiBase) {
      const normalized = configuredApiBase.replace(/\/$/, "");
      const timer = window.setTimeout(() => {
        setOrchestratorUrl(normalized);
        setOrchestratorInput(normalized);
        window.localStorage.setItem("afs.orchestratorUrl", normalized);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  const loadGallery = useCallback(async () => {
    if (!orchestratorUrl) return;
    try {
      const items = await request<GalleryItem[]>("/api/gallery");
      setGallery(items);
      setSelectedGalleryItem((current) => current ?? items[0] ?? null);
    } catch {
      setGallery([]);
    }
  }, [orchestratorUrl, request]);

  useEffect(() => {
    let active = true;
    async function loadUsage() {
      if (!orchestratorUrl) return;
      try {
        const nextUsage = await request<SystemUsage>("/api/system/usage");
        if (active) {
          setUsage(nextUsage);
          setUsageError(null);
        }
      } catch {
        if (active) setUsageError(t.offline);
      }
    }
    loadUsage();
    const interval = window.setInterval(loadUsage, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [orchestratorUrl, request, t.offline]);

  useEffect(() => {
    let active = true;
    async function loadJobs() {
      if (!orchestratorUrl) return;
      try {
        const nextJobs = await request<Job[]>("/api/jobs");
        if (active) setJobs(nextJobs);
      } catch {
        if (active) setJobs([]);
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
    const initial = window.setTimeout(loadGallery, 0);
    const interval = window.setInterval(loadGallery, productionProgress.active ? 1500 : 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadGallery, productionProgress.active]);

  useEffect(() => {
    if (!productionProgress.active) return;
    const interval = window.setInterval(() => setProgressClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [productionProgress.active]);

  useEffect(() => {
    const target = progressSnapshot.percent;
    if (target === 0) {
      const timeout = window.setTimeout(() => setSmoothProgressPercent(0), 0);
      return () => window.clearTimeout(timeout);
    }
    const interval = window.setInterval(() => {
      setSmoothProgressPercent((current) => {
        if (current === target) return current;
        if (target < current) return current;
        return Math.min(target, current + 1);
      });
    }, 90);
    return () => window.clearInterval(interval);
  }, [progressSnapshot.percent]);

  function saveOrchestratorUrl() {
    const normalized = orchestratorInput.trim().replace(/\/$/, "");
    setOrchestratorUrl(normalized);
    if (normalized) window.localStorage.setItem("afs.orchestratorUrl", normalized);
    else window.localStorage.removeItem("afs.orchestratorUrl");
  }

  function resetWorkspace() {
    setTitle("");
    setScriptPrompt("");
    setStyleHint("early 2000s camcorder, lo-fi indie film");
    setAudioHint("fluorescent buzz, tape hiss, distant wind");
    setMovieSource("auto_storyboard");
    setStoryboardScenes(6);
    setKeepContinuity(true);
    setCheckpoint(checkpoints[0]);
    setLora(loras[0]);
    setTextEncoder(textEncoders[0]);
    setOutputQuality("fast");
    setAspectRatio("16:9");
    setClipLength(3);
    setRenderStyle("cinematic");
    setSeed("");
    setIncludeAudio(true);
    setProject(null);
    setGraph(null);
    setMoviePreviewUrl(null);
    setSelectedGalleryItem(null);
    setStatus(t.ready);
    setSmoothProgressPercent(0);
    setProgressClock(0);
    setProductionProgress({
      active: false,
      completed: false,
      label: t.ready,
      basePercent: 0,
      segmentPercent: 0,
      taskStartedAt: 0,
      taskEstimateSec: 1,
      startedAt: 0,
      totalEstimateSec: 1,
    });
    document.getElementById("make")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function createMovieFromText() {
    setBusy(true);
    setMoviePreviewUrl(null);
    setGraph(null);
    setProject(null);
    setSmoothProgressPercent(0);
    const startedAt = Date.now();
    let totalEstimateSec = estimateMovieSeconds({
      shotCount: storyboardScenes,
      checkpoint,
      outputQuality,
      includeAudio,
    });
    const setMovieTask = (label: string, basePercent: number, segmentPercent: number, taskEstimateSec: number) => {
      setProductionProgress({
        active: true,
        completed: false,
        label,
        basePercent,
        segmentPercent,
        taskStartedAt: Date.now(),
        taskEstimateSec,
        startedAt,
        totalEstimateSec,
      });
      setProgressClock(Date.now());
    };
    try {
      setStatus(t.creating);
      setMovieTask("프로젝트 생성", 0, 2, 3);
      const created = await request<{ project_id: string }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || "Untitled Film",
          script_prompt: scriptPrompt.trim(),
          duration: storyboardScenes * clipLength,
          aspect_ratio: aspectRatio,
          style_hint: `${styleHint}, ${renderStyle}, ${outputQuality}, source=${movieSource}, continuity=${keepContinuity}`,
          audio_hint: audioHint,
        }),
      });

      const loaded = await request<Project>(`/api/projects/${created.project_id}`);
      setProject(loaded);

      setStatus(t.planning);
      setMovieTask("장면과 컷 설계", 2, 5, 6);
      const planned = await request<CineGraph>(`/api/projects/${created.project_id}/plan`, { method: "POST" });
      setGraph(planned);
      totalEstimateSec = estimateMovieSeconds({
        shotCount: planned.shots.length,
        checkpoint,
        outputQuality,
        includeAudio,
      });

      setStatus(t.rendering);
      setMovieTask("백그라운드 영화 제작 시작", 7, 88, totalEstimateSec);
      const queued = await request<{ job_id: string; status: string }>(`/api/projects/${created.project_id}/render_async`, {
        method: "POST",
        body: JSON.stringify({
          preset: outputQuality,
          renderer: checkpoint === "mock" ? "mock" : "comfy_ltx",
          audio: includeAudio,
          checkpoint,
          lora,
          text_encoder: textEncoder,
          seed: seed.trim() || null,
        }),
      });
      await waitForMovieRender({
        jobId: queued.job_id,
        projectId: created.project_id,
        startedAt,
        totalEstimateSec,
        request,
        loadGallery,
        setMoviePreviewUrl,
        setProductionProgress,
        setProgressClock,
        orchestratorUrl,
      });
      await loadGallery();
      setStatus(t.complete);
      setProductionProgress({
        active: false,
        completed: true,
        label: "완료",
        basePercent: 100,
        segmentPercent: 0,
        taskStartedAt: Date.now(),
        taskEstimateSec: 1,
        startedAt,
        totalEstimateSec: Math.max(1, (Date.now() - startedAt) / 1000),
      });
      setProgressClock(Date.now());
      return;

    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
      setProductionProgress((current) => ({ ...current, active: false, label: "중단됨" }));
    } finally {
      setBusy(false);
    }
  }

function selectFinalOutput(item: GalleryItem) {
    setSelectedGalleryItem(item);
    if (isFinalGalleryItem(item)) {
      setMoviePreviewUrl(`${orchestratorUrl}${item.media_url}`);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d10] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0b0d10]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-3">
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
            <button className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" type="button" onClick={resetWorkspace}>
              {t.make}
            </button>
            <a className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" href="#result">
              {t.result}
            </a>
            <button
              className="flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800"
              type="button"
              onClick={() => setAlbumOpen(true)}
            >
              <Images size={15} />
              {t.album}
            </button>
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

      <div className="mx-auto grid max-w-[1700px] gap-4 px-5 py-5 xl:grid-cols-[440px_800px_340px]">
        <section id="make" className="space-y-4">
          <Panel title={t.inputTitle} description={t.inputBody} icon={<Sparkles size={18} className="text-emerald-300" />}>
            <div className="grid gap-3">
              <label className="text-sm text-slate-300">
                {t.title}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={exampleTitle}
                  className="mt-1 h-11 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
                />
              </label>
              <label className="text-sm text-slate-300">
                {t.script}
                <textarea
                  value={scriptPrompt}
                  onChange={(event) => setScriptPrompt(event.target.value)}
                  placeholder={exampleScript}
                  rows={9}
                  className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-3 text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-400"
                />
              </label>
              <MovieProductionProgress snapshot={displayProgressSnapshot} />
              <button
                className="mt-1 flex h-13 items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 text-base font-semibold text-slate-950 disabled:opacity-60"
                disabled={busy || !scriptPrompt.trim()}
                type="button"
                onClick={createMovieFromText}
              >
                {busy ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                {busy ? t.making : t.textToMovie}
              </button>
            </div>
          </Panel>

          <Panel title={t.progress} icon={<Activity size={18} className="text-violet-300" />}>
            <p className="mb-3 rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-emerald-300">{status}</p>
            <JobProgressPanel jobs={latestJobs} t={t} />
          </Panel>
        </section>

        <section id="result" className="space-y-4">
          <Panel title={t.previewTitle} description={t.previewBody} icon={<MonitorPlay size={18} className="text-amber-300" />}>
            <div className="overflow-hidden rounded-md border border-slate-800 bg-black shadow-2xl shadow-black/30">
              {moviePreviewUrl ? (
                <div className="aspect-video w-full">
                  <video controls className="h-full w-full bg-black object-contain" src={moviePreviewUrl} />
                </div>
              ) : (
                <div className="grid aspect-video w-full place-items-center p-6 text-center text-sm text-slate-500">
                  <div>
                    <MonitorPlay className="mx-auto mb-3 text-slate-700" size={44} />
                    {t.noPreview}
                  </div>
                </div>
              )}
            </div>
            <ShotTimeline
              items={timelineItems}
              graph={graph}
              plannedSceneCount={storyboardScenes}
              snapshot={displayProgressSnapshot}
              t={t}
              orchestratorUrl={orchestratorUrl}
            />
            <RenderSettingsPanel
              styleHint={styleHint}
              setStyleHint={setStyleHint}
              audioHint={audioHint}
              setAudioHint={setAudioHint}
              movieSource={movieSource}
              setMovieSource={setMovieSource}
              storyboardScenes={storyboardScenes}
              setStoryboardScenes={setStoryboardScenes}
              checkpoint={checkpoint}
              setCheckpoint={setCheckpoint}
              outputQuality={outputQuality}
              setOutputQuality={setOutputQuality}
              lora={lora}
              setLora={setLora}
              textEncoder={textEncoder}
              setTextEncoder={setTextEncoder}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              clipLength={clipLength}
              setClipLength={setClipLength}
              renderStyle={renderStyle}
              setRenderStyle={setRenderStyle}
              seed={seed}
              setSeed={setSeed}
              keepContinuity={keepContinuity}
              setKeepContinuity={setKeepContinuity}
              includeAudio={includeAudio}
              setIncludeAudio={setIncludeAudio}
            />
          </Panel>

          <Panel title={t.pcStatus} icon={<Gauge size={18} className="text-rose-300" />}>
            <SystemUsagePanel usage={usage} error={usageError} t={t} />
          </Panel>
        </section>

        <aside className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <ResultsRail
            items={finalGallery}
            t={t}
            orchestratorUrl={orchestratorUrl}
            selectedId={selectedGalleryItem?.artifact_id ?? null}
            onSelect={selectFinalOutput}
            onOpenAlbum={() => setAlbumOpen(true)}
          />
        </aside>
      </div>

      <section className="mx-auto max-w-[1600px] px-5 pb-8">
        <button
          className="flex h-11 w-full items-center justify-between rounded-md border border-slate-800 bg-[#11151b] px-4 text-left text-sm font-medium text-slate-200"
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          <span>{advancedOpen ? t.advancedClose : t.advancedOpen}</span>
          <ChevronDown className={advancedOpen ? "rotate-180 transition" : "transition"} size={18} />
        </button>

        {advancedOpen ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title={t.shots}>
              <div className="space-y-2">
                {graph?.shots.map((shot) => (
                  <div key={shot.shot_id} className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm">
                    <p className="font-mono text-xs text-emerald-300">{shot.shot_id}</p>
                    <p className="mt-1 text-slate-200">{shot.purpose}</p>
                  </div>
                )) ?? <EmptyState text="-" />}
              </div>
            </Panel>
            <Inspector title={t.chunks} data={graph?.chunks} />
            <Inspector title={t.audioEvents} data={graph?.audio_visual_events} />
            <Inspector title={t.worldState} data={graph?.world_state} />
            <Inspector title={t.projectJson} data={project} />
            <Panel title={t.orchestratorUrl} icon={<Server size={18} className="text-slate-300" />}>
              <div className="flex gap-2">
                <input
                  value={orchestratorInput}
                  onChange={(event) => setOrchestratorInput(event.target.value)}
                  placeholder="/api/orchestrator"
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-2 text-slate-100 outline-none focus:border-emerald-400"
                />
                <button className="rounded-md bg-emerald-400 px-3 text-sm font-semibold text-slate-950" type="button" onClick={saveOrchestratorUrl}>
                  {t.save}
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{t.proxyHint}</p>
            </Panel>
          </div>
        ) : null}
      </section>
      {albumOpen ? (
        <AlbumView
          items={gallery}
          t={t}
          orchestratorUrl={orchestratorUrl}
          selectedItem={selectedGalleryItem}
          onSelect={setSelectedGalleryItem}
          onClose={() => setAlbumOpen(false)}
        />
      ) : null}
    </main>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="text-sm text-slate-300">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-[#0b0d10] px-3 text-slate-100 outline-none focus:border-emerald-400"
      >
        {children}
      </select>
    </label>
  );
}

function MovieProductionProgress({
  snapshot,
}: {
  snapshot: {
    percent: number;
    label: string;
    elapsedSec: number;
    remainingSec: number;
    totalEstimateSec: number;
    active: boolean;
    completed: boolean;
  };
}) {
  return (
    <div className="rounded-md border border-slate-800 bg-[#080b0f] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">통합 영화 제작 진행</p>
          <p className="mt-0.5 text-xs text-slate-500">{snapshot.label}</p>
        </div>
        <span className="font-mono text-lg font-semibold text-emerald-300">{snapshot.percent}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-emerald-400 transition-[width] duration-700" style={{ width: `${snapshot.percent}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
        <span>경과 {formatDuration(snapshot.elapsedSec)}</span>
        <span>남은 시간 {snapshot.completed ? "0초" : formatDuration(snapshot.remainingSec)}</span>
        <span>예상 총 {formatDuration(snapshot.totalEstimateSec)}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        예측: 기획 7%, 키프레임 8%, 영상 렌더 70%, 오디오 10%, 통합 5% 가중치와 컷별 완료율을 기준으로 계산합니다.
      </p>
    </div>
  );
}

function RenderSettingsPanel({
  styleHint,
  setStyleHint,
  audioHint,
  setAudioHint,
  movieSource,
  setMovieSource,
  storyboardScenes,
  setStoryboardScenes,
  checkpoint,
  setCheckpoint,
  outputQuality,
  setOutputQuality,
  lora,
  setLora,
  textEncoder,
  setTextEncoder,
  aspectRatio,
  setAspectRatio,
  clipLength,
  setClipLength,
  renderStyle,
  setRenderStyle,
  seed,
  setSeed,
  keepContinuity,
  setKeepContinuity,
  includeAudio,
  setIncludeAudio,
}: {
  styleHint: string;
  setStyleHint: (value: string) => void;
  audioHint: string;
  setAudioHint: (value: string) => void;
  movieSource: string;
  setMovieSource: (value: string) => void;
  storyboardScenes: number;
  setStoryboardScenes: (value: number) => void;
  checkpoint: string;
  setCheckpoint: (value: string) => void;
  outputQuality: string;
  setOutputQuality: (value: string) => void;
  lora: string;
  setLora: (value: string) => void;
  textEncoder: string;
  setTextEncoder: (value: string) => void;
  aspectRatio: string;
  setAspectRatio: (value: string) => void;
  clipLength: number;
  setClipLength: (value: number) => void;
  renderStyle: string;
  setRenderStyle: (value: string) => void;
  seed: string;
  setSeed: (value: string) => void;
  keepContinuity: boolean;
  setKeepContinuity: (value: boolean) => void;
  includeAudio: boolean;
  setIncludeAudio: (value: boolean) => void;
}) {
  return (
    <div className="mt-4 rounded-md border border-slate-800 bg-[#0b0d10] p-3">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">영상 스타일 / 렌더 설정</h3>
        <p className="text-xs text-slate-500">프리뷰 아래에서 컷 구성과 렌더 옵션을 조정합니다.</p>
      </div>
      <div className="grid gap-3">
        <label className="text-sm text-slate-300">
          영상 스타일
          <input
            value={styleHint}
            onChange={(event) => setStyleHint(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-[#080b0f] px-3 text-slate-100 outline-none focus:border-emerald-400"
          />
        </label>
        <label className="text-sm text-slate-300">
          소리 스타일
          <input
            value={audioHint}
            onChange={(event) => setAudioHint(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-[#080b0f] px-3 text-slate-100 outline-none focus:border-emerald-400"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField label="Movie source" value={movieSource} onChange={setMovieSource}>
            <option value="auto_storyboard">Auto storyboard images</option>
            <option value="text_only">Text only</option>
            <option value="reference_locked">Reference locked</option>
          </SelectField>
          <SelectField label="Storyboard scenes" value={String(storyboardScenes)} onChange={(value) => setStoryboardScenes(Number(value))}>
            {[3, 4, 5, 6, 8, 10].map((count) => (
              <option key={count} value={count}>
                {count} scenes
              </option>
            ))}
          </SelectField>
          <SelectField label="Checkpoint model" value={checkpoint} onChange={setCheckpoint}>
            {checkpoints.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <SelectField label="Output quality" value={outputQuality} onChange={setOutputQuality}>
            {qualityOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="LoRA" value={lora} onChange={setLora}>
            {loras.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <SelectField label="Text encoder" value={textEncoder} onChange={setTextEncoder}>
            {textEncoders.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <SelectField label="Aspect" value={aspectRatio} onChange={setAspectRatio}>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </SelectField>
          <SelectField label="Length per cut" value={String(clipLength)} onChange={(value) => setClipLength(Number(value))}>
            <option value="2">2 seconds</option>
            <option value="3">3 seconds</option>
            <option value="5">5 seconds</option>
            <option value="8">8 seconds</option>
          </SelectField>
          <SelectField label="Style" value={renderStyle} onChange={setRenderStyle}>
            <option value="cinematic">Cinematic</option>
            <option value="camcorder">Camcorder</option>
            <option value="documentary">Documentary</option>
            <option value="commercial">Commercial</option>
          </SelectField>
          <label className="text-sm text-slate-300">
            Seed
            <input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="Empty = random"
              className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-[#080b0f] px-3 text-slate-100 outline-none focus:border-emerald-400"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 rounded-md border border-slate-800 bg-[#080b0f] p-3 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={keepContinuity} onChange={(event) => setKeepContinuity(event.target.checked)} />
            Keep character continuity
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeAudio} onChange={(event) => setIncludeAudio(event.target.checked)} />
            Include audio
          </label>
        </div>
      </div>
    </div>
  );
}

function ResultsRail({
  items,
  t,
  orchestratorUrl,
  selectedId,
  onSelect,
  onOpenAlbum,
}: {
  items: GalleryItem[];
  t: Record<string, string>;
  orchestratorUrl: string;
  selectedId: string | null;
  onSelect: (item: GalleryItem) => void;
  onOpenAlbum: () => void;
}) {
  return (
    <section className="rounded-md border border-slate-800 bg-[#11151b] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Film size={18} className="text-emerald-300" />
          <div>
            <h2 className="font-semibold text-slate-100">{t.results}</h2>
            <p className="text-xs text-slate-500">{items.length} {t.finalMovie}</p>
          </div>
        </div>
        <button
          className="flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800"
          type="button"
          onClick={onOpenAlbum}
        >
          <Images size={15} />
          {t.album}
        </button>
      </div>
      {items.length === 0 ? <EmptyState text={t.noFinalOutputs} /> : null}
      <div className="space-y-3">
        {items.map((item) => (
          <GalleryCard
            key={item.artifact_id}
            item={item}
            t={t}
            orchestratorUrl={orchestratorUrl}
            selected={item.artifact_id === selectedId}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    </section>
  );
}

function GalleryCard({
  item,
  t,
  orchestratorUrl,
  selected,
  onSelect,
}: {
  item: GalleryItem;
  t: Record<string, string>;
  orchestratorUrl: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const mediaUrl = `${orchestratorUrl}${item.media_url}`;
  const isFinal = item.type === "final_movie" || item.type === "video_project";
  return (
    <article
      className={`rounded-md border bg-[#0b0d10] p-3 transition ${
        selected ? "border-emerald-400/80 shadow-lg shadow-emerald-950/30" : "border-slate-800 hover:border-slate-700"
      }`}
    >
      <button className="w-full text-left" type="button" onClick={onSelect}>
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{item.project_title}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{isFinal ? t.finalMovie : `${t.shotPreview} / ${item.label}`}</p>
          </div>
          <span className={isFinal ? "rounded border border-emerald-500/50 px-2 py-1 text-xs text-emerald-300" : "rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"}>
            {isFinal ? "FINAL" : "SHOT"}
          </span>
        </div>
        <video className="aspect-video w-full rounded border border-slate-800 bg-black object-cover" src={mediaUrl} muted preload="metadata" />
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">{item.renderer}</span>
        <a className="flex items-center gap-1 text-emerald-300 hover:text-emerald-200" href={mediaUrl} target="_blank" rel="noreferrer">
          {t.open}
          <ExternalLink size={12} />
        </a>
      </div>
    </article>
  );
}

function ShotTimeline({
  items,
  graph,
  plannedSceneCount,
  snapshot,
  t,
  orchestratorUrl,
}: {
  items: GalleryItem[];
  graph: CineGraph | null;
  plannedSceneCount: number;
  snapshot: ReturnType<typeof getProductionProgressSnapshot>;
  t: Record<string, string>;
  orchestratorUrl: string;
}) {
  const clips = buildTimelineClips(graph, items, snapshot.percent, plannedSceneCount);
  const transitions = buildTransitionItems(clips);

  return (
    <div className="mt-4 rounded-md border border-slate-800 bg-[#0b0d10] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{t.editTimeline}</h3>
          <p className="text-xs text-slate-500">{t.editTimelineHint}</p>
        </div>
        <span className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400">
          {clips.filter((clip) => clip.status === "done").length}/{clips.length}
        </span>
      </div>
      {clips.length === 0 ? <EmptyState text={t.noOutputs} /> : null}
      {clips.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-800 bg-[#0d1117]">
          <div className="min-w-max">
            <div className="grid border-b border-slate-800" style={{ gridTemplateColumns: `44px repeat(${clips.length}, 176px)` }}>
              <div className="grid place-items-center border-r border-slate-800 bg-[#11151b] text-xs text-slate-500">{t.sceneTrack}</div>
              {clips.map((clip, index) => (
                <article key={clip.id} className="border-r border-slate-800 p-2">
                  <div className={`overflow-hidden rounded-md border bg-slate-900 ${clip.status === "done" ? "border-emerald-500/40" : clip.status === "rendering" ? "border-amber-400/60" : "border-slate-700"}`}>
                    {clip.mediaUrl ? (
                      <video className="aspect-video w-full bg-black object-cover" src={`${orchestratorUrl}${clip.mediaUrl}`} muted preload="metadata" />
                    ) : (
                      <div className="grid aspect-video place-items-center bg-[#111827] p-3 text-center">
                        <div className="w-full">
                          <p className="text-xs font-medium text-slate-300">{clip.statusLabel}</p>
                          <div className="mt-3 h-1.5 overflow-hidden rounded bg-slate-800">
                            <div className="h-full rounded bg-amber-300 transition-[width]" style={{ width: `${clip.progress}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="font-mono text-xs text-emerald-300">{String(index + 1).padStart(2, "0")}</span>
                      <span className="truncate text-xs text-slate-200">{clip.label}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: `44px repeat(${clips.length}, 176px)` }}>
              <div className="grid place-items-center border-r border-slate-800 bg-[#11151b] text-xs text-slate-500">{t.bridgeTrack}</div>
              {clips.map((clip, index) => (
                <div key={`${clip.id}-bridge`} className="border-r border-slate-800 p-2">
                  {transitions[index] ? (
                    <div className="grid aspect-video place-items-end rounded-md border border-slate-700 bg-gradient-to-b from-[#121a24] to-[#0b0d10] p-2">
                      <div className="w-full">
                        <p className="truncate text-xs text-slate-300">{t.bridgeClip}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{transitions[index]}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video rounded-md border border-dashed border-slate-800 bg-[#0b0d10]" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type TimelineClip = {
  id: string;
  label: string;
  mediaUrl: string | null;
  status: "queued" | "keyframing" | "rendering" | "mixing" | "done";
  statusLabel: string;
  progress: number;
};

function buildTimelineClips(graph: CineGraph | null, items: GalleryItem[], percent: number, plannedSceneCount: number): TimelineClip[] {
  const shotItems = items.filter((item) => item.type === "video_shot");
  if (!graph || graph.shots.length === 0) {
    if (shotItems.length > 0) {
      return shotItems.map((item) => ({
        id: item.artifact_id,
        label: item.label,
        mediaUrl: item.media_url,
        status: "done",
        statusLabel: "완료",
        progress: 100,
      }));
    }
    return Array.from({ length: Math.max(1, plannedSceneCount) }, (_, index) => ({
      id: `planned-${index + 1}`,
      label: `Scene ${index + 1}`,
      mediaUrl: null,
      status: percent > 0 ? "keyframing" : "queued",
      statusLabel: percent > 0 ? "컷 설계 대기" : "계획됨",
      progress: percent > 0 ? Math.max(5, Math.min(60, percent * 4)) : 0,
    }));
  }

  const renderStart = 15;
  const renderEnd = 85;
  const renderPercent = Math.max(0, Math.min(1, (percent - renderStart) / (renderEnd - renderStart)));
  const activeIndex = Math.min(graph.shots.length - 1, Math.floor(renderPercent * graph.shots.length));

  return graph.shots.map((shot, index) => {
    const item = shotItems.find((candidate) => candidate.label === shot.shot_id || candidate.label.includes(shot.shot_id));
    if (item) {
      return {
        id: shot.shot_id,
        label: shot.shot_id,
        mediaUrl: item.media_url,
        status: "done",
        statusLabel: "완료",
        progress: 100,
      } satisfies TimelineClip;
    }
    if (percent < renderStart) {
      return {
        id: shot.shot_id,
        label: shot.shot_id,
        mediaUrl: null,
        status: "keyframing",
        statusLabel: "컷 설계 / 키프레임",
        progress: Math.max(10, Math.min(90, percent * 6)),
      } satisfies TimelineClip;
    }
    if (percent >= renderEnd) {
      return {
        id: shot.shot_id,
        label: shot.shot_id,
        mediaUrl: null,
        status: "mixing",
        statusLabel: "통합 대기",
        progress: 92,
      } satisfies TimelineClip;
    }
    if (index < activeIndex) {
      return {
        id: shot.shot_id,
        label: shot.shot_id,
        mediaUrl: null,
        status: "mixing",
        statusLabel: "영상 저장 확인 중",
        progress: 88,
      } satisfies TimelineClip;
    }
    if (index === activeIndex) {
      const localProgress = Math.round(((renderPercent * graph.shots.length) % 1) * 100);
      return {
        id: shot.shot_id,
        label: shot.shot_id,
        mediaUrl: null,
        status: "rendering",
        statusLabel: "렌더링 중",
        progress: Math.max(8, localProgress),
      } satisfies TimelineClip;
    }
    return {
      id: shot.shot_id,
      label: shot.shot_id,
      mediaUrl: null,
      status: "queued",
      statusLabel: "대기",
      progress: 0,
    } satisfies TimelineClip;
  });
}

function buildTransitionItems(items: { label: string }[]) {
  return items.map((item, index) => {
    const next = items[index + 1];
    if (!next) return null;
    return `${item.label} -> ${next.label}`;
  });
}

function isFinalGalleryItem(item: GalleryItem) {
  return item.type === "final_movie" || item.type === "video_project";
}

function getTimelineItems(items: GalleryItem[], currentProjectId: string | null) {
  const shots = items.filter((item) => item.type === "video_shot");
  const preferredProjectId = currentProjectId ?? shots[0]?.project_id ?? null;
  return shots
    .filter((item) => !preferredProjectId || item.project_id === preferredProjectId)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function AlbumView({
  items,
  t,
  orchestratorUrl,
  selectedItem,
  onSelect,
  onClose,
}: {
  items: GalleryItem[];
  t: Record<string, string>;
  orchestratorUrl: string;
  selectedItem: GalleryItem | null;
  onSelect: (item: GalleryItem) => void;
  onClose: () => void;
}) {
  const active = selectedItem ?? items[0] ?? null;
  return (
    <div className="fixed inset-0 z-50 bg-black/80 p-4 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1500px] flex-col rounded-md border border-slate-800 bg-[#11151b]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Images size={19} className="text-emerald-300" />
            <div>
              <h2 className="font-semibold text-slate-100">{t.album}</h2>
              <p className="text-xs text-slate-500">{items.length} {t.latestOutputs}</p>
            </div>
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800" type="button" onClick={onClose} aria-label={t.close}>
            <X size={18} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[1fr_360px]">
          <div className="grid min-h-0 place-items-center overflow-hidden rounded-md border border-slate-800 bg-black">
            {active ? (
              <div className="aspect-video w-full max-w-full">
                <video controls className="h-full w-full bg-black object-contain" src={`${orchestratorUrl}${active.media_url}`} />
              </div>
            ) : (
              <div className="grid aspect-video w-full place-items-center text-sm text-slate-500">{t.noOutputs}</div>
            )}
          </div>
          <div className="min-h-0 overflow-y-auto">
            {items.length === 0 ? <EmptyState text={t.noOutputs} /> : null}
            <div className="grid gap-3">
              {items.map((item) => (
                <GalleryCard
                  key={item.artifact_id}
                  item={item}
                  t={t}
                  orchestratorUrl={orchestratorUrl}
                  selected={item.artifact_id === active?.artifact_id}
                  onSelect={() => onSelect(item)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, description, icon, children }: { title: string; description?: string; icon?: ReactNode; children: ReactNode }) {
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
    <div className="grid min-h-24 place-items-center rounded-md border border-dashed border-slate-700 bg-[#0b0d10] p-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function SystemUsagePanel({ usage, error, t }: { usage: SystemUsage | null; error: string | null; t: Record<string, string> }) {
  const gpu = usage?.gpu.gpus?.[0];
  if (error) return <p className="rounded-md border border-slate-800 bg-[#0b0d10] p-3 text-sm text-amber-300">{error}</p>;
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <UsageMeter label={t.cpu} value={usage?.cpu.usage_percent ?? 0} detail={usage ? `${usage.cpu.core_count} cores` : "-"} />
      <UsageMeter
        label={t.gpu}
        value={gpu?.utilization_percent ?? 0}
        detail={gpu ? `${gpu.name} | ${gpu.memory_used_mb}/${gpu.memory_total_mb} MB | ${gpu.temperature_c}C` : t.unavailable}
      />
      <UsageMeter label={t.memory} value={usage?.memory.usage_percent ?? 0} detail={usage ? `${usage.memory.used_mb}/${usage.memory.total_mb} MB` : "-"} />
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
  if (jobs.length === 0) return <EmptyState text={t.noJobs} />;
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

async function waitForMovieRender({
  jobId,
  projectId,
  startedAt,
  totalEstimateSec,
  request,
  loadGallery,
  setMoviePreviewUrl,
  setProductionProgress,
  setProgressClock,
  orchestratorUrl,
}: {
  jobId: string;
  projectId: string;
  startedAt: number;
  totalEstimateSec: number;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  loadGallery: () => Promise<void>;
  setMoviePreviewUrl: (url: string | null) => void;
  setProductionProgress: (progress: ProductionProgress) => void;
  setProgressClock: (value: number) => void;
  orchestratorUrl: string;
}) {
  let highestPercent = 7;
  while (true) {
    const job = await request<Job>(`/api/jobs/${jobId}`);
    const backendPercent = Math.max(7, Math.min(99, Math.round(7 + job.progress * 88)));
    highestPercent = Math.max(highestPercent, backendPercent);
    const label = describeMovieJob(job);
    setProductionProgress({
      active: job.status !== "succeeded" && job.status !== "failed" && job.status !== "cancelled",
      completed: job.status === "succeeded",
      label,
      basePercent: job.status === "succeeded" ? 100 : highestPercent,
      segmentPercent: 0,
      taskStartedAt: Date.now(),
      taskEstimateSec: 1,
      startedAt,
      totalEstimateSec: job.estimated_duration_sec ?? totalEstimateSec,
    });
    setProgressClock(Date.now());
    if (job.status === "succeeded") {
      const preview = await request<{ media_url: string }>(`/api/projects/${projectId}/preview`);
      setMoviePreviewUrl(`${orchestratorUrl}${preview.media_url}`);
      await loadGallery();
      return;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.error || `Render job ${job.status}`);
    }
    await loadGallery();
    await sleep(2000);
  }
}

function describeMovieJob(job: Job) {
  const percent = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
  if (percent < 15) return "키프레임 준비";
  if (percent < 85) return `영상 렌더링 ${percent}%`;
  if (percent < 95) return "오디오 레이어 생성";
  if (percent < 100) return "통합 영상 합성";
  return "완료";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatSeconds(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDuration(value: number) {
  const total = Math.max(0, Math.round(value));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes <= 0) return `${seconds}초`;
  return `${minutes}분 ${seconds.toString().padStart(2, "0")}초`;
}

function estimateRenderSeconds({ checkpoint, outputQuality }: { checkpoint: string; outputQuality: string }) {
  if (checkpoint === "mock") return 2;
  const qualityEstimate: Record<string, number> = {
    turbo: 45,
    fast: 75,
    balanced: 170,
    high: 260,
    ultra: 330,
  };
  return qualityEstimate[outputQuality] ?? 95;
}

function estimateMovieSeconds({
  shotCount,
  checkpoint,
  outputQuality,
  includeAudio,
}: {
  shotCount: number;
  checkpoint: string;
  outputQuality: string;
  includeAudio: boolean;
}) {
  const shots = Math.max(1, shotCount);
  const planning = 9;
  const keyframes = shots * 2;
  const render = shots * estimateRenderSeconds({ checkpoint, outputQuality });
  const audio = includeAudio ? shots * 3 : 0;
  const exportTime = 10 + shots;
  return planning + keyframes + render + audio + exportTime;
}

function getProductionProgressSnapshot(progress: ProductionProgress, nowMs: number) {
  if (!progress.active && !progress.completed) {
    const percent = Math.max(0, Math.min(99, Math.floor(progress.basePercent)));
    return {
      percent,
      label: progress.label || "대기 중",
      elapsedSec: progress.startedAt ? Math.max(0, (nowMs - progress.startedAt) / 1000) : 0,
      remainingSec: progress.totalEstimateSec,
      totalEstimateSec: progress.totalEstimateSec,
      active: false,
      completed: false,
    };
  }
  const elapsedSec = Math.max(0, (nowMs - progress.startedAt) / 1000);
  const taskElapsedSec = Math.max(0, (nowMs - progress.taskStartedAt) / 1000);
  const taskRatio = progress.completed ? 1 : Math.min(0.96, taskElapsedSec / Math.max(progress.taskEstimateSec, 1));
  const rawPercent = progress.completed ? 100 : progress.basePercent + progress.segmentPercent * taskRatio;
  const percent = Math.max(0, Math.min(100, Math.floor(rawPercent)));
  const progressRatio = Math.max(percent / 100, elapsedSec / Math.max(progress.totalEstimateSec, 1) * 0.15);
  const projectedTotal = progress.completed ? elapsedSec : Math.max(progress.totalEstimateSec, elapsedSec / Math.max(progressRatio, 0.01));
  const remainingSec = progress.completed ? 0 : Math.max(0, projectedTotal - elapsedSec);
  return {
    percent,
    label: progress.label,
    elapsedSec,
    remainingSec,
    totalEstimateSec: projectedTotal,
    active: progress.active,
    completed: progress.completed,
  };
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
