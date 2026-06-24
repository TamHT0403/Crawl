"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BarChart3,
  Calendar,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  MessagesSquare,
  Music2,
  Sparkles,
  Trash2,
  X,
  Youtube,
} from "lucide-react";
import type { ContentStatus, Platform } from "@/lib/types";

type ContentItem = {
  id: string;
  platform: string;
  contentType: string;
  title: string;
  script: string;
  thumbnailIdea?: string;
  cta?: string;
  toneOfVoice: string;
  mainTopic: string;
  status: string;
  createdAt: string;
};

const platformIcon: Record<string, typeof Youtube> = {
  youtube: Youtube,
  tiktok: Music2,
  facebook: MessagesSquare,
};

const platformColors: Record<string, string> = {
  youtube: "text-red-500",
  tiktok: "text-pink-400",
  facebook: "text-blue-500",
};

const statusBadge: Record<string, { label: string; className: string }> = {
  draft: { label: "Bản nháp", className: "bg-slate-100 text-slate-600" },
  approved: { label: "Đã duyệt", className: "bg-green-100 text-green-700" },
  scheduled: { label: "Đã lên lịch", className: "bg-blue-100 text-blue-700" },
  published: { label: "Đã đăng", className: "bg-kolia-mint text-kolia-green" },
  archived: { label: "Lưu trữ", className: "bg-kolia-amber text-slate-600" },
};

// ─── Toast ─────────────────────────────────────────────────────────────────

