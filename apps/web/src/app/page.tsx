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

type Language = "ko" | "en";

const configuredApiBase = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "/api/orchestrator";
const samplePrompt =
  "버려진 주유소에서 두 청소년이 낡은 캠코더로 서로를 찍다가, 마지막에 사라진 친구의 영상을 발견하는 30초짜리 독립영화풍 영상.";

const copy = {
  ko: {
    appName: "AFS",
    subtitle: "텍스트를 넣으면 하나의 영화 프리뷰로 조립합니다.",
    make: "만들기",
    result: "결과",
    title: "제목",
    script: "시나리오",
    visualStyle: "영상 스타일",
    audioStyle: "소리 스타일",
    textToMovie: "텍스트로 영화 만들기",
    making: "영화 만드는 중",
    ready: "준비됨",
    inputTitle: "텍스트 투 무비",
    inputBody: "시나리오만 넣고 실행하세요. AFS가 내부적으로 컷과 구간을 나누지만, 화면에는 최종 조립된 영화만 보여줍니다.",
    previewTitle: "영화 프리뷰",
    previewBody: "중간 1~2초 조각은 표시하지 않습니다. 모든 컷이 완성되고 합쳐진 뒤 한 번만 나타납니다.",
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
    open: "열기",
    finalMovie: "최종 영화",
    shotPreview: "샷 프리뷰",
    close: "닫기",
  },
  en: {
    appName: "AFS",
    subtitle: "Turn text into one stitched movie preview.",
    make: "Make",
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
    open: "Open",
    finalMovie: "Final movie",
    shotPreview: "Shot preview",
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
  const [title, setTitle] = useState("Last Tape");
  const [scriptPrompt, setScriptPrompt] = useState(samplePrompt);
  const [styleHint, setStyleHint] = useState("early 2000s camcorder, lo-fi indie film");
  const [audioHint, setAudioHint] = useState("fluorescent buzz, tape hiss, distant wind");
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

  const latestJobs = useMemo(() => jobs.slice(0, 6), [jobs]);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      if (!orchestratorUrl) throw new Error("Missing orchestrator URL");
      const response = await fetch(`${orchestratorUrl}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    [orchestratorUrl],
  );

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
    const interval = window.setInterval(loadGallery, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadGallery]);

  function saveOrchestratorUrl() {
    const normalized = orchestratorInput.trim().replace(/\/$/, "");
    setOrchestratorUrl(normalized);
    if (normalized) window.localStorage.setItem("afs.orchestratorUrl", normalized);
    else window.localStorage.removeItem("afs.orchestratorUrl");
  }

  async function createMovieFromText() {
    setBusy(true);
    setMoviePreviewUrl(null);
    setGraph(null);
    setProject(null);
    try {
      setStatus(t.creating);
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

      setStatus(t.planning);
      const planned = await request<CineGraph>(`/api/projects/${created.project_id}/plan`, { method: "POST" });
      setGraph(planned);

      setStatus(t.keyframing);
      for (const shot of planned.shots) {
        await request(`/api/shots/${shot.shot_id}/keyframes/generate`, {
          method: "POST",
          body: JSON.stringify({ slots: ["first", "middle", "last"], renderer: "mock" }),
        });
      }

      setStatus(t.rendering);
      for (const shot of planned.shots) {
        await request(`/api/shots/${shot.shot_id}/render`, {
          method: "POST",
          body: JSON.stringify({ preset: "preview", renderer: "comfy_ltx", audio: true }),
        });
      }

      setStatus(t.audio);
      for (const shot of planned.shots) {
        await request(`/api/shots/${shot.shot_id}/audio/render`, {
          method: "POST",
          body: JSON.stringify({ layers: ["foley", "ambience", "music"], adapter: "mock_audio" }),
        });
      }

      setStatus(t.exporting);
      const exported = await request<{ media_url: string | null }>(`/api/projects/${created.project_id}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "mp4", resolution: "1280x720", include_audio: true }),
      });

      if (exported.media_url) {
        setMoviePreviewUrl(`${orchestratorUrl}${exported.media_url}`);
      } else {
        const preview = await request<{ media_url: string }>(`/api/projects/${created.project_id}/preview`);
        setMoviePreviewUrl(`${orchestratorUrl}${preview.media_url}`);
      }
      await loadGallery();
      setStatus(t.complete);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d10] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0b0d10]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3">
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

      <div className="mx-auto grid max-w-[1700px] gap-4 px-4 py-5 xl:grid-cols-[0.58fr_1.08fr_360px]">
        <section id="make" className="space-y-4">
          <Panel title={t.inputTitle} description={t.inputBody} icon={<Sparkles size={18} className="text-emerald-300" />}>
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
                  rows={9}
                  className="mt-1 w-full resize-none rounded-md border border-slate-700 bg-[#0b0d10] px-3 py-3 text-slate-100 outline-none focus:border-emerald-400"
                />
              </label>
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
              <button
                className="mt-1 flex h-13 items-center justify-center gap-2 rounded-md bg-emerald-400 px-4 text-base font-semibold text-slate-950 disabled:opacity-60"
                disabled={busy}
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
                <video controls className="aspect-video min-h-[520px] w-full bg-black object-contain" src={moviePreviewUrl} />
              ) : (
                <div className="grid aspect-video min-h-[520px] place-items-center p-6 text-center text-sm text-slate-500">
                  <div>
                    <MonitorPlay className="mx-auto mb-3 text-slate-700" size={44} />
                    {t.noPreview}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title={t.pcStatus} icon={<Gauge size={18} className="text-rose-300" />}>
            <SystemUsagePanel usage={usage} error={usageError} t={t} />
          </Panel>
        </section>

        <aside className="xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <ResultsRail
            items={gallery}
            t={t}
            orchestratorUrl={orchestratorUrl}
            selectedId={selectedGalleryItem?.artifact_id ?? null}
            onSelect={setSelectedGalleryItem}
            onOpenAlbum={() => setAlbumOpen(true)}
          />
        </aside>
      </div>

      <section className="mx-auto max-w-[1500px] px-4 pb-8">
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
            <p className="text-xs text-slate-500">{items.length} {t.latestOutputs}</p>
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
      {items.length === 0 ? <EmptyState text={t.noOutputs} /> : null}
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
            <p className="mt-0.5 truncate text-xs text-slate-500">{isFinal ? t.finalMovie : `${t.shotPreview} · ${item.label}`}</p>
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
          <div className="min-h-0 overflow-hidden rounded-md border border-slate-800 bg-black">
            {active ? (
              <video controls className="h-full max-h-[calc(100vh-9rem)] w-full bg-black object-contain" src={`${orchestratorUrl}${active.media_url}`} />
            ) : (
              <div className="grid h-full min-h-[420px] place-items-center text-sm text-slate-500">{t.noOutputs}</div>
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

function formatSeconds(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
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
