"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Award,
  ExternalLink,
  Lightbulb,
  Loader2,
  MessagesSquare,
  Music2,
  Rocket,
  Target,
  TrendingUp,
  Youtube,
  Database,
  BrainCircuit,
  Sparkles,
} from "lucide-react";
import type { ContentRecommendation, RecommendationReport } from "@/lib/types";

const typeConfig: Record<string, { label: string; icon: typeof Lightbulb; color: string }> = {
  gap: { label: "Khoảng trống", icon: Target, color: "text-purple-600 bg-purple-50 border-purple-200" },
  trend: { label: "Xu hướng", icon: TrendingUp, color: "text-blue-600 bg-blue-50 border-blue-200" },
  improvement: { label: "Cải thiện", icon: Award, color: "text-green-600 bg-green-50 border-green-200" },
  experiment: { label: "Thử nghiệm", icon: Rocket, color: "text-orange-600 bg-orange-50 border-orange-200" },
};

const platformIcons: Record<string, typeof Youtube> = {
  youtube: Youtube,
  tiktok: Music2,
  facebook: MessagesSquare,
};

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

// ─── Loading Progress ──────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { icon: Database, label: "Đang thu thập dữ liệu đối thủ...", duration: 3000 },
  { icon: Target, label: "Đang phân tích content gap...", duration: 4000 },
  { icon: TrendingUp, label: "Đang đánh giá hiệu quả nền tảng...", duration: 4000 },
  { icon: BrainCircuit, label: "Đang gọi AI phân tích chiến lược...", duration: 8000 },
  { icon: Sparkles, label: "Đang tổng hợp đề xuất...", duration: 3000 },
];

