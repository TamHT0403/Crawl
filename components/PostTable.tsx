"use client";

import { useMemo, useState } from "react";
import type { PostWithCompetitor } from "@/lib/analytics";
import { formatLabels, platformLabels } from "@/lib/constants";
import { formatDate, formatNumber, formatPercent, getPlatformBadgeClass } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type SortKey = "views" | "likes" | "comments" | "shares" | "engagementRate" | "publishedAt";
type SortDir = "asc" | "desc";

// ─── Props ─────────────────────────────────────────────────────────────────

export function PostTable({
  posts,
  title = "Bài/video nổi bật theo trụ cột nội dung"
}: {
  posts: PostWithCompetitor[];
  title?: string;
}) {
  // ── State ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("engagementRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // ── Search ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return posts;
    const q = search.trim().toLowerCase();
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.caption.toLowerCase().includes(q) ||
        p.competitor.name.toLowerCase().includes(q) ||
        p.contentPillar.toLowerCase().includes(q) ||
        p.mainTopic.toLowerCase().includes(q) ||
        p.hookType.toLowerCase().includes(q) ||
        p.toneOfVoice.toLowerCase().includes(q) ||
        p.promotionType.toLowerCase().includes(q) ||
        (formatLabels[p.format] ?? p.format).toLowerCase().includes(q)
    );
  }, [posts, search]);

  // ── Sort ───────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      return va < vb ? -1 * mul : va > vb ? 1 * mul : 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // ── Paging ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // Reset page khi search thay đổi
  if (page !== safePage && safePage !== page) {
    // handled bên dưới qua effect
  }

  // ── Sort toggle ────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(0);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? (
      <ArrowDown className="ml-1 inline h-3 w-3 text-kolia-green" />
    ) : (
      <ArrowUp className="ml-1 inline h-3 w-3 text-kolia-green" />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded border border-kolia-line bg-white shadow-sm">
      {/* Header + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-kolia-line px-5 py-4">
        <h2 className="text-base font-bold text-kolia-ink">{title}</h2>
        <div className="relative min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Tìm kiếm nội dung..."
            className="h-9 w-full rounded-lg border border-kolia-line bg-white pl-9 pr-3 text-sm outline-none transition focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] divide-y divide-kolia-line text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <th className="px-5 py-3">Bài/video</th>
              <th className="px-5 py-3">Đối thủ</th>
              <th className="px-5 py-3">Phân loại</th>
              <th className="px-5 py-3">Hook/Tone</th>
              <th className="cursor-pointer px-5 py-3 text-right select-none hover:text-slate-700" onClick={() => toggleSort("views")}>
                Lượt xem <SortIcon col="views" />
              </th>
              <th className="cursor-pointer px-5 py-3 text-right select-none hover:text-slate-700" onClick={() => toggleSort("likes")}>
                Like <SortIcon col="likes" />
              </th>
              <th className="cursor-pointer px-5 py-3 text-right select-none hover:text-slate-700" onClick={() => toggleSort("comments")}>
                Comment <SortIcon col="comments" />
              </th>
              <th className="cursor-pointer px-5 py-3 text-right select-none hover:text-slate-700" onClick={() => toggleSort("shares")}>
                Share <SortIcon col="shares" />
              </th>
              <th className="cursor-pointer px-5 py-3 text-right select-none hover:text-slate-700" onClick={() => toggleSort("engagementRate")}>
                Tỷ lệ tương tác <SortIcon col="engagementRate" />
              </th>
              <th className="cursor-pointer px-5 py-3 select-none hover:text-slate-700" onClick={() => toggleSort("publishedAt")}>
                Ngày <SortIcon col="publishedAt" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-kolia-line">
            {paged.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-400">
                  {search ? "Không tìm thấy nội dung phù hợp." : "Chưa có dữ liệu."}
                </td>
              </tr>
            ) : (
              paged.map((post) => (
                <tr key={post.id} className="align-top hover:bg-kolia-mint/35">
                  <td className="max-w-[330px] px-5 py-4">
                    <a
                      href={post.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-kolia-ink hover:text-kolia-green"
                    >
                      {post.title}
                    </a>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{post.caption}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-800">{post.competitor.name}</p>
                    <span
                      className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-bold ring-1 ${getPlatformBadgeClass(post.platform)}`}
                    >
                      {platformLabels[post.platform as keyof typeof platformLabels]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{post.contentPillar}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatLabels[post.format] ?? post.format} · {post.promotionType}
                    </p>
                    <p className="mt-1 text-xs text-kolia-green">{post.mainTopic}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{post.hookType}</p>
                    <p className="mt-1 text-xs text-slate-500">{post.toneOfVoice}</p>
                  </td>
                  <td className="px-5 py-4 text-right">{formatNumber(post.views)}</td>
                  <td className="px-5 py-4 text-right">{formatNumber(post.likes)}</td>
                  <td className="px-5 py-4 text-right">{formatNumber(post.comments)}</td>
                  <td className="px-5 py-4 text-right">{formatNumber(post.shares)}</td>
                  <td className="px-5 py-4 text-right font-bold text-kolia-green">{formatPercent(post.engagementRate)}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(post.publishedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-kolia-line px-5 py-3 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>
            Hiển thị {sorted.length === 0 ? 0 : safePage * pageSize + 1}–
            {Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length} nội dung
          </span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            className="h-7 rounded border border-kolia-line bg-white px-2 text-xs outline-none focus:border-kolia-green"
          >
            <option value={10}>10 / trang</option>
            <option value={20}>20 / trang</option>
            <option value={50}>50 / trang</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="flex h-7 w-7 items-center justify-center rounded border border-kolia-line disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            // Smart page range: center around current page
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i;
            } else {
              const start = Math.max(0, Math.min(safePage - 3, totalPages - 7));
              pageNum = start + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`flex h-7 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-semibold ${
                  pageNum === safePage
                    ? "bg-kolia-green text-white"
                    : "border border-kolia-line hover:bg-slate-100"
                }`}
              >
                {pageNum + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="flex h-7 w-7 items-center justify-center rounded border border-kolia-line disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
