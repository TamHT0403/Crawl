"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, Globe, Plus, Trash2, Webhook, X, Check, Loader2, HelpCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertItem = { id: string; channel: string; config: Record<string, string>; events: string[]; isActive: boolean };
type WebhookItem = { id: string; url: string; events: string[]; isActive: boolean; lastTriggedAt?: string };

const EVENT_OPTIONS = [
  { value: "sync.completed", label: "✅ Đồng bộ hoàn tất" },
  { value: "content.generated", label: "🤖 Content được tạo" },
  { value: "content.published", label: "📤 Content đã đăng" },
  { value: "crawl.error", label: "❌ Lỗi crawl" },
  { value: "performance.alert", label: "📊 Cảnh báo hiệu suất" },
];

// ─── Modal component ───────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-kolia-ink">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Channel config forms ──────────────────────────────────────────────────

type AlertFormProps = {
  channel: string;
  config: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

function SlackForm({ config, onChange }: AlertFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-kolia-ink">Slack Webhook URL</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-kolia-line bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Vào Slack → Apps → Incoming Webhooks → Add → Copy Webhook URL
          </span>
        </div>
        <input
          type="url"
          placeholder="https://hooks.slack.com/services/..."
          value={config.webhookUrl ?? ""}
          onChange={(e) => onChange("webhookUrl", e.target.value)}
          className="mt-2 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green"
        />
      </div>
    </div>
  );
}

function EmailForm({ config, onChange }: AlertFormProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Cấu hình SMTP trong <strong>Settings → Cấu hình & Bảo mật</strong> trước. Sau đó nhập email nhận thông báo.
      </p>
      <div>
        <label className="text-sm font-semibold text-kolia-ink">Email nhận thông báo</label>
        <input
          type="email"
          placeholder="team@company.com"
          value={config.email ?? ""}
          onChange={(e) => onChange("email", e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green"
        />
      </div>
    </div>
  );
}

function TelegramForm({ config, onChange }: AlertFormProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-semibold text-kolia-ink">Telegram Bot Token</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-kolia-line bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Cấu hình trong Settings → Cấu hình & Bảo mật → Telegram</span>
        </div>
      </div>
      <div>
        <label className="text-sm font-semibold text-kolia-ink">Chat ID</label>
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-kolia-line bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Gửi tin nhắn đến bot, rồi truy cập <code className="rounded bg-slate-200 px-1">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> để lấy Chat ID</span>
        </div>
        <input
          type="text"
          placeholder="123456789"
          value={config.chatId ?? ""}
          onChange={(e) => onChange("chatId", e.target.value)}
          className="mt-2 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green"
        />
      </div>
    </div>
  );
}

const CHANNEL_FORM: Record<string, React.ComponentType<AlertFormProps>> = {
  slack: SlackForm,
  email: EmailForm,
  telegram: TelegramForm,
};

const CHANNEL_INFO: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  slack: {
    label: "Slack",
    icon: "💬",
    color: "bg-[#4A154B] text-white",
    desc: "Gửi thông báo đến channel Slack qua Incoming Webhook",
  },
  email: {
    label: "Email",
    icon: "📧",
    color: "bg-blue-100 text-blue-700",
    desc: "Gửi thông báo qua SMTP email",
  },
  telegram: {
    label: "Telegram",
    icon: "✈️",
    color: "bg-sky-100 text-sky-700",
    desc: "Gửi thông báo qua Telegram Bot",
  },
};

// ─── Main AlertPanel ───────────────────────────────────────────────────────