function LoadingProgress() {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const stepStartRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startRef.current) / 1000));

      // Advance step if current step's duration has passed
      if (now - stepStartRef.current >= PIPELINE_STEPS[stepIdx].duration) {
        const nextIdx = Math.min(stepIdx + 1, PIPELINE_STEPS.length - 1);
        setStepIdx(nextIdx);
        stepStartRef.current = now;
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [stepIdx]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-xl border border-kolia-line bg-white p-8 shadow-sm">
        {/* Animated brain */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <BrainCircuit className="h-16 w-16 animate-pulse text-kolia-green" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kolia-green opacity-75" />
              <span className="relative inline-flex h-5 w-5 rounded-full bg-kolia-green" />
            </span>
          </div>
        </div>

        {/* Progress steps */}
        <div className="space-y-4">
          {PIPELINE_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div key={i} className={`flex items-center gap-4 transition-opacity ${isActive ? "opacity-100" : isDone ? "opacity-60" : "opacity-30"}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                  isDone
                    ? "border-green-500 bg-green-50 text-green-600"
                    : isActive
                    ? "border-kolia-green bg-kolia-mint text-kolia-green"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                }`}>
                  {isDone ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Icon className={`h-5 w-5 ${isActive ? "animate-bounce" : ""}`} />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isDone ? "text-green-700" : isActive ? "text-kolia-ink" : "text-slate-400"}`}>
                    {step.label}
                  </p>
                  {isActive && (
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full animate-[progress_2s_ease-in-out_infinite] rounded-full bg-kolia-green" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Timer */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Đã chạy {elapsed >= 60 ? `${Math.floor(elapsed / 60)} phút ` : ""}{elapsed % 60}s
          {stepIdx >= 3 && " · AI đang xử lý, có thể mất thêm 10-20s"}
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function RecommendationPanel() {
  const [report, setReport] = useState<RecommendationReport | null>(null);
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState(30);
  // Track whether user has ever triggered an analysis
  const [hasRun, setHasRun] = useState(false);

  const fetchRecs = () => {
    setHasRun(true);
    startTransition(async () => {
      const response = await fetch(`/api/recommendations?days=${days}`);
      const data = await response.json();
      setReport(data);
    });
  };

  const highCount = report?.recommendations.filter((r) => r.priority === "high").length ?? 0;
  const mediumCount = report?.recommendations.filter((r) => r.priority === "medium").length ?? 0;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-kolia-line bg-white p-4 shadow-sm">
        <Lightbulb className="h-5 w-5 text-kolia-gold" />
        <span className="text-sm font-semibold text-kolia-ink">Đề xuất chiến lược</span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="ml-auto rounded border border-kolia-line px-3 py-1.5 text-sm"
        >
          <option value={7}>7 ngày</option>
          <option value={30}>30 ngày</option>
          <option value={90}>90 ngày</option>
        </select>
        <button
          type="button"
          onClick={fetchRecs}
          className="rounded bg-kolia-green px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          {isPending ? "Đang phân tích..." : "Phân tích"}
        </button>
      </div>

      {/* Summary */}
      {report && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded border border-kolia-line bg-white px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500">Tổng</span>
            <p className="text-xl font-bold text-kolia-ink">{report.recommendations.length}</p>
          </div>
          <div className="rounded border border-red-200 bg-red-50 px-4 py-2 shadow-sm">
            <span className="text-xs text-red-500">Ưu tiên cao</span>
            <p className="text-xl font-bold text-red-600">{highCount}</p>
          </div>
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2 shadow-sm">
            <span className="text-xs text-amber-500">Trung bình</span>
            <p className="text-xl font-bold text-amber-600">{mediumCount}</p>
          </div>
        </div>
      )}

      {/* AI Progress */}
      {isPending ? (
        <LoadingProgress />
      ) : !hasRun ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-kolia-line bg-slate-50 py-20 text-center">
          <Lightbulb className="mb-4 h-12 w-12 text-slate-300" />
          <p className="font-semibold text-slate-500">Chọn khoảng thời gian và nhấn <span className="text-kolia-green">Phân tích</span></p>
          <p className="mt-1 text-sm text-slate-400">AI sẽ phân tích dữ liệu đối thủ và đề xuất chiến lược nội dung phù hợp.</p>
        </div>
      ) : !report ? null : (
        <div className="space-y-3">
          {report.recommendations.map((rec) => {
            const cfg = typeConfig[rec.type] ?? typeConfig.experiment;
            const Icon = cfg.icon;
            const PlatIcon = platformIcons[rec.platform] ?? Youtube;

            return (
              <div
                key={rec.id}
                className={`rounded border-l-4 bg-white shadow-sm transition hover:shadow-md ${
                  rec.priority === "high"
                    ? "border-l-red-400"
                    : rec.priority === "medium"
                      ? "border-l-amber-400"
                      : "border-l-slate-300"
                }`}
              >
                <div className="flex items-start gap-4 p-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${cfg.color.split(" ").slice(1).join(" ")}`}>
                    <Icon className={`h-5 w-5 ${cfg.color.split(" ")[0]}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-kolia-ink">{rec.title}</h3>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${priorityColors[rec.priority]}`}>
                        {rec.priority === "high" ? "Cao" : rec.priority === "medium" ? "TB" : "Thấp"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{rec.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <PlatIcon className="h-3.5 w-3.5" />
                        {rec.platform === "youtube" ? "YouTube" : rec.platform === "tiktok" ? "TikTok" : "Facebook"}
                      </span>
                      <span>💥 {rec.expectedImpact}</span>
                      {rec.competitorReference && <span>🏆 {rec.competitorReference}</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded bg-kolia-mint px-2 py-0.5 text-xs font-semibold text-kolia-green">
                        {cfg.label}
                      </span>
                      <span className="text-xs text-slate-400">→ {rec.action}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {report && (
        <div className="rounded border border-kolia-line bg-kolia-amber p-3 text-xs leading-5 text-slate-600">
          <strong>📋 Generated:</strong> {new Date(report.generatedAt).toLocaleString("vi-VN")}
        </div>
      )}
    </div>
  );
}
