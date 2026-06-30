"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Database, Loader2, X } from "lucide-react";
import { DateRangePicker } from "rsuite";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import type { Platform } from "@/lib/types";

type CompetitorItem = {
  id: string;
  name: string;
  platform: string;
  source: string;
};

type SyncPanelProps = {
  open: boolean;
  onClose: () => void;
};

type LogEntry = {
  id: number;
  message: string;
  time: string;
};

type CrawlerStatus = {
  state: string;
  target?: string;
  elapsed_seconds?: number;
  error?: string;
};

const platformOptions: { value: Platform; label: string; color: string }[] = [
  { value: "youtube", label: "YouTube", color: "bg-red-50 text-red-700 ring-red-100" },
  { value: "tiktok", label: "TikTok", color: "bg-zinc-900 text-white ring-zinc-800" },
  { value: "facebook", label: "Facebook", color: "bg-blue-50 text-blue-700 ring-blue-100" }
];

const vietnamDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getVietnamToday() {
  const parts = vietnamDateFormatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return startOfDay(new Date(year, month - 1, day));
}

const vietnamToday = getVietnamToday();

const predefinedRanges = [
  { label: "Hôm nay", value: [vietnamToday, endOfDay(vietnamToday)] as [Date, Date] },
  { label: "7 ngày qua", value: [startOfDay(subDays(vietnamToday, 6)), endOfDay(vietnamToday)] as [Date, Date] },
  { label: "30 ngày qua", value: [startOfDay(subDays(vietnamToday, 29)), endOfDay(vietnamToday)] as [Date, Date] }
];

