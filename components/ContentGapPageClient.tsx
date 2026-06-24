"use client";

import { useEffect, useRef, useState } from "react";
import { Database, Loader2, ScanSearch, Sparkles, Target, TrendingUp } from "lucide-react";
import { ContentGapPanel } from "@/components/ContentGapPanel";
import { ViralFormulaCard } from "@/components/ViralFormulaCard";

const GAP_STEPS = [
  { icon: Database, label: "Đang truy xuất dữ liệu bài viết...", duration: 3000 },
  { icon: Target, label: "Đang phân tích trụ cột nội dung...", duration: 4000 },
  { icon: TrendingUp, label: "Đang đánh giá mức độ tương tác...", duration: 4000 },
  { icon: ScanSearch, label: "Đang dò tìm khoảng trống nội dung...", duration: 5000 },
  { icon: Sparkles, label: "Đang tổng hợp kết quả...", duration: 3000 },
];

function GapLoadingProgress() {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const stepStartRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startRef.current) / 1000));
      if (now - stepStartRef.current >= GAP_STEPS[stepIdx].duration) {
        setStepIdx((i) => Math.min(i + 1, GAP_STEPS.length - 1));
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
            <ScanSearch className="h-16 w-16 animate-pulse text-kolia-green" />
          </div>
        </div>
        <div className="space-y-4">
          {GAP_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div key={i} className={`flex items-center gap-4 transition-opacity ${isActive ? "opacity-100" : isDone ? "opacity-60" : "opacity-30"}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                  isDone ? "border-green-500 bg-green-50 text-green-600" : isActive ? "border-kolia-green bg-kolia-mint text-kolia-green" : "border-slate-200 bg-slate-50 text-slate-400"
                }`}>
                  {isDone ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Icon className={`h-5 w-5 ${isActive ? "animate-bounce" : ""}`} />
                  )}
                </div>
                <p className={`text-sm font-semibold ${isDone ? "text-green-700" : isActive ? "text-kolia-ink" : "text-slate-400"}`}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Đã chạy {elapsed}s</p>
      </div>
    </div>
  );
}

export function ContentGapPageClient() {
  const [gap, setGap] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/content-gap?days=90")
      .then((r) => r.json())
      .then((data) => { setGap(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <GapLoadingProgress />;
  }

  if (!gap) {
    return (
      <div className="py-32 text-center text-sm text-red-500">
        Không thể tải dữ liệu. Vui lòng thử lại.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Báo cáo chiến lược nội dung</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Khoảng trống nội dung</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Report chia thành đối thủ trong nước và nước ngoài, giúp Kolia chọn tuyến nội dung/chương trình có thể khai thác mà vẫn trung lập, giáo dục và minh bạch.
        </p>
      </div>
      <ContentGapPanel domestic={gap.domestic} />
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-kolia-ink">B. Đối thủ nước ngoài: cấu trúc nội dung tạo lan tỏa có thể Việt hóa</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {gap.foreign?.shortForm?.slice(0, 3).map((formula: any) => (
            <ViralFormulaCard key={formula.sourceUrl} formula={formula} label="Video ngắn hiệu quả" />
          ))}
          {gap.foreign?.longForm?.slice(0, 3).map((formula: any) => (
            <ViralFormulaCard key={formula.sourceUrl} formula={formula} label="Video phân tích dài hiệu quả" />
          ))}
        </div>
        <div className="mt-5 rounded bg-kolia-amber p-4">
          <h3 className="font-bold text-kolia-ink">Định dạng triển khai phù hợp với Kolia</h3>
          <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700 md:grid-cols-2">
            {gap.foreign?.koliaFormats?.map((format: string) => (
              <li key={format} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-gold" />
                {format}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
