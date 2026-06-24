"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type SyncJobStatus = {
  state: "running" | "completed" | "error";
  progress?: Record<string, unknown>;
  logs?: string[];
  result?: {
    competitors?: number;
    createdPosts?: number;
    updatedPosts?: number;
    elapsed?: string;
    error?: string;
  };
  cookieInvalid?: boolean;
  cookieInvalidCompetitor?: string;
};

export function GlobalSyncStatus() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncJobStatus | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkStorage = () => {
      const storedJobId = localStorage.getItem("currentSyncJobId");
      if (storedJobId && storedJobId !== jobId) {
        setJobId(storedJobId);
      }
    };

    checkStorage();

    const handleJobStarted = () => checkStorage();
    window.addEventListener("syncJobStarted", handleJobStarted);
    return () => window.removeEventListener("syncJobStarted", handleJobStarted);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/sync/status?jobId=${jobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setJobId(null);
            localStorage.removeItem("currentSyncJobId");
          }
          return;
        }

        const data: SyncJobStatus = await res.json();
        setStatus(data);

        if (data.state === "completed" || data.state === "error") {
          setJobId(null);
          localStorage.removeItem("currentSyncJobId");
          setShowPopup(true);
          if (data.state === "completed") {
            router.refresh();
          }
        }
      } catch {
        // ignore network error
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [jobId, router]);

  const closePopup = () => {
    setShowPopup(false);
    setStatus(null);
  };

  if (!jobId && !showPopup) return null;

  const platforms = status?.progress
    ? Object.entries(status.progress).filter(
        ([k]) => k !== "percent" && k !== "total" && k !== "completed"
      )
    : [];

  return (
    <>
      {/* Floating progress bar khi đang chạy */}
      {jobId && status?.state === "running" && (
        <div className="fixed bottom-6 right-6 z-50 flex max-h-[80vh] w-[360px] flex-col rounded-lg border border-kolia-line bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-kolia-line px-4 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-kolia-green" />
            <p className="text-sm font-bold text-kolia-ink flex-1">Đang đồng bộ dữ liệu...</p>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-slate-600"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>

          {/* Progress */}
          <div className="flex flex-col gap-3 px-4 py-3">
            {platforms.map(([plat, platData]) => {
              const pData = platData as Record<string, unknown>;
              return (
                <div key={plat} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold capitalize text-kolia-ink">{plat}</p>
                    {pData.phase === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-kolia-green" />
                    ) : (
                      <span className="text-[10px] font-bold text-kolia-green">
                        {String(pData.percent ?? 0)}%
                      </span>
                    )}
                  </div>
                  {pData.phase !== "done" && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-kolia-green transition-all duration-500"
                        style={{ width: `${pData.percent || 0}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {platforms.length === 0 && (
              <p className="text-xs text-slate-500">Đang khởi tạo...</p>
            )}
          </div>

          {/* Logs (expandable) */}
          {expanded && status.logs && status.logs.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto border-t border-kolia-line px-4 py-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Log chi tiết
              </p>
              <div className="space-y-1">
                {status.logs.map((log, i) => (
                  <p key={i} className="text-[11px] leading-5 text-slate-600">
                    {log}
                  </p>
                ))}
              </div>
            </div>
          )}

          {status.cookieInvalid && (
            <p className="border-t border-red-100 px-4 pb-3 pt-2 text-[11px] font-semibold text-amber-600">
            </p>
          )}
        </div>
      )}

      {/* Popup kết quả khi hoàn tất */}
      {showPopup && status && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-kolia-line bg-white p-6 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              {status.state === "completed" ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-kolia-mint">
                  <CheckCircle2 className="h-8 w-8 text-kolia-green" />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              )}

              <h2 className="mt-4 text-xl font-bold text-kolia-ink">
                {status.state === "completed" ? "Đồng bộ hoàn tất!" : "Đồng bộ thất bại"}
              </h2>

              <div className="mt-2 w-full text-sm text-slate-600">
                {status.state === "completed" ? (
                  <>
                    <p>
                      Đã cập nhật thành công dữ liệu cho{" "}
                      <strong>{status.result?.competitors || 0} đối thủ</strong>.
                    </p>
                    <div className="mt-4 flex justify-center gap-4 text-xs">
                      <div className="rounded border border-kolia-line bg-slate-50 px-3 py-2">
                        <p className="font-bold text-kolia-ink">
                          {status.result?.createdPosts || 0}
                        </p>
                        <p className="text-slate-500">Bài mới</p>
                      </div>
                      <div className="rounded border border-kolia-line bg-slate-50 px-3 py-2">
                        <p className="font-bold text-kolia-ink">
                          {status.result?.updatedPosts || 0}
                        </p>
                        <p className="text-slate-500">Cập nhật</p>
                      </div>
                      <div className="rounded border border-kolia-line bg-slate-50 px-3 py-2">
                        <p className="font-bold text-kolia-ink">
                          {status.result?.elapsed || "0s"}
                        </p>
                        <p className="text-slate-500">Thời gian</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-red-600">
                    {status.result?.error || "Đã xảy ra lỗi không xác định."}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={closePopup}
              className="mt-8 w-full rounded-lg bg-kolia-ink py-2.5 text-sm font-bold text-white hover:bg-slate-800"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </>
  );
}