export function SyncPanel({ open, onClose }: SyncPanelProps) {
  const router = useRouter();
  const [competitors, setCompetitors] = useState<CompetitorItem[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["youtube", "tiktok", "facebook"]);
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[Date, Date] | null>(null);
  const [facebookMaxPosts, setFacebookMaxPosts] = useState(50);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Platform[]>(["youtube", "tiktok", "facebook"]);
  const panelRef = useRef<HTMLDivElement>(null);

  // ─── Sync state ──────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0); // 0–100
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [syncResult, setSyncResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ─── Job queue state ─────────────────────────────────────────────
  const [serverStatus, setServerStatus] = useState<CrawlerStatus | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Load competitors on mount & check active sync
  useEffect(() => {
    if (!open) return;

    setSyncResult(null);
    setLogs([]);
    setProgress(0);
    fetch("/api/competitors?pageSize=999")
      .then((res) => res.json())
      .then((data) => {
        const items: CompetitorItem[] = (data.competitors ?? []).map(
          (c: { id: string; name: string; platform: string; source: string }) => ({
            id: c.id,
            name: c.name,
            platform: c.platform,
            source: c.source
          })
        );
        setCompetitors(items);
        // Giữ nguyên selected competitors nếu có, nếu không chọn all
        setSelectedCompetitorIds((prev) =>
          prev.length > 0 ? prev : items.map((c) => c.id)
        );
      })
      .catch(() => {});

    // Nếu đang có sync job active, poll để lấy logs realtime
    const activeJobId = localStorage.getItem("currentSyncJobId");
    if (activeJobId) {
      setSyncing(true);
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/sync/status?jobId=${activeJobId}`);
          if (!res.ok) {
            if (res.status === 404) {
              clearInterval(pollInterval);
              setSyncing(false);
            }
            return;
          }
          const data = await res.json();
          if (data.logs && Array.isArray(data.logs)) {
            setLogs(data.logs.map((msg: string, i: number) => ({
              id: i,
              message: msg,
              time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            })));
          }
          if (data.progress) {
            const platProgress = Object.entries(data.progress)
              .filter(([k]) => k !== "total" && k !== "completed" && k !== "percent")
              .map(([, v]) => v as Record<string, unknown>);
            if (platProgress.length > 0) {
              setProgress((platProgress[0].percent as number) ?? 0);
            }
          }
          if (data.state === "completed" || data.state === "error") {
            clearInterval(pollInterval);
            setSyncing(false);
            setProgress(100);
            if (data.state === "completed") {
              const r = data.result || {};
              setSyncResult({
                message: `✅ Đã đồng bộ: ${r.createdPosts || 0} bài mới, cập nhật ${r.updatedPosts || 0} bài`,
                type: "success",
              });
              router.refresh();
            } else {
              setSyncResult({ message: `❌ ${data.result?.error || "Có lỗi"}`, type: "error" });
            }
          }
        } catch {
          // ignore
        }
      }, 2000);
    }
  }, [open]);

  // Poll crawler status while syncing
  useEffect(() => {
    if (!syncing) {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      statusPollRef.current = null;
      setServerStatus(null);
      return;
    }

    // Chọn endpoint phù hợp với platform đang sync
    const hasFacebook = selectedPlatforms.includes("facebook");
    const hasTikTok = selectedPlatforms.includes("tiktok");
    const statusEndpoint = hasFacebook && !hasTikTok
      ? "/api/facebook/crawler-status"
      : "/api/tiktok/crawler-status";

    const poll = () => {
      fetch(statusEndpoint)
        .then((r) => r.json())
        .then((s: CrawlerStatus) => setServerStatus(s))
        .catch(() => setServerStatus({ state: "unreachable" }));
    };

    poll(); // immediate first poll
    statusPollRef.current = setInterval(poll, 3000);
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [syncing, selectedPlatforms]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const toggleCompetitor = (id: string) => {
    setSelectedCompetitorIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id]
    );
  };

  const toggleSelectAllForPlatform = (platform: Platform, select: boolean) => {
    const ids = competitors.filter((c) => c.platform === platform).map((c) => c.id);
    setSelectedCompetitorIds((prev) =>
      select ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id))
    );
  };

  const toggleExpandPlatform = (platform: Platform) => {
    setExpandedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const groupedCompetitors = useMemo(
    () =>
      competitors.reduce<Record<string, CompetitorItem[]>>((acc, c) => {
        acc[c.platform] = acc[c.platform] ?? [];
        acc[c.platform].push(c);
        return acc;
      }, {}),
    [competitors]
  );

  const addLog = (message: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { id: Date.now() + Math.random(), message, time }]);
  };

  const formatFilterDate = (date: Date) => format(date, "yyyy-MM-dd");

  // ─── Handle Sync (background job) ───────────────────────────────
  // ─── Handle Sync (background job + poll status) ─────────────────
  const handleSync = useCallback(() => {
    if (selectedPlatforms.length === 0 || syncing) return;
    setSyncing(true);
    setProgress(0);
    setLogs([]);
    setSyncResult(null);

    (async () => {
      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platforms: selectedPlatforms,
            startDate: dateRange?.[0] ? formatFilterDate(dateRange[0]) : undefined,
            endDate: dateRange?.[1] ? formatFilterDate(dateRange[1]) : undefined,
            competitorIds: selectedCompetitorIds,
            facebookMaxPosts,
          }),
        });

        if (!response.ok) {
          addLog("❌ Lỗi kết nối đến server.");
          setSyncResult({ message: "❌ Lỗi kết nối", type: "error" });
          setSyncing(false);
          return;
        }

        const { jobId } = await response.json();
        localStorage.setItem("currentSyncJobId", jobId);
        window.dispatchEvent(new Event("syncJobStarted"));

        // Poll status để lấy logs realtime
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch(`/api/sync/status?jobId=${jobId}`);
            if (!res.ok) {
              if (res.status === 404) {
                clearInterval(pollInterval);
                setSyncing(false);
              }
              return;
            }
            const data = await res.json();
            if (data.logs && Array.isArray(data.logs)) {
              setLogs(data.logs.map((msg: string, i: number) => ({
                id: i,
                message: msg,
                time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
              })));
            }
            if (data.progress) {
              const platProgress = Object.entries(data.progress)
                .filter(([k]) => k !== "total" && k !== "completed" && k !== "percent")
                .map(([, v]) => v as Record<string, unknown>);
              if (platProgress.length > 0) {
                setProgress((platProgress[0].percent as number) ?? 0);
              }
            }
            if (data.state === "completed" || data.state === "error") {
              clearInterval(pollInterval);
              setSyncing(false);
              setProgress(100);
              if (data.state === "completed") {
                const r = data.result || {};
                setSyncResult({
                  message: `✅ Đã đồng bộ: ${r.createdPosts || 0} bài mới, cập nhật ${r.updatedPosts || 0} bài (${r.competitors || 0} đối thủ, mất ${r.elapsed || "0s"})`,
                  type: "success",
                });
                router.refresh();
              } else {
                setSyncResult({ message: `❌ ${data.result?.error || "Có lỗi xảy ra"}`, type: "error" });
              }
            }
          } catch {
            // ignore poll errors
          }
        }, 2000);
      } catch {
        addLog("❌ Lỗi kết nối, vui lòng thử lại.");
        setSyncResult({ message: "❌ Lỗi kết nối", type: "error" });
        setSyncing(false);
      }
    })();
  }, [selectedPlatforms, dateRange, selectedCompetitorIds, facebookMaxPosts, syncing, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-8 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="mx-4 flex w-full max-w-3xl max-h-[90vh] flex-col rounded-xl border border-kolia-line bg-white shadow-soft"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-kolia-line px-6 py-4">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-kolia-green" />
            <div>
              <h2 className="text-lg font-bold text-kolia-ink">Sync Data - Tùy chỉnh đồng bộ</h2>
              <p className="text-xs text-slate-500">Chọn nền tảng, khoảng thời gian và đối thủ cần đồng bộ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={syncing}
            className="flex h-8 w-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* ── 1. Platform ────────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-kolia-green">1. Chọn nền tảng</h3>
            <div className="flex flex-wrap gap-3">
              {platformOptions.map(({ value, label, color }) => {
                const active = selectedPlatforms.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => !syncing && togglePlatform(value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition",
                      active
                        ? "border-kolia-green bg-kolia-mint text-kolia-green shadow-sm"
                        : "border-kolia-line bg-white text-slate-600 hover:border-slate-300",
                      syncing && "pointer-events-none opacity-60"
                    )}
                  >
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold", active ? "bg-kolia-green text-white" : color)}>
                      {value.charAt(0).toUpperCase()}
                    </span>
                    {label}
                    {active && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-kolia-green text-[10px] text-white">✓</span>}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 2. Date range ──────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-kolia-green">2. Khoảng thời gian</h3>
            <div className="rounded-lg border border-kolia-line bg-slate-50 p-4">
              <DateRangePicker
                value={dateRange}
                onChange={(value) => {
                  if (syncing) return;
                  if (!value) { setDateRange(null); return; }
                  const [start, end] = value;
                  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
                  if (diffDays > 30) {
                    // Tự động thu gọn về 30 ngày
                    const clampedEnd = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
                    setDateRange([start, clampedEnd]);
                  } else {
                    setDateRange(value);
                  }
                }}
                format="dd/MM/yyyy"
                character=" → "
                placeholder="Chọn khoảng thời gian"
                ranges={predefinedRanges}
                block
                appearance="default"
                size="md"
                cleanable
                showHeader
                editable={false}
                shouldDisableDate={(date) => date > new Date()}
              />
              <p className="mt-2 text-xs text-slate-400">
                ⓘ Giới hạn tối đa 30 ngày. Nếu chọn khoảng lớn hơn, hệ thống tự động thu về 30 ngày.
              </p>
            </div>
          </section>

          {/* ── 3. Max Posts ──────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-kolia-green">3. Giới hạn bài viết</h3>
            <div className="rounded-lg border border-kolia-line bg-slate-50 p-4">
              <label className="block text-sm font-semibold text-slate-700">
                Số bài tối đa cho mỗi đối thủ
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={10}
                    value={facebookMaxPosts}
                    onChange={(e) => setFacebookMaxPosts(Number(e.target.value))}
                    disabled={syncing}
                    className="flex-1 accent-kolia-green"
                  />
                  <span className="min-w-[4rem] rounded bg-white px-3 py-1.5 text-center text-sm font-bold text-kolia-ink border border-kolia-line">
                    {facebookMaxPosts}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Áp dụng cho tất cả nền tảng. Mặc định: 50. Tối đa 100 bài / đối thủ để tránh quá tải.
                </p>
              </label>
            </div>
          </section>

          {/* ── 4. Competitors ──────────────────────────────────────── */}
          <section>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.1em] text-kolia-green">4. Chọn đối thủ</h3>
            <div className="space-y-3">
              {platformOptions.map(({ value: platform, label }) => {
                const platformCompetitors = groupedCompetitors[platform] ?? [];
                const isPlatformSelected = selectedPlatforms.includes(platform);
                const isExpanded = expandedPlatforms.includes(platform);
                const selectedCount = platformCompetitors.filter((c) => selectedCompetitorIds.includes(c.id)).length;
                const allSelected = selectedCount === platformCompetitors.length && platformCompetitors.length > 0;

                return (
                  <div
                    key={platform}
                    className={cn(
                      "rounded-lg border transition",
                      isPlatformSelected ? "border-kolia-line bg-white" : "border-dashed border-slate-200 bg-slate-50 opacity-50"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => { if (isPlatformSelected && !syncing) toggleExpandPlatform(platform); }}
                      disabled={syncing}
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isPlatformSelected ? (
                          isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="text-sm font-bold text-kolia-ink">{label}</span>
                        <span className="text-xs text-slate-400">({platformCompetitors.length} đối thủ)</span>
                      </div>
                      {isPlatformSelected && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-kolia-green">{selectedCount}/{platformCompetitors.length}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); toggleSelectAllForPlatform(platform, !allSelected); }}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleSelectAllForPlatform(platform, !allSelected); } }}
                            className="cursor-pointer rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                          >
                            {allSelected ? "Bỏ hết" : "Chọn hết"}
                          </span>
                        </div>
                      )}
                    </button>
                    {isExpanded && isPlatformSelected && (
                      <div className="space-y-1 border-t border-kolia-line px-4 py-3">
                        {platformCompetitors.length === 0 && (
                          <p className="py-2 text-xs text-slate-400">Chưa có đối thủ nào cho nền tảng này.</p>
                        )}
                        {platformCompetitors.map((c) => {
                          const checked = selectedCompetitorIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCompetitor(c.id)}
                                className="h-4 w-4 rounded border-slate-300 text-kolia-green focus:ring-kolia-green"
                              />
                              <span className="text-sm font-medium text-slate-800">{c.name}</span>
                              <span className="ml-auto text-xs text-slate-400">{c.source === "trong_nuoc" ? "🇻🇳" : "🌍"}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── Progress bar + Log ──────────────────────────────────── */}
        {(syncing || progress > 0 || syncResult) && (
          <div className="border-t border-kolia-line bg-slate-50 px-6 py-4">
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    progress === 100 ? "bg-kolia-green" : "bg-kolia-green animate-pulse"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="min-w-[3rem] text-right text-xs font-bold text-kolia-ink">{progress}%</span>
            </div>

            {/* Live log */}
            <div className="mt-3 max-h-[160px] overflow-y-auto rounded-lg border border-kolia-line bg-white p-3 font-mono text-xs leading-6">
              {logs.length === 0 && syncing && (
                <p className="text-slate-400 italic">Đang khởi tạo...</p>
              )}
              {logs.map((log) => (
                <p key={log.id} className="text-slate-700">
                  <span className="text-slate-400">[{log.time}]</span> {log.message}
                </p>
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Result / Actions */}
            {syncResult && !syncing && (
              <p className={cn("mt-3 rounded px-3 py-2 text-sm font-semibold", syncResult.type === "success" ? "bg-kolia-mint text-kolia-green" : "bg-red-50 text-red-700")}>
                {syncResult.message}
              </p>
            )}
          </div>
        )}

        {/* ── Queue waiting banner ─────────────────────────────── */}
        {serverStatus?.state === "running" && (
          <div className="flex items-center gap-2 border-t border-kolia-line px-6 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 w-full">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-amber-600" />
              <span>
                <strong>Đang chờ hàng đợi server...</strong>{" "}
                Server đang xử lý crawler khác
                {serverStatus.target ? ` (${serverStatus.target})` : ""}.
                {serverStatus.elapsed_seconds ? ` Đã chạy ${serverStatus.elapsed_seconds}s.` : ""}
              </span>
            </div>
          </div>
        )}

        {/* ── Action buttons ──────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 border-t border-kolia-line px-6 py-4">
          {syncing ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang đồng bộ... (click để ẩn)
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-kolia-line px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSync}
                disabled={selectedPlatforms.length === 0 || selectedCompetitorIds.length === 0}
                className="inline-flex items-center gap-2 rounded bg-kolia-green px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <Database className="h-4 w-4" />
                Bắt đầu đồng bộ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
