"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, FileText, Loader2, Sparkles } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";

type ReportState = {
  executiveSummary: string;
  periodStart: string;
  periodEnd: string;
  platformLabel: string;
  sourceLabel: string;
  totalPostsByCompetitor: Array<{ name: string; posts: number; avgEngagement: number }>;
  topPillars: Array<{ name: string; count: number; avgEngagement: number }>;
  topFormats: Array<{ name: string; avgVirality: number }>;
  topPosts: Array<{
    id: string;
    title: string;
    postUrl: string;
    contentPillar: string;
    hookType: string;
    competitor: { name: string };
  }>;
  contentGaps: string[];
  suggestedContentLines: string[];
  suggestedPrograms: string[];
  legalNote: string;
  markdown: string;
};

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  authUrl: string;
  missingEnv: string[];
};

export function ReportGenerator() {
  const [platform, setPlatform] = useState("all");
  const [days, setDays] = useState("30");
  const [source, setSource] = useState("all");
  const [exportType, setExportType] = useState("google-docs");
  const [report, setReport] = useState<ReportState | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [googleMessage, setGoogleMessage] = useState("");
  const [googleDocUrl, setGoogleDocUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ platform, days, source });
    return params.toString();
  }, [platform, days, source]);

  const generate = () => {
    startTransition(async () => {
      const response = await fetch(`/api/reports/generate?${queryString}`);
      const payload = await response.json();
      setReport(payload);
    });
  };

  const exportHref = `/api/export/${exportType}?${queryString}`;

  useEffect(() => {
    fetch("/api/google/status")
      .then((response) => response.json())
      .then((payload) => setGoogleStatus(payload))
      .catch(() => setGoogleStatus(null));
  }, []);

  const exportGoogleDocs = () => {
    setGoogleMessage("");
    setGoogleDocUrl("");
    startTransition(async () => {
      const response = await fetch(`/api/export/google-docs?${queryString}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setGoogleMessage(payload.setup ?? payload.error ?? "Không thể tạo Google Docs.");
        return;
      }
      setGoogleDocUrl(payload.document.url);
      setGoogleMessage("Đã tạo Google Docs trong Google Drive được cấp quyền.");
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-kolia-mint text-kolia-green">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-kolia-ink">Tạo báo cáo phân tích</h2>
            <p className="text-sm text-slate-500">Chọn phạm vi dữ liệu và tạo báo cáo phục vụ hoạch định nội dung.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Nền tảng</span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="mt-2 h-10 w-full rounded border border-kolia-line px-3 text-sm">
              <option value="all">Tất cả</option>
              <option value="youtube">YouTube</option>
              <option value="tiktok">TikTok</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Khoảng thời gian</span>
            <select value={days} onChange={(event) => setDays(event.target.value)} className="mt-2 h-10 w-full rounded border border-kolia-line px-3 text-sm">
              <option value="7">7 ngày</option>
              <option value="30">30 ngày</option>
              <option value="90">90 ngày</option>
              <option value="3650">Khoảng tùy chỉnh</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Nguồn đối thủ</span>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="mt-2 h-10 w-full rounded border border-kolia-line px-3 text-sm">
              <option value="all">Tất cả</option>
              <option value="trong_nuoc">Trong nước</option>
              <option value="nuoc_ngoai">Nước ngoài</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Định dạng xuất báo cáo</span>
            <select value={exportType} onChange={(event) => setExportType(event.target.value)} className="mt-2 h-10 w-full rounded border border-kolia-line px-3 text-sm">
              <option value="google-docs">Google Docs report</option>
              <option value="markdown">Markdown report</option>
              <option value="json">JSON</option>
              <option value="csv">CSV dữ liệu thô</option>
            </select>
          </label>
          <button
            type="button"
            onClick={generate}
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded bg-kolia-green px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-70"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Tạo báo cáo
          </button>
          {exportType === "google-docs" ? (
            <GoogleDocsExportPanel
              googleStatus={googleStatus}
              googleMessage={googleMessage}
              googleDocUrl={googleDocUrl}
              isPending={isPending}
              onExport={exportGoogleDocs}
            />
          ) : (
            <a href={exportHref} className="inline-flex w-full items-center justify-center rounded border border-kolia-line px-4 py-3 text-sm font-bold text-kolia-ink hover:bg-kolia-mint">
              Xuất báo cáo đã chọn
            </a>
          )}
        </div>
      </section>

      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-kolia-ink">Bản xem trước báo cáo</h2>
            <p className="text-sm text-slate-500">Tóm tắt điều hành, trụ cột nội dung, bài nổi bật và khuyến nghị triển khai cho Kolia.</p>
          </div>
          <ExportButtons queryString={queryString} />
        </div>

        {report ? (
          <div className="mt-6 space-y-6">
            <div className="rounded bg-kolia-mint p-4">
              <p className="text-sm font-bold text-kolia-green">
                {formatDate(report.periodStart)} - {formatDate(report.periodEnd)} · {report.platformLabel} · {report.sourceLabel}
              </p>
              <p className="mt-2 text-base leading-7 text-kolia-ink">{report.executiveSummary}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <PreviewBlock
                title="Tổng bài viết theo từng đối thủ"
                items={report.totalPostsByCompetitor.slice(0, 8).map((item) => `${item.name}: ${formatNumber(item.posts)} bài, tỷ lệ tương tác ${formatPercent(item.avgEngagement)}`)}
              />
              <PreviewBlock
                title="Trụ cột nội dung hiệu quả"
                items={report.topPillars.map((item) => `${item.name}: ${item.count} bài, tỷ lệ tương tác ${formatPercent(item.avgEngagement)}`)}
              />
              <PreviewBlock title="Khoảng trống nội dung cho Kolia" items={report.contentGaps} />
              <PreviewBlock title="Gợi ý chương trình tiếp theo" items={report.suggestedPrograms} />
            </div>
            <div>
              <h3 className="font-bold text-kolia-ink">Bài viết/video nổi bật theo từng trụ cột nội dung</h3>
              <div className="mt-3 space-y-2">
                {report.topPosts.slice(0, 8).map((post) => (
                  <a
                    key={post.id}
                    href={post.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded border border-kolia-line p-3 text-sm hover:bg-kolia-mint"
                  >
                    <span className="font-semibold text-kolia-ink">{post.title}</span>
                    <span className="ml-2 text-slate-500">· {post.competitor.name} · {post.contentPillar} · {post.hookType}</span>
                  </a>
                ))}
              </div>
            </div>
            <p className="rounded border border-kolia-line bg-slate-50 p-3 text-sm font-medium text-slate-600">{report.legalNote}</p>
          </div>
        ) : (
          <div className="mt-6 rounded border border-dashed border-kolia-line p-10 text-center text-slate-500">
            Chưa có báo cáo trong phiên này. Bấm Tạo báo cáo để xem trước và lưu bản phân tích vào SQLite.
          </div>
        )}
      </section>
    </div>
  );
}

function GoogleDocsExportPanel({
  googleStatus,
  googleMessage,
  googleDocUrl,
  isPending,
  onExport
}: {
  googleStatus: GoogleStatus | null;
  googleMessage: string;
  googleDocUrl: string;
  isPending: boolean;
  onExport: () => void;
}) {
  if (!googleStatus) {
    return <div className="rounded border border-kolia-line bg-slate-50 p-3 text-sm text-slate-600">Đang kiểm tra kết nối Google Drive...</div>;
  }

  if (!googleStatus.configured) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        Chưa cấu hình Google OAuth. Hãy bổ sung {googleStatus.missingEnv.join(", ")} và đặt redirect URI là
        {" "}http://localhost:3000/api/google/oauth/callback.
      </div>
    );
  }

  if (!googleStatus.connected) {
    return (
      <a
        href={googleStatus.authUrl}
        className="inline-flex w-full items-center justify-center gap-2 rounded border border-kolia-line px-4 py-3 text-sm font-bold text-kolia-ink hover:bg-kolia-mint"
      >
        <ExternalLink className="h-4 w-4" />
        Kết nối Google Drive
      </a>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onExport}
        disabled={isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded border border-kolia-line px-4 py-3 text-sm font-bold text-kolia-ink hover:bg-kolia-mint disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Tạo Google Docs report
      </button>
      {googleMessage ? <p className="rounded bg-kolia-mint p-3 text-sm font-semibold leading-6 text-kolia-green">{googleMessage}</p> : null}
      {googleDocUrl ? (
        <a href={googleDocUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-kolia-green">
          Mở báo cáo Google Docs
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}

function PreviewBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-kolia-line bg-slate-50 p-4">
      <h3 className="font-bold text-kolia-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-gold" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