export function AlertPanel() {
  const [teamId, setTeamId] = useState("");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [isPending, startTransition] = useTransition();

  // Alert modal state
  const [alertModal, setAlertModal] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<Record<string, string>>({});
  const [alertSaving, setAlertSaving] = useState(false);

  // Webhook modal state
  const [webhookModal, setWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);

  // Confirm delete state
  const [deleteTarget, setDeleteTarget] = useState<{ type: "alert" | "webhook"; id: string } | null>(null);

  useEffect(() => {
    fetch("/api/team").then(r => r.json()).then(d => {
      if (d.teams?.length > 0) {
        setTeamId(d.teams[0].id);
        loadAlerts(d.teams[0].id);
        loadWebhooks(d.teams[0].id);
      }
    });
  }, []);

  const loadAlerts = (tid: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/alerts?teamId=${tid}`);
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    });
  };

  const loadWebhooks = (tid: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/webhooks?teamId=${tid}`);
      const data = await res.json();
      setWebhooks(data.webhooks ?? []);
    });
  };

  // ── Alert handlers ──

  const openAlertModal = (channel: string) => {
    setAlertModal(channel);
    setAlertConfig({});
  };

  const handleAlertConfigChange = (key: string, value: string) => {
    setAlertConfig((prev) => ({ ...prev, [key]: value }));
  };

  const saveAlert = async () => {
    if (!alertModal) return;
    const channel = alertModal;
    const Form = CHANNEL_FORM[channel];
    if (!Form) return;

    // Validate required fields
    if (channel === "slack" && !alertConfig.webhookUrl?.trim()) return;
    if (channel === "email" && !alertConfig.email?.trim()) return;
    if (channel === "telegram" && !alertConfig.chatId?.trim()) return;

    setAlertSaving(true);
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          teamId,
          channel,
          config: alertConfig,
          events: EVENT_OPTIONS.map(e => e.value),
        }),
      });
      loadAlerts(teamId);
      setAlertModal(null);
    } finally {
      setAlertSaving(false);
    }
  };

  const confirmDeleteAlert = (id: string) => {
    setDeleteTarget({ type: "alert", id });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const endpoint = deleteTarget.type === "alert" ? "/api/alerts" : "/api/webhooks";
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleteTarget.id }),
      });
      if (deleteTarget.type === "alert") loadAlerts(teamId);
      else loadWebhooks(teamId);
      setDeleteTarget(null);
    });
  };

  // ── Webhook handlers ──

  const openWebhookModal = () => {
    setWebhookModal(true);
    setWebhookUrl("");
  };

  const saveWebhook = async () => {
    if (!webhookUrl.trim()) return;
    setWebhookSaving(true);
    try {
      await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          teamId,
          url: webhookUrl,
          events: EVENT_OPTIONS.map(e => e.value),
        }),
      });
      loadWebhooks(teamId);
      setWebhookModal(false);
    } finally {
      setWebhookSaving(false);
    }
  };

  const confirmDeleteWebhook = (id: string) => {
    setDeleteTarget({ type: "webhook", id });
  };

  return (
    <div className="space-y-6">
      {/* Alerts */}
      <section className="rounded-xl border border-kolia-line bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
              <Bell className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kolia-ink">Kênh thông báo</h2>
              <p className="text-xs text-slate-500">Nhận thông báo qua Slack, Email hoặc Telegram</p>
            </div>
          </div>
        </div>

        {/* Add channel buttons */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {Object.entries(CHANNEL_INFO).map(([ch, info]) => (
            <button
              key={ch}
              onClick={() => openAlertModal(ch)}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-kolia-line p-4 transition hover:border-kolia-green hover:bg-kolia-mint/30"
            >
              <span className="text-2xl">{info.icon}</span>
              <span className="text-sm font-bold text-kolia-ink">{info.label}</span>
              <span className="text-center text-[11px] leading-4 text-slate-500">{info.desc}</span>
            </button>
          ))}
        </div>

        {/* Alert list */}
        {alerts.length > 0 && (
          <div className="mt-5 space-y-2">
            {alerts.map((a) => {
              const info = CHANNEL_INFO[a.channel] ?? { label: a.channel, icon: "📡", color: "bg-slate-100 text-slate-700" };
              return (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-kolia-line p-3 transition hover:border-kolia-green/40">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg text-lg shadow-sm">
                      {info.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-kolia-ink">{info.label}</p>
                        {a.isActive && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                            Đang hoạt động
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {Object.values(a.config).join(", ")}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.events.map((ev) => {
                          const opt = EVENT_OPTIONS.find((o) => o.value === ev);
                          return opt ? (
                            <span key={ev} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {opt.label}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => confirmDeleteAlert(a.id)} className="rounded p-1.5 text-red-300 transition hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {alerts.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-kolia-line py-10 text-center">
            <Bell className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-400">Chưa có kênh thông báo nào</p>
            <p className="text-xs text-slate-300">Chọn một kênh bên trên để bắt đầu</p>
          </div>
        )}
      </section>

      {/* Webhooks */}
      <section className="rounded-xl border border-kolia-line bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
              <Globe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kolia-ink">Webhook</h2>
              <p className="text-xs text-slate-500">Tích hợp với Zapier, Make, n8n hoặc hệ thống bên thứ ba</p>
            </div>
          </div>
          <button
            onClick={openWebhookModal}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Thêm Webhook
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Webhook tự động gửi POST request đến URL của bạn khi có sự kiện (sync hoàn tất, content generated, lỗi crawl...).
          Payload mẫu bên dưới.
        </p>

        {webhooks.length > 0 && (
          <div className="mt-4 space-y-2">
            {webhooks.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg border border-kolia-line p-3 transition hover:border-blue-300">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                    <Webhook className="h-5 w-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-kolia-ink">{w.url}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-slate-500">{w.events.length} sự kiện</span>
                      <span className="text-slate-300">·</span>
                      <span className={cn("text-xs font-medium", w.isActive ? "text-green-600" : "text-slate-400")}>
                        {w.isActive ? "🟢 Hoạt động" : "⚪ Tắt"}
                      </span>
                      {w.lastTriggedAt && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs text-slate-500">
                            Gần nhất: {new Date(w.lastTriggedAt).toLocaleDateString("vi-VN")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => confirmDeleteWebhook(w.id)} className="rounded p-1.5 text-red-300 transition hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {webhooks.length === 0 && (
          <div className="mt-4 rounded-lg border border-dashed border-kolia-line py-10 text-center">
            <Globe className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-400">Chưa có webhook nào</p>
            <p className="text-xs text-slate-300">Nhấn "Thêm Webhook" để kết nối với Zapier, Make hoặc n8n</p>
          </div>
        )}
      </section>

      {/* Public API Usage */}
      <section className="rounded-xl border border-kolia-line bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
            <ExternalLink className="h-5 w-5 text-kolia-green" />
          </div>
          <div>
            <h2 className="text-base font-bold text-kolia-ink">Public API Endpoints</h2>
            <p className="text-xs text-slate-500">Tích hợp dữ liệu với hệ thống bên ngoài</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6">
          <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs">
            <p><span className="font-bold text-green-600">GET</span> /api/v1?path=posts&amp;platform=youtube&amp;days=30&amp;limit=10</p>
            <p><span className="font-bold text-green-600">GET</span> /api/v1?path=competitors</p>
            <p><span className="font-bold text-green-600">GET</span> /api/v1?path=content&amp;status=draft</p>
            <p><span className="font-bold text-green-600">GET</span> /api/v1?path=stats</p>
          </div>
          <p className="text-xs text-slate-500">
            ⚡ Xác thực qua header <code className="rounded bg-slate-100 px-1">Authorization: Bearer sk-...</code><br />
            ⚡ Rate limit: 100 requests/phút mỗi API key
          </p>
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-kolia-ink">
              📦 Xem payload webhook mẫu
            </summary>
            <pre className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5">
{`{
  "event": "sync.completed",
  "title": "✅ Đồng bộ hoàn tất",
  "message": "📊 Kết quả đồng bộ...",
  "metadata": { "createdPosts": 12 },
  "timestamp": "2026-06-16T..."
}`}
            </pre>
          </details>
        </div>
      </section>

      {/* ─── ADD ALERT MODAL ─── */}
      <Modal
        open={alertModal !== null}
        onClose={() => setAlertModal(null)}
        title={alertModal ? `➕ Thêm ${CHANNEL_INFO[alertModal]?.label ?? alertModal}` : ""}
      >
        {alertModal && CHANNEL_FORM[alertModal] && (
          <>
            {(() => {
              const Form = CHANNEL_FORM[alertModal];
              return <Form channel={alertModal} config={alertConfig} onChange={handleAlertConfigChange} />;
            })()}

            <div className="mt-6 flex items-center justify-between border-t border-kolia-line pt-4">
              <button
                onClick={() => setAlertModal(null)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Huỷ
              </button>
              <button
                onClick={saveAlert}
                disabled={
                  alertSaving ||
                  (alertModal === "slack" && !alertConfig.webhookUrl?.trim()) ||
                  (alertModal === "email" && !alertConfig.email?.trim()) ||
                  (alertModal === "telegram" && !alertConfig.chatId?.trim())
                }
                className="flex items-center gap-2 rounded-lg bg-kolia-green px-5 py-2 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
              >
                {alertSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {alertSaving ? "Đang lưu..." : "Lưu kênh thông báo"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ─── ADD WEBHOOK MODAL ─── */}
      <Modal
        open={webhookModal}
        onClose={() => setWebhookModal(false)}
        title="🔗 Thêm Webhook"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-kolia-ink">Webhook URL</label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-kolia-line bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <HelpCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Copy URL từ Zapier, Make (Integromat) hoặc n8n</span>
            </div>
            <input
              type="url"
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="mt-2 w-full rounded-lg border border-kolia-line px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-kolia-line pt-4">
          <button
            onClick={() => setWebhookModal(false)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Huỷ
          </button>
          <button
            onClick={saveWebhook}
            disabled={webhookSaving || !webhookUrl.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {webhookSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {webhookSaving ? "Đang lưu..." : "Lưu Webhook"}
          </button>
        </div>
      </Modal>

      {/* ─── CONFIRM DELETE MODAL ─── */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="🗑️ Xác nhận xoá"
      >
        <p className="text-sm leading-6 text-slate-600">
          Bạn có chắc muốn xoá {deleteTarget?.type === "alert" ? "kênh thông báo" : "webhook"} này?
          Hành động này không thể hoàn tác.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-kolia-line pt-4">
          <button
            onClick={() => setDeleteTarget(null)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Giữ lại
          </button>
          <button
            onClick={executeDelete}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Xoá
          </button>
        </div>
      </Modal>
    </div>
  );
}
