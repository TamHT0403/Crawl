"use client";

import { useEffect, useRef, useState } from "react";
import {
  Database,
  FileText,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { ContentPromptStudio } from "@/components/ContentPromptStudio";

const STUDIO_STEPS = [
  {
    icon: Database,
    label: "Đang truy xuất dữ liệu đối thủ...",
    duration: 3000,
  },
  {
    icon: FileText,
    label: "Đang phân tích top bài hiệu quả...",
    duration: 4000,
  },
  {
    icon: Target,
    label: "Đang tải content gap...",
    duration: 4000,
  },
  {
    icon: TrendingUp,
    label: "Đang lấy dữ liệu thị trường real-time...",
    duration: 4000,
  },
  {
    icon: Sparkles,
    label: "Đang phân tích xu hướng & chuẩn bị studio...",
    duration: 2000,
  },
];

function StudioLoadingProgress() {
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const stepStartRef = useRef(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startRef.current) / 1000));
      if (now - stepStartRef.current >= STUDIO_STEPS[stepIdx].duration) {
        setStepIdx((i) => Math.min(i + 1, STUDIO_STEPS.length - 1));
        stepStartRef.current = now;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [stepIdx]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-xl border border-kolia-line bg-white p-8 shadow-sm">
        <div className="mb-8 flex justify-center">
          <FileText className="h-16 w-16 animate-pulse text-kolia-green" />
        </div>
        <div className="space-y-4">
          {STUDIO_STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            return (
              <div
                key={i}
                className={`flex items-center gap-4 transition-opacity ${isActive ? "opacity-100" : isDone ? "opacity-60" : "opacity-30"}`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-green-500 bg-green-50 text-green-600"
                      : isActive
                        ? "border-kolia-green bg-kolia-mint text-kolia-green"
                        : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                >
                  {isDone ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <Icon
                      className={`h-5 w-5 ${isActive ? "animate-bounce" : ""}`}
                    />
                  )}
                </div>
                <p
                  className={`text-sm font-semibold ${isDone ? "text-green-700" : isActive ? "text-kolia-ink" : "text-slate-400"}`}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Đã chạy {elapsed}s
        </p>
      </div>
    </div>
  );
}

export function ContentPromptStudioPageClient() {
  const [props, setProps] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/prompt-studio")
      .then((r) => r.json())
      .then((data) => {
        setProps(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <StudioLoadingProgress />;
  }

  if (!props) {
    return (
      <div className="py-32 text-center text-sm text-red-500">
        Không thể tải dữ liệu. Vui lòng thử lại.
      </div>
    );
  }

  return (
    <ContentPromptStudio
      configured={props.configured}
      model={props.model}
      domestic={props.domestic}
      formulas={props.formulas}
      lessonPosts={props.lessonPosts}
      marketSnapshot={props.marketSnapshot ?? null}
      trends={props.trends ?? null}
      postCountByPlatform={props.postCountByPlatform ?? {}}
    />
  );
}
