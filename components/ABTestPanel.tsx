"use client";

import { useState, useTransition } from "react";
import { Loader2, FlaskConical, Swords } from "lucide-react";
import type { ABTestResult } from "@/lib/abTest";
import type { Platform } from "@/lib/types";

export function ABTestPanel() {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [titleA, setTitleA] = useState("");
  const [hookA, setHookA] = useState("");
  const [titleB, setTitleB] = useState("");
  const [hookB, setHookB] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<ABTestResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const runTest = () => {
    if (!titleA.trim() || !titleB.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/ab-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          versionA: { title: titleA, hook: hookA },
          versionB: { title: titleB, hook: hookB },
          context: context || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {/* Input */}
      <div className="space-y-4 rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Swords className="h-5 w-5 text-kolia-green" />
          <h2 className="font-bold text-kolia-ink">A/B Test Simulator</h2>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700">Nền tảng</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="mt-1 w-full rounded border px-3 py-2 text-sm">
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-green-700">Version A</label>
            <input type="text" value={titleA} onChange={(e) => setTitleA(e.target.value)} placeholder="Tiêu đề A" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
            <input type="text" value={hookA} onChange={(e) => setHookA(e.target.value)} placeholder="Hook A (optional)" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-semibold text-blue-700">Version B</label>
            <input type="text" value={titleB} onChange={(e) => setTitleB(e.target.value)} placeholder="Tiêu đề B" className="mt-1 w-full rounded border px-3 py-2 text-sm" />
            <input type="text" value={hookB} onChange={(e) => setHookB(e.target.value)} placeholder="Hook B (optional)" className="mt-2 w-full rounded border px-3 py-2 text-sm" />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700">Bối cảnh thị trường (optional)</label>
          <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2} className="mt-1 w-full rounded border px-3 py-2 text-sm" placeholder="VD: Fed giữ lãi suất, vàng đang ở đỉnh..." />
        </div>

        <button onClick={runTest} disabled={!titleA.trim() || !titleB.trim() || isPending}
          className="flex w-full items-center justify-center gap-2 rounded bg-kolia-green py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          {isPending ? "Đang phân tích..." : "Chạy A/B Test"}
        </button>
      </div>

      {/* Result */}
      <div className="space-y-4 rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h2 className="font-bold text-kolia-ink">Kết quả</h2>
        {result ? (
          <div>
            <div className={`rounded-lg p-4 text-center ${result.winner === "A" ? "bg-green-50 border border-green-200" : result.winner === "B" ? "bg-blue-50 border border-blue-200" : "bg-slate-50 border border-slate-200"}`}>
              <p className="text-3xl font-bold">{result.winner === "A" ? "🏆 A" : result.winner === "B" ? "🏆 B" : "⚖️ Hoà"}</p>
              <p className="mt-2 font-semibold">{result.winnerTitle.slice(0, 100)}</p>
              <p className="mt-1 text-sm text-slate-500">Tin cậy: {(result.confidence * 100).toFixed(0)}% · {result.predictedAdvantage}</p>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold uppercase text-slate-500">Lý do:</p>
              <ul className="mt-2 space-y-1">
                {result.reasons.map((r, i) => <li key={i} className="flex gap-2 text-sm text-slate-600"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-gold" />{r}</li>)}
              </ul>
            </div>
            {result.suggestions.length > 0 && (
              <div className="mt-4 rounded bg-kolia-amber p-3">
                <p className="text-xs font-bold text-slate-600">💡 Cải thiện cho version thua:</p>
                <ul className="mt-1 text-sm text-slate-600">
                  {result.suggestions.map((s, i) => <li key={i}>• {s}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FlaskConical className="h-12 w-12" />
            <p className="mt-4 text-sm">Nhập 2 version và chạy test để xem kết quả</p>
          </div>
        )}
      </div>
    </div>
  );
}