type Toast = { show: boolean; type: "success" | "error"; title: string; message: string };
function ToastBar({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    if (!toast.show) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [toast.show]);

  if (!toast.show) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-5 py-4 shadow-2xl backdrop-blur transition-all ${
      toast.type === "success"
        ? "border-green-200 bg-white/95"
        : "border-red-200 bg-white/95"
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{toast.type === "success" ? "✅" : "❌"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-kolia-ink">{toast.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{toast.message}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ContentLibrary() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>({ show: false, type: "success", title: "", message: "" });
  const [isPending, startTransition] = useTransition();
  const [editingItem, setEditingItem] = useState<{
    id: string;
    title: string;
    script: string;
    thumbnailIdea: string;
    cta: string;
  } | null>(null);

  // ─── Feedback / Optimize ───────────────────────────────────────────────
  const [feedbackState, setFeedbackState] = useState<{
    id: string;
    text: string;
    loading: boolean;
  } | null>(null);

  const [optimizeSteps, setOptimizeSteps] = useState<Array<{
    step: number;
    stepName: string;
    output: string;
    done: boolean;
  }>>([]);

  const OPTIMIZE_STEP_LABELS = [
    "Tải dữ liệu ngữ cảnh & brand voice",
    "Phân tích góp ý",
    "AI tối ưu nội dung",
    "Lưu kết quả",
  ];

  const optimizeWithFeedback = async () => {
    if (!feedbackState || !feedbackState.text.trim()) return;
    setFeedbackState((prev) => prev ? { ...prev, loading: true } : null);
    setOptimizeSteps(OPTIMIZE_STEP_LABELS.map((name, i) => ({ step: i, stepName: name, output: "", done: false })));

    try {
      const res = await fetch("/api/content/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ contentId: feedbackState.id, feedback: feedbackState.text }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let eventType = "", eventData = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) eventData = line.slice(6);
            else if (line === "" && eventType && eventData) {
              const parsed = JSON.parse(eventData);
              if (eventType === "step") {
                setOptimizeSteps((prev) =>
                  prev.map((s) =>
                    s.step === parsed.step
                      ? { ...s, output: parsed.output, done: parsed.output.includes("✅") || parsed.output.includes("Hoàn tất") }
                      : s
                  )
                );
              } else if (eventType === "complete") {
                setToast({ show: true, type: "success", title: "✅ Đã tối ưu!", message: "Nội dung đã được cập nhật theo góp ý." });
                setOptimizeSteps((prev) => prev.map((s) => ({ ...s, done: true })));
                setFeedbackState(null);
                fetchItems();
                return;
              } else if (eventType === "error") {
                setToast({ show: true, type: "error", title: "Lỗi", message: parsed.error || "Không thể tối ưu" });
                setFeedbackState(null);
                setOptimizeSteps([]);
                fetchItems();
                return;
              }
            }
          }
        }
      }
    } catch {
      setToast({ show: true, type: "error", title: "Lỗi", message: "Không thể kết nối đến server." });
    }
    setFeedbackState(null);
    setOptimizeSteps([]);
    fetchItems();
  };

  const fetchItems = () => {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (filterPlatform !== "all") params.set("platform", filterPlatform);
      if (filterStatus !== "all") params.set("status", filterStatus);
      params.set("limit", "100");

      const response = await fetch(`/api/content?${params}`);
      const data = await response.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    });
  };

  useEffect(() => {
    fetchItems();
  }, [filterPlatform, filterStatus]);

  const updateStatus = (id: string, status: ContentStatus) => {
    startTransition(async () => {
      await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      fetchItems();
    });
  };

  const deleteItem = (id: string) => {
    startTransition(async () => {
      await fetch(`/api/content?id=${id}`, { method: "DELETE" });
      fetchItems();
    });
  };

  const startEdit = (item: ContentItem) => {
    setEditingItem({
      id: item.id,
      title: item.title,
      script: item.script,
      thumbnailIdea: item.thumbnailIdea ?? "",
      cta: item.cta ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingItem(null);
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    const { id, title, script, thumbnailIdea, cta } = editingItem;
    startTransition(async () => {
      await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, editField: "title", editValue: title }),
      });
      await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, editField: "script", editValue: script }),
      });
      await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, editField: "thumbnailIdea", editValue: thumbnailIdea }),
      });
      await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, editField: "cta", editValue: cta }),
      });
      setEditingItem(null);
      setToast({ show: true, type: "success", title: "✅ Đã lưu!", message: "Nội dung đã được cập nhật." });
      fetchItems();
    });
  };

  const updateStatusWithSchedule = (id: string, status: string, scheduledAt: string) => {
    startTransition(async () => {
      await fetch("/api/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, scheduledAt }),
      });
      fetchItems();
    });
  };

  const predictScore = (id: string) => {
    startTransition(async () => {
      const response = await fetch("/api/content/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: id }),
      });
      const data = await response.json();
      if (data.predictedViews !== undefined) {
        setToast({
          show: true,
          type: "success",
          title: "📊 Dự đoán hiệu suất",
          message: [
            `👁️ Views dự kiến: ${data.predictedViews.toLocaleString()}`,
            `📈 Engagement: ${(data.predictedEngagement * 100).toFixed(1)}%`,
            `🔥 Viral probability: ${(data.viralityProbability * 100).toFixed(0)}%`,
            `⏰ Giờ đăng tốt nhất: ${data.bestPostingTime}`,
          ].join("\n"),
        });
      } else {
        setToast({ show: true, type: "error", title: "Lỗi", message: data.error || "Không thể dự đoán" });
      }
      fetchItems();
    });
  };

  const [publishDialog, setPublishDialog] = useState<{
    item: ContentItem;
    file: File | null;
    title: string;
    description: string;
    privacy: "public" | "unlisted" | "private";
    scheduledAt: string;
    step: "select" | "uploading" | "done";
    progress: number;
  } | null>(null);

  /** Tạo mô tả YouTube chuẩn SEO từ script — bỏ toàn bộ production marker */
  const generateYoutubeDescription = (item: ContentItem): string => {
    const lines = item.script.split("\n");

    // 1. Trích timestamp chapters: [TIMESTAMP HH:MM-HH:MM] + dòng text đầu tiên sau đó
    const chapters: { time: string; text: string }[] = [];
    const timestampRegex = /\[TIMESTAMP\s*(\d{1,2}:\d{2})-?\d{0,2}:?\d{0,2}\]/i;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(timestampRegex);
      if (match) {
        const time = match[1]; // "00:00"
        // Tìm dòng text có nghĩa đầu tiên phía sau
        let text = "";
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const t = lines[j].trim();
          if (
            t &&
            !/^\[/.test(t) &&       // bỏ [VISUAL], [B-ROLL], ...
            !/^\d{1,2}:\d{2}/.test(t) // bỏ timestamp còn sót
          ) {
            text = t.replace(/^[-–—\s]+/, "").slice(0, 80);
            break;
          }
        }
        if (text) chapters.push({ time, text });
      }
    }

    // 2. Lấy intro: 2-3 dòng text có nghĩa đầu tiên (bỏ production marker)
    const introLines: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (
        t &&
        !/^\[/.test(t) &&
        !/^\d{1,2}:\d{2}/.test(t) &&
        !/^---/.test(t) &&
        !/^PH[ẤA]N\s+\d/i.test(t)
      ) {
        introLines.push(t);
        if (introLines.length >= 3) break;
      }
    }
    const intro = introLines.join("\n\n").slice(0, 500);

    // 3. Hashtags dựa trên chủ đề
    const topicTags: Record<string, string[]> = {
      bitcoin: ["#Bitcoin", "#BTC", "#Crypto"],
      crypto: ["#Bitcoin", "#Ethereum", "#Crypto"],
      ethereum: ["#Ethereum", "#ETH", "#Crypto"],
      vang: ["#Vàng", "#Gold", "#DauTu"],
      gold: ["#Gold", "#XAU", "#Investment"],
      chungkhoan: ["#ChungKhoan", "#StockMarket", "#DauTu"],
      "bất động sản": ["#BatDongSan", "#RealEstate", "#DauTu"],
    };
    const topic = item.mainTopic.toLowerCase();
    const hashtags =
      Object.entries(topicTags).find(([key]) => topic.includes(key))?.[1] ?? ["#DauTu", "#TaiChinh"];

    // 4. Ghép description
    const parts: string[] = [intro];

    if (chapters.length > 0) {
      parts.push("⏱ Timestamps:");
      parts.push(chapters.map((ch) => `${ch.time} ${ch.text}`).join("\n"));
    }

    parts.push(
      "⚠️ Nội dung chỉ mang tính giáo dục, không phải khuyến nghị đầu tư. " +
        "Thị trường tài chính luôn có rủi ro. Hãy tự nghiên cứu và cân nhắc khẩu vị rủi ro cá nhân."
    );

    parts.push(hashtags.join(" "));

    return parts.join("\n\n").slice(0, 5000);
  };

  const openPublishDialog = (item: ContentItem) => {
    setPublishDialog({
      item,
      file: null,
      title: item.title,
      description: generateYoutubeDescription(item),
      privacy: "unlisted",
      scheduledAt: "",
      step: "select",
      progress: 0,
    });
  };

  const doUpload = async () => {
    if (!publishDialog?.file) return;
    const d = publishDialog;
    setPublishDialog({ ...d, step: "uploading", progress: 0 });

    const formData = new FormData();
    formData.append("video", d.file as Blob);
    formData.append("contentId", d.item.id);
    formData.append("title", d.title);
    formData.append("description", d.description);
    formData.append("privacyStatus", d.privacy);
    if (d.scheduledAt) formData.append("scheduledAt", d.scheduledAt);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setPublishDialog(prev => prev ? { ...prev, progress: Math.round((e.loaded / e.total) * 100) } : null);
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 200 && data.ok) {
          setPublishDialog(null);
          setToast({ show: true, type: "success", title: "🎬 Đã đăng lên YouTube!", message: data.message });
        } else {
          setPublishDialog(null);
          setToast({ show: true, type: "error", title: "Lỗi", message: data.error || "Upload thất bại" });
        }
      } catch {
        setPublishDialog(null);
        setToast({ show: true, type: "error", title: "Lỗi", message: "Không thể xử lý phản hồi" });
      }
      // Refresh list sau 500ms để DB kịp update
      setTimeout(fetchItems, 500);
    };
    xhr.onerror = () => {
      setPublishDialog(null);
      setToast({ show: true, type: "error", title: "Lỗi kết nối", message: "Upload thất bại" });
      setTimeout(fetchItems, 500);
    };
    xhr.open("POST", "/api/youtube/upload");
    xhr.send(formData);
  };

  const publishToYouTube = (item: ContentItem) => {
    const scheduledAt = (document.getElementById(`schedule-${item.id}`) as HTMLInputElement)?.value || undefined;
    const privacy = scheduledAt ? "private" : "unlisted";

    startTransition(async () => {
      const response = await fetch("/api/youtube/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: item.id,
          title: item.title,
          description: item.script.slice(0, 5000),
          privacyStatus: privacy,
          scheduledAt,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        const scriptText = [
          `📌 ${data.title}`,
          "",
          data.script,
          "",
          "---",
          "📝 Kịch bản được tạo bởi Kolia AI Content Studio",
        ].join("\n");
        await navigator.clipboard.writeText(scriptText);
        setToast({ show: true, type: "success", title: "✅ Script đã copy!", message: "Mở YouTube Studio → paste script → upload video" });
        window.open(data.url, "_blank");
        fetchItems();
      } else {
        setToast({ show: true, type: "error", title: "Lỗi đăng bài", message: data.error || "Không thể đăng lên YouTube" });
      }
    });
  };

  const publishToSocial = (item: ContentItem, platform: "facebook" | "tiktok") => {
    const scheduledAt = (document.getElementById(`schedule-${item.id}`) as HTMLInputElement)?.value || undefined;
    const label = platform === "facebook" ? "Facebook" : "TikTok";

    startTransition(async () => {
      const response = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: item.id,
          platform,
          title: item.title,
          description: item.script.slice(0, 5000),
          scheduledAt,
        }),
      });
      const data = await response.json();
      if (data.ok) {
        alert(data.message);
        fetchItems();
      } else {
        alert(data.message || `❌ Không thể đăng lên ${label}`);
      }
    });
  };

  const copyScript = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded border border-kolia-line bg-white p-4 shadow-sm">
        <select
          value={filterPlatform}
          onChange={(e) => setFilterPlatform(e.target.value)}
          className="rounded border border-kolia-line px-3 py-2 text-sm"
        >
          <option value="all">📱 Tất cả nền tảng</option>
          <option value="youtube">▶️ YouTube</option>
          <option value="tiktok">🎵 TikTok</option>
          <option value="facebook">💬 Facebook</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-kolia-line px-3 py-2 text-sm"
        >
          <option value="all">📋 Tất cả trạng thái</option>
          <option value="draft">📝 Bản nháp</option>
          <option value="approved">✅ Đã duyệt</option>
          <option value="scheduled">📅 Đã lên lịch</option>
          <option value="published">🚀 Đã đăng</option>
          <option value="archived">🗄️ Lưu trữ</option>
        </select>
        <div className="ml-auto text-sm text-slate-500">
          {total} nội dung
        </div>
      </div>

      {/* List */}
      {isPending ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-kolia-green" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded border border-kolia-line bg-white p-12 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-lg font-semibold text-slate-500">Chưa có nội dung nào</p>
          <p className="mt-2 text-sm text-slate-400">
            Chạy đồng bộ dữ liệu để AI tự động tạo kịch bản YouTube, TikTok và Facebook.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = platformIcon[item.platform] ?? FileText;
            const color = platformColors[item.platform] ?? "text-slate-500";
            const badge = statusBadge[item.status] ?? statusBadge.draft;
            const expanded = expandedId === item.id;

            return (
              <div
                key={item.id}
                className="rounded border border-kolia-line bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <Icon className={`h-5 w-5 shrink-0 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-kolia-ink">{item.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {item.mainTopic} · {item.contentType} · {item.toneOfVoice}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleDateString("vi-VN")}
                  </span>
                </button>

                {/* Expanded Detail */}
                {expanded && (
                  <div className="border-t border-kolia-line px-5 py-4">
                    {editingItem?.id === item.id ? (
                      <>
                        {/* Title */}
                        <div className="mb-3">
                          <label className="text-xs font-semibold text-slate-500">Tiêu đề</label>
                          <input
                            value={editingItem.title}
                            onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                            className="mt-1 w-full rounded border border-kolia-line px-3 py-2 text-sm"
                          />
                        </div>
                        {/* Script */}
                        <div className="mb-3">
                          <label className="text-xs font-semibold text-slate-500">Kịch bản</label>
                          <textarea
                            value={editingItem.script}
                            onChange={(e) => setEditingItem({ ...editingItem, script: e.target.value })}
                            rows={12}
                            className="mt-1 w-full rounded border border-kolia-line px-3 py-2 font-mono text-sm leading-6"
                          />
                        </div>
                        {/* Thumbnail Idea */}
                        <div className="mb-3">
                          <label className="text-xs font-semibold text-slate-500">🖼️ Ý tưởng thumbnail</label>
                          <textarea
                            value={editingItem.thumbnailIdea}
                            onChange={(e) => setEditingItem({ ...editingItem, thumbnailIdea: e.target.value })}
                            rows={3}
                            className="mt-1 w-full rounded border border-kolia-line px-3 py-2 text-sm"
                          />
                        </div>
                        {/* CTA */}
                        <div className="mb-3">
                          <label className="text-xs font-semibold text-slate-500">🎯 CTA</label>
                          <input
                            value={editingItem.cta}
                            onChange={(e) => setEditingItem({ ...editingItem, cta: e.target.value })}
                            className="mt-1 w-full rounded border border-kolia-line px-3 py-2 text-sm"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-700">
                          {item.script}
                        </div>

                        {item.thumbnailIdea && (
                          <div className="mt-3 rounded bg-kolia-amber p-3 text-sm leading-6 text-slate-700">
                            <strong>🖼️ Ý tưởng thumbnail:</strong> {item.thumbnailIdea}
                          </div>
                        )}

                        {item.cta && (
                          <div className="mt-2 rounded bg-kolia-mint p-3 text-sm leading-6 text-slate-700">
                            <strong>🎯 CTA:</strong> {item.cta}
                          </div>
                        )}
                      </>
                    )}

                    {/* Schedule date picker */}
                    {(item.status === "approved" || item.status === "draft") && (
                      <div className="mt-3 flex items-center gap-3">
                        <input
                          type="datetime-local"
                          id={`schedule-${item.id}`}
                          className="rounded border border-kolia-line px-3 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.getElementById(`schedule-${item.id}`) as HTMLInputElement;
                            if (!input?.value) return;
                            updateStatusWithSchedule(item.id, "scheduled", input.value);
                          }}
                          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                          <Calendar className="h-4 w-4" /> Đặt lịch
                        </button>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {item.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(item.id, "approved")}
                          className="flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
                        >
                          <Check className="h-4 w-4" /> Duyệt
                        </button>
                      )}
                      {/* Predict button — luôn hiển thị vì chỉ là dự đoán */}
                      <button
                        type="button"
                        onClick={() => predictScore(item.id)}
                        className="flex items-center gap-1.5 rounded border border-purple-300 px-3 py-1.5 text-sm font-semibold text-purple-600 hover:bg-purple-50"
                      >
                        <BarChart3 className="h-4 w-4" /> Dự đoán hiệu suất
                      </button>
                      {/* YouTube Upload & Publish */}
                      {item.platform === "youtube" && (item.status === "approved" || item.status === "scheduled") && (
                        <button
                          type="button"
                          onClick={() => openPublishDialog(item)}
                          className="flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          <Youtube className="h-4 w-4" /> Upload & Publish
                        </button>
                      )}
                      {/* Facebook Publish button */}
                      {item.platform === "facebook" && (item.status === "approved" || item.status === "scheduled") && (
                        <button
                          type="button"
                          onClick={() => publishToSocial(item, "facebook")}
                          className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                          <MessagesSquare className="h-4 w-4" /> Đăng lên Facebook
                        </button>
                      )}
                      {/* TikTok Publish button */}
                      {item.platform === "tiktok" && (item.status === "approved" || item.status === "scheduled") && (
                        <button
                          type="button"
                          onClick={() => publishToSocial(item, "tiktok")}
                          className="flex items-center gap-1.5 rounded bg-black px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800"
                        >
                          <Music2 className="h-4 w-4" /> Đăng lên TikTok
                        </button>
                      )}
                      {/* Edit / Save / Cancel — chỉ cho draft & approved */}
                      {(item.status === "draft" || item.status === "approved") &&
                        (editingItem?.id === item.id ? (
                          <>
                            <button
                              type="button"
                              onClick={saveEdit}
                              className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                            >
                              <Check className="h-4 w-4" /> Lưu
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <X className="h-4 w-4" /> Huỷ
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            className="flex items-center gap-1.5 rounded border border-kolia-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <FileText className="h-4 w-4" /> Sửa
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => copyScript(item.script)}
                        className="flex items-center gap-1.5 rounded border border-kolia-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <FileText className="h-4 w-4" /> Copy script
                      </button>
                      {item.status === "published" && item.thumbnailIdea && (
                        <a
                          href={item.thumbnailIdea}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded border border-kolia-line px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-4 w-4" /> Xem trên YouTube
                        </a>
                      )}
                      {/* Xoá — chỉ cho draft, approved, archived */}
                      {(item.status === "draft" || item.status === "approved" || item.status === "archived") && (
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          className="flex items-center gap-1.5 rounded border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" /> Xoá
                        </button>
                      )}
                      {/* Góp ý & tối ưu */}
                      <button
                        type="button"
                        onClick={() => setFeedbackState({ id: item.id, text: "", loading: false })}
                        className="flex items-center gap-1.5 rounded border border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-600 hover:bg-amber-50"
                      >
                        <Sparkles className="h-4 w-4" /> Góp ý & Tối ưu
                      </button>
                    </div>

                    {/* Feedback form */}
                    {feedbackState?.id === item.id && (
                      <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-4">
                        <p className="mb-2 text-sm font-semibold text-amber-800">💡 Góp ý để tối ưu nội dung</p>

                        {optimizeSteps.length > 0 ? (
                          /* Step progress */
                          <div className="space-y-3">
                            {optimizeSteps.map((s) => (
                              <div key={s.step} className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
                                  {s.done ? (
                                    <Check className="h-5 w-5 text-green-600" />
                                  ) : s.output && !s.output.includes("✅") ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                                  ) : (
                                    <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-semibold ${s.done ? "text-green-700" : "text-slate-700"}`}>
                                    {s.stepName}
                                  </p>
                                  {s.output && (
                                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{s.output}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* Input form */
                          <>
                            <textarea
                              value={feedbackState.text}
                              onChange={(e) => setFeedbackState({ ...feedbackState, text: e.target.value })}
                              placeholder="Nhập góp ý của bạn, hoặc bấm 'AI phân tích' để AI tự động gợi ý..."
                              rows={4}
                              className="w-full rounded border border-amber-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
                            />

                            {feedbackState.text && (
                              <div className="mt-2 rounded bg-amber-100/50 px-3 py-2 text-xs text-amber-700">
                                <strong>📋 Góp ý hiện tại:</strong> {feedbackState.text.length} ký tự
                              </div>
                            )}

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={optimizeWithFeedback}
                                disabled={!feedbackState.text.trim() || feedbackState.loading}
                                className="flex items-center gap-1.5 rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                <Sparkles className="h-4 w-4" />
                                Tối ưu lại
                              </button>

                              <button
                                type="button"
                                onClick={() => { setFeedbackState(null); setOptimizeSteps([]); }}
                                className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Huỷ
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Publish Dialog */}
      {publishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !publishDialog || publishDialog.step === "uploading" ? null : setPublishDialog(null)}>
          <div className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-kolia-line px-6 py-4">
              <h2 className="text-lg font-bold text-kolia-ink">🎬 Đăng lên YouTube</h2>
              {publishDialog.step !== "uploading" && (
                <button onClick={() => setPublishDialog(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              )}
            </div>

            {publishDialog.step === "select" && (
              <div className="flex-1 overflow-y-auto space-y-5 p-6">
                {/* Video file */}
                <div>
                  <label className="text-sm font-semibold text-kolia-ink">File video</label>
                  {publishDialog.file ? (
                    <div className="mt-1.5 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                      <div className="flex items-center gap-3">
                        <Youtube className="h-5 w-5 text-red-500" />
                        <div>
                          <p className="text-sm font-semibold text-kolia-ink">{publishDialog.file.name}</p>
                          <p className="text-xs text-slate-500">{(publishDialog.file.size / 1024 / 1024).toFixed(1)}MB</p>
                        </div>
                      </div>
                      <button onClick={() => setPublishDialog({ ...publishDialog, file: null })} className="text-xs text-red-600 hover:text-red-800">Đổi file</button>
                    </div>
                  ) : (
                    <label className="mt-1.5 flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-kolia-line p-6 hover:border-red-300 hover:bg-red-50/30">
                      <Youtube className="h-8 w-8 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-500">Nhấn để chọn file video</p>
                      <p className="text-xs text-slate-400">MP4, AVI, MOV, MKV, WebM (tối đa 256MB)</p>
                      <input
                        type="file"
                        accept="video/mp4,video/avi,video/mov,video/mkv,video/webm"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) setPublishDialog({ ...publishDialog, file: f });
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="text-sm font-semibold text-kolia-ink">Tiêu đề</label>
                  <input
                    value={publishDialog.title}
                    onChange={e => setPublishDialog({ ...publishDialog, title: e.target.value })}
                    className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    maxLength={100}
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">{publishDialog.title.length}/100</p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-semibold text-kolia-ink">Mô tả</label>
                  <textarea
                    value={publishDialog.description}
                    onChange={e => setPublishDialog({ ...publishDialog, description: e.target.value })}
                    rows={8}
                    className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    maxLength={5000}
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">{publishDialog.description.length}/5000</p>
                </div>

                {/* Options */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-kolia-ink">Chế độ hiển thị</label>
                    <select
                      value={publishDialog.privacy}
                      onChange={e => setPublishDialog({ ...publishDialog, privacy: e.target.value as any })}
                      className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm"
                    >
                      <option value="public">Công khai (Public)</option>
                      <option value="unlisted">Không công khai (Unlisted)</option>
                      <option value="private">Riêng tư (Private)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-kolia-ink">Hẹn giờ (tuỳ chọn)</label>
                    <input
                      type="datetime-local"
                      value={publishDialog.scheduledAt}
                      onChange={e => setPublishDialog({ ...publishDialog, scheduledAt: e.target.value })}
                      className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {publishDialog.step === "uploading" && (
              <div className="flex flex-col items-center gap-4 px-6 py-16">
                <Loader2 className="h-10 w-10 animate-spin text-red-600" />
                <p className="text-base font-semibold text-kolia-ink">Đang upload video lên YouTube...</p>
                <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-red-600 transition-all duration-300" style={{ width: `${publishDialog.progress}%` }} />
                </div>
                <p className="text-sm text-slate-500">{publishDialog.progress}%</p>
              </div>
            )}

            {/* Footer */}
            {publishDialog.step === "select" && (
              <div className="flex items-center justify-between border-t border-kolia-line px-6 py-4">
                <button onClick={() => setPublishDialog(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                  Huỷ
                </button>
                <button
                  onClick={doUpload}
                  disabled={!publishDialog.file}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  <Youtube className="h-4 w-4" /> Upload & Đăng lên YouTube
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ToastBar toast={toast} onClose={() => setToast({ ...toast, show: false })} />
    </div>
  );
}
