"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { platformLabels, sourceLabels } from "@/lib/constants";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";

type CompetitorSummary = {
  competitor: {
    id: string;
    name: string;
    platform: string;
    source: string;
    channelUrl: string;
    category: string;
  };
  postCount: number;
  avgEngagement: number;
  avgVirality: number;
  totalViews: number;
  totalInteractions: number;
  topPillar: string;
  latestPublishedAt: string | null;
};

type SortMetric = "postCount" | "totalViews" | "totalInteractions" | "avgEngagement" | "avgVirality";
type SortDirection = "desc" | "asc";

const sortMetricLabels: Record<SortMetric, string> = {
  postCount: "Số bài/video",
  totalViews: "Tổng lượt xem",
  totalInteractions: "Tổng tương tác",
  avgEngagement: "Tỷ lệ tương tác bình quân",
  avgVirality: "Điểm lan tỏa"
};

const platformFilterLabels = [
  { value: "all", label: "Tất cả" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" }
];

const PAGE_SIZE = 10;

export function CompetitorTable({ summaries, lockPlatform }: { summaries: CompetitorSummary[]; lockPlatform?: string }) {
  const [platformFilter, setPlatformFilter] = useState(lockPlatform ?? "all");
  const [competitorQuery, setCompetitorQuery] = useState("");
  const [sortMetric, setSortMetric] = useState<SortMetric>("avgEngagement");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const competitorOptions = useMemo(
    () =>
      summaries
        .filter((item) => (lockPlatform ? item.competitor.platform === lockPlatform : platformFilter === "all" || item.competitor.platform === platformFilter))
        .map((item) => item.competitor.name)
        .filter((name, index, self) => self.indexOf(name) === index) // deduplicate
        .sort((a, b) => a.localeCompare(b, "vi")),
    [platformFilter, summaries]
  );

  const filteredSummaries = useMemo(() => {
    const query = competitorQuery.trim().toLowerCase();
    return summaries
      .filter((item) => (lockPlatform ? item.competitor.platform === lockPlatform : platformFilter === "all" || item.competitor.platform === platformFilter))
      .filter((item) => !query || item.competitor.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const left = a[sortMetric] ?? 0;
        const right = b[sortMetric] ?? 0;
        return sortDirection === "desc" ? right - left : left - right;
      });
  }, [competitorQuery, platformFilter, sortDirection, sortMetric, summaries]);

  const totalPages = Math.max(1, Math.ceil(filteredSummaries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedSummaries = filteredSummaries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const goToPage = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [competitorQuery, platformFilter, sortMetric, sortDirection]);

  return (
    <div className="overflow-hidden rounded border border-kolia-line bg-white shadow-sm">
      <div className="border-b border-kolia-line px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-kolia-ink">Tổng bài viết và tương tác theo đối thủ</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              So sánh sản lượng nội dung, quy mô tiếp cận và chất lượng tương tác để xác định đối thủ cần theo dõi sát hơn.
            </p>
          </div>
          {lockPlatform ? (
            <div className="rounded bg-kolia-ink px-3 py-2 text-sm font-bold text-white">
              {platformLabels[lockPlatform as keyof typeof platformLabels]}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {platformFilterLabels.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPlatformFilter(item.value)}
                  className={`rounded px-3 py-2 text-sm font-bold transition ${
                    platformFilter === item.value ? "bg-kolia-ink text-white" : "border border-kolia-line text-slate-600 hover:bg-kolia-mint"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_220px_170px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={competitorQuery}
              onChange={(event) => setCompetitorQuery(event.target.value)}
              list="competitor-options"
              aria-label="Lọc theo tên đối thủ"
              placeholder="Lọc theo tên đối thủ"
              className="h-10 w-full rounded border border-kolia-line bg-white pl-9 pr-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
            />
            <datalist id="competitor-options">
              {competitorOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <select
            value={sortMetric}
            onChange={(event) => setSortMetric(event.target.value as SortMetric)}
            className="h-10 rounded border border-kolia-line bg-white px-3 text-sm font-medium outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
          >
            {Object.entries(sortMetricLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDirection(sortDirection === "desc" ? "asc" : "desc")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded border border-kolia-line bg-white px-3 text-sm font-bold text-kolia-ink hover:bg-kolia-mint"
          >
            {sortDirection === "desc" ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
            {sortDirection === "desc" ? "Cao xuống thấp" : "Thấp lên cao"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlatformFilter("all");
              setCompetitorQuery("");
              setSortMetric("avgEngagement");
              setSortDirection("desc");
            }}
            className="h-10 rounded border border-kolia-line bg-white px-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Đặt lại bộ lọc
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1180px] divide-y divide-kolia-line text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <th className="px-5 py-3">Đối thủ</th>
              <th className="px-5 py-3">Nền tảng</th>
              <th className="px-5 py-3">Nguồn</th>
              <th className="px-5 py-3 text-right">Bài/video</th>
              <th className="px-5 py-3 text-right">Lượt xem</th>
              <th className="px-5 py-3 text-right">Tổng tương tác</th>
              <th className="px-5 py-3 text-right">Tỷ lệ tương tác bình quân</th>
              <th className="px-5 py-3 text-right">Điểm lan tỏa</th>
              <th className="px-5 py-3">Trụ cột nổi bật</th>
              <th className="px-5 py-3">Bài mới nhất</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kolia-line">
            {paginatedSummaries.map((item) => (
              <tr key={item.competitor.id} className="hover:bg-kolia-mint/35">
                <td className="px-5 py-4 font-semibold text-kolia-ink">
                  <a href={item.competitor.channelUrl} target="_blank" rel="noreferrer" className="hover:text-kolia-green">
                    {item.competitor.name}
                  </a>
                </td>
                <td className="px-5 py-4 text-slate-600">{platformLabels[item.competitor.platform as keyof typeof platformLabels]}</td>
                <td className="px-5 py-4 text-slate-600">{sourceLabels[item.competitor.source as keyof typeof sourceLabels]}</td>
                <td className="px-5 py-4 text-right font-semibold">{formatNumber(item.postCount)}</td>
                <td className="px-5 py-4 text-right">{formatNumber(item.totalViews)}</td>
                <td className="px-5 py-4 text-right">{formatNumber(item.totalInteractions)}</td>
                <td className="px-5 py-4 text-right font-semibold text-kolia-green">{formatPercent(item.avgEngagement)}</td>
                <td className="px-5 py-4 text-right font-semibold text-kolia-gold">{item.avgVirality.toFixed(1)}</td>
                <td className="px-5 py-4 text-slate-700">{item.topPillar}</td>
                <td className="px-5 py-4 text-slate-600">{item.latestPublishedAt ? formatDate(item.latestPublishedAt) : "Chưa có"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-kolia-line px-5 py-3">
          <p className="text-xs text-slate-500">
            Hiển thị {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filteredSummaries.length)} của {filteredSummaries.length} đối thủ
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => goToPage(safePage - 1)}
              className="rounded border border-kolia-line px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-kolia-mint disabled:opacity-40 disabled:hover:bg-transparent"
            >
              ← Trước
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-slate-300">…</span>
                  )}
                  <button
                    onClick={() => goToPage(p)}
                    className={`min-w-[32px] rounded px-2 py-1.5 text-sm font-semibold transition ${
                      p === safePage
                        ? "bg-kolia-ink text-white"
                        : "text-slate-600 hover:bg-kolia-mint"
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              disabled={safePage >= totalPages}
              onClick={() => goToPage(safePage + 1)}
              className="rounded border border-kolia-line px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-kolia-mint disabled:opacity-40 disabled:hover:bg-transparent"
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
