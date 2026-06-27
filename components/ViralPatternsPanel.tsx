"use client";

import { useRef, useState, useTransition } from "react";
import { BrainCircuit, Database, Loader2, Sparkles, TrendingUp, Target, BarChart3, Layers } from "lucide-react";
import type { ViralPattern, ViralCluster, EmergingTrend } from "@/lib/viralPatterns";

// ─── Loading Progress ──────────────────────────────────────────────────────

const VIRAL_STEPS = [
  { icon: Database, label: "Đang truy xuất dữ liệu bài viết...", duration: 3000 },
  { icon: Target, label: "Đang phân loại hook types...", duration: 4000 },
  { icon: Layers, label: "Đang phân tích format patterns...", duration: 4000 },
  { icon: TrendingUp, label: "Đang dò tìm emerging trends...", duration: 5000 },
  { icon: BrainCircuit, label: "AI đang phát hiện pattern viral...", duration: 8000 },
  { icon: Sparkles, label: "Đang tổng hợp kết quả...", duration: 3000 },
];

function ViralLoadingProgress() {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const stepStartRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startRef.current) / 1000));
      if (now - stepStartRef.current >= VIRAL_STEPS[stepIdx].duration) {
        const nextIdx = Math.min(stepIdx + 1, VIRAL_STEPS.length - 1);
        setStepIdx(nextIdx);
        stepStartRef.current = now;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [stepIdx]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-xl border border-kolia-line bg-white p-8 shadow-sm">
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <BrainCircuit className="h-16 w-16 animate-pulse text-kolia-green" />
            <span className="absolute -right-1 -top-1 flex h-5 w-5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-kolia-green opacity-75" />
              <span className="relative inline-flex h-5 w-5 rounded-full bg-kolia-green" />
            </span>
          </div>
        </div>
        <div className="space-y-4">
          {VIRAL_STEPS.map((step, i) => {
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
        <p className="mt-6 text-center text-xs text-slate-400">
          Đã chạy {elapsed >= 60 ? `${Math.floor(elapsed / 60)} phút ` : ""}{elapsed % 60}s
          {stepIdx >= 4 && " · AI đang xử lý, có thể mất thêm 10-15s"}
        </p>
      </div>
    </div>
  );
}

export function ViralPatternsPanel() {
  const [data, setData] = useState<{ patterns: ViralPattern[]; clusters: ViralCluster[]; emergingTrends: EmergingTrend[] } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [days, setDays] = useState(90);
  // Track whether user has ever run an analysis
  const [hasRun, setHasRun] = useState(false);

  const fetchData = () => {
    setHasRun(true);
    startTransition(async () => {
      const res = await fetch(`/api/viral-patterns?days=${days}`);
      const d = await res.json();
      setData(d);
    });
  };

  const typeIcons: Record<string, typeof TrendingUp> = { hook: Target, format: Layers, topic: TrendingUp, structure: BarChart3, timing: BarChart3 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded border px-3 py-1.5 text-sm">
          <option value={30}>30 ngày</option>
          <option value={90}>90 ngày</option>
          <option value={180}>180 ngày</option>
        </select>
        <button onClick={fetchData} className="rounded bg-kolia-green px-4 py-1.5 text-sm font-semibold text-white">
          {isPending ? "Đang phân tích..." : "Phân tích"}
        </button>
      </div>

      {isPending ? (
        <ViralLoadingProgress />
      ) : !hasRun ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-kolia-line bg-slate-50 py-20 text-center">
          <BrainCircuit className="mb-4 h-12 w-12 text-slate-300" />
          <p className="font-semibold text-slate-500">Chọn khoảng thời gian và nhấn <span className="text-kolia-green">Phân tích</span></p>
          <p className="mt-1 text-sm text-slate-400">AI sẽ quét dữ liệu và phát hiện các pattern viral đang hoạt động.</p>
        </div>
      ) : !data ? null : (
        <>
          {/* Viral Patterns */}
          {data.patterns.length > 0 && (
            <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
              <h2 className="font-bold text-kolia-ink">🔥 Viral Patterns</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {data.patterns.map((p) => {
                  const Icon = typeIcons[p.type] ?? TrendingUp;
                  return (
                    <div key={p.id} className="rounded border border-kolia-line bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-kolia-green" />
                        <span className="rounded bg-kolia-mint px-1.5 py-0.5 text-[10px] font-semibold text-kolia-green">{p.type}</span>
                      </div>
                      <h3 className="mt-2 font-semibold text-kolia-ink">{p.name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{p.description}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>📈 Engagement: <strong>{(p.avgEngagement * 100).toFixed(1)}%</strong></span>
                        <span>📊 Mẫu: <strong>{p.sampleCount}</strong></span>
                        <span>🎯 Độ tin cậy: <strong>{(p.confidence * 100).toFixed(0)}%</strong></span>
                      </div>
                      {p.examplePost && (
                        <div className="mt-2 rounded bg-white p-2 text-xs text-slate-500">
                          🏆 {p.examplePost.competitor}: "{p.examplePost.title.slice(0, 60)}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Emerging Trends */}
          {data.emergingTrends.length > 0 && (
            <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
              <h2 className="font-bold text-kolia-ink">📈 Emerging Trends</h2>
              <div className="mt-4 space-y-3">
                {data.emergingTrends.map((t, i) => (
                  <div key={i} className="flex items-center justify-between rounded border border-kolia-line p-4">
                    <div>
                      <p className="font-semibold text-kolia-ink">{t.topic}</p>
                      <p className="text-sm text-slate-500">{t.description}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${t.growthRate > 50 ? "text-green-600" : "text-amber-600"}`}>
                        +{t.growthRate.toFixed(0)}%
                      </p>
                      <p className="text-xs text-slate-400">{t.postCount} bài</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Clusters */}
          {data.clusters.length > 0 && (
            <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
              <h2 className="font-bold text-kolia-ink">📊 Content Clusters</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {data.clusters.map((c) => (
                  <div key={c.id} className="rounded border border-kolia-line p-4">
                    <h3 className="font-semibold text-kolia-ink">{c.label}</h3>
                    <p className="text-xs text-slate-500">{c.size} bài · engagement BQ {(c.avgEngagement * 100).toFixed(1)}%</p>
                    {c.commonPatterns.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-slate-600">
                        {c.commonPatterns.map((pat, i) => <li key={i}>• {pat}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.patterns.length === 0 && data.clusters.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-400">Chưa có đủ dữ liệu để phát hiện pattern. Cần ít nhất 5 bài viết có engagement cao.</p>
          )}
        </>
      )}
    </div>
  );
}
