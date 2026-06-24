"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ExternalLink, Eye, EyeOff, HelpCircle, Key, Loader2, Save, Trash2, X } from "lucide-react";

type ConfigItem = {
  key: string;
  label: string;
  description: string;
  category: string;
  encrypted: boolean;
  isSecret: boolean;
  value: string | null;
  hasValue: boolean;
  source: "db" | "env" | "unset";
  placeholder: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  google: "🔑 Google / YouTube",
  openai: "🤖 AI Provider (OpenAI / Gemini / Groq...)",
  facebook: "📘 Facebook",
  tiktok: "🎵 TikTok",
  smtp: "📧 SMTP (Email)",
  telegram: "✈️ Telegram",
  general: "⚙️ General",
};

// ─── Hướng dẫn chi tiết cho từng config ─────────────────────────────────────

const CONFIG_HELP: Record<string, { steps: string[]; url?: string; urlLabel?: string }> = {
  google_client_id: {
    steps: [
      "Truy cập https://console.cloud.google.com",
      "Chọn project hoặc tạo mới (Project → New Project)",
      "Vào APIs & Services → Credentials",
      "Nhấn Create Credentials → OAuth client ID",
      "Chọn Web application, thêm Redirect URI",
      "Copy Client ID — dán vào ô bên cạnh",
    ],
    url: "https://console.cloud.google.com/apis/credentials",
    urlLabel: "Google Cloud Console",
  },
  google_client_secret: {
    steps: [
      "Tại credentials vừa tạo, nhấn vào tên OAuth 2.0 Client ID",
      "Nhấn Download JSON hoặc copy Client Secret",
      "Dán Client Secret vào ô bên cạnh (sẽ hiện ••••••••)",
    ],
    url: "https://console.cloud.google.com/apis/credentials",
    urlLabel: "Google Cloud Console",
  },
  google_redirect_uri: {
    steps: [
      "Redirect URI mặc định: http://localhost:3000/api/google/oauth/callback",
      "Nếu deploy production, thay localhost bằng domain thật",
      "Phải thêm URI này trong Google Cloud Console → Credentials → OAuth → Redirect URIs",
    ],
  },
  youtube_api_key: {
    steps: [
      "Vào Google Cloud Console → APIs & Services → Credentials",
      "Nhấn Create Credentials → API Key",
      "Restrict key: chỉ cho YouTube Data API v3",
      "Copy key và dán vào ô bên cạnh",
    ],
    url: "https://console.cloud.google.com/apis/credentials",
    urlLabel: "Google Cloud Console",
  },
  openai_api_key: {
    steps: [
      "Truy cập https://platform.openai.com/api-keys",
      "Nhấn Create new secret key",
      "Đặt tên (VD: kolia-app), copy key ngay lập tức",
      "Dán key vào ô bên cạnh",
    ],
    url: "https://platform.openai.com/api-keys",
    urlLabel: "OpenAI Dashboard",
  },
  openai_model: {
    steps: [
      "Mặc định: gpt-5.5 (hoặc model mới nhất)",
      "Có thể đổi thành: gpt-4o, gpt-4o-mini, gpt-5.5",
      "Tham khảo model list: https://platform.openai.com/docs/models",
    ],
    url: "https://platform.openai.com/docs/models",
    urlLabel: "OpenAI Models",
  },
  openai_base_url: {
    steps: [
      "Để trống nếu dùng API mặc định của OpenAI",
      "Chỉ điền nếu bạn dùng proxy hoặc API trung gian",
      "VD: https://my-proxy.example.com/v1",
    ],
  },

  // ─── Gemini ──────────────────────────────────────────────────────
  gemini_api_key: {
    steps: [
      "Truy cập https://aistudio.google.com/apikey",
      "Nhấn Create API Key (miễn phí, không cần thẻ)",
      "Copy key và dán vào ô bên cạnh",
      "Gemini có free tier với rate limit cao",
    ],
    url: "https://aistudio.google.com/apikey",
    urlLabel: "Google AI Studio",
  },
  gemini_model: {
    steps: [
      "Mặc định: gemini-2.5-flash (nhanh, free)",
      "Các model khác: gemini-2.5-pro, gemini-2.0-flash",
      "Xem danh sách: https://ai.google.dev/gemini-api/docs/models",
    ],
    url: "https://ai.google.dev/gemini-api/docs/models",
    urlLabel: "Gemini Models",
  },

  // ─── Groq ────────────────────────────────────────────────────────
  groq_api_key: {
    steps: [
      "Truy cập https://console.groq.com/keys",
      "Đăng nhập (Google/GitHub), vào API Keys",
      "Nhấn Create API Key, copy và dán vào ô bên cạnh",
      "Groq miễn phí, tốc độ rất nhanh (LPU inference)",
    ],
    url: "https://console.groq.com/keys",
    urlLabel: "Groq Console",
  },
  groq_model: {
    steps: [
      "Mặc định: llama-3.3-70b-versatile",
      "Các model khác: qwen-2.5-32b, mixtral-8x7b-32768",
      "Xem danh sách: https://console.groq.com/docs/models",
    ],
    url: "https://console.groq.com/docs/models",
    urlLabel: "Groq Models",
  },

  // ─── OpenRouter ──────────────────────────────────────────────────
  openrouter_api_key: {
    steps: [
      "Truy cập https://openrouter.ai/keys",
      "Đăng nhập → Keys → Create Key",
      "Copy key và dán vào ô bên cạnh",
      "Dùng 1 key cho nhiều model (OpenAI, Claude, Gemini...)",
    ],
    url: "https://openrouter.ai/keys",
    urlLabel: "OpenRouter Keys",
  },
  openrouter_model: {
    steps: [
      "Mặc định: google/gemini-2.5-flash:free (miễn phí)",
      "Các model free: anthropic/claude-3.5-sonnet:free, meta-llama/llama-3.2-3b-instruct:free",
      "Xem danh sách: https://openrouter.ai/models",
    ],
    url: "https://openrouter.ai/models",
    urlLabel: "OpenRouter Models",
  },

  // ─── HuggingFace ─────────────────────────────────────────────────
  huggingface_api_key: {
    steps: [
      "Truy cập https://huggingface.co/settings/tokens",
      "Đăng nhập → Settings → Access Tokens → New Token",
      "Chọn role read, copy token và dán vào ô bên cạnh",
      "Hàng nghìn model open-source miễn phí",
    ],
    url: "https://huggingface.co/settings/tokens",
    urlLabel: "HuggingFace Tokens",
  },
  huggingface_model: {
    steps: [
      "Mặc định: mistralai/Mistral-7B-Instruct-v0.3",
      "Tìm model: https://huggingface.co/models?pipeline_tag=text-generation&sort=trending",
      "Dùng định dạng: organization/model-name",
    ],
    url: "https://huggingface.co/models",
    urlLabel: "HuggingFace Models",
  },
  fb_email: {
    steps: [
      "Email đăng nhập Facebook cá nhân",
      "Dùng cho Playwright crawl (fallback khi session cookie hết hạn)",
      "Cần bật 2FA nếu dùng email/password",
    ],
  },
  fb_password: {
    steps: [
      "Password đăng nhập Facebook",
      "Khuyến nghị dùng App Password thay vì password chính",
      "Tạo App Password: Facebook → Settings → Security → App Passwords",
    ],
  },
  fb_page_id: {
    steps: [
      "Vào Facebook Page của bạn",
      "URL có dạng: facebook.com/{page-id}",
      "Hoặc vào Page Settings → Page Info → Page ID",
    ],
  },
  fb_page_access_token: {
    steps: [
      "Truy cập https://developers.facebook.com/tools/explorer",
      "Chọn App + Page, lấy token",
      "Vào https://developers.facebook.com/tools/debug để extend token",
      "Dán Page Access Token vào ô bên cạnh",
    ],
    url: "https://developers.facebook.com/tools/explorer",
    urlLabel: "Graph API Explorer",
  },
  tiktok_access_token: {
    steps: [
      "Vào TikTok Developers Portal: https://developers.tiktok.com",
      "Tạo App → Get Access Token",
      "Cần scope: user.info.basic, video.upload, video.publish",
    ],
    url: "https://developers.tiktok.com",
    urlLabel: "TikTok Developers",
  },
  tiktok_open_id: {
    steps: [
      "Open ID được cấp sau khi user authorize app",
      "Thường lấy từ callback OAuth cùng với access token",
    ],
  },
  smtp_host: {
    steps: [
      "Gmail: smtp.gmail.com",
      "Outlook: smtp-mail.outlook.com",
      "SendGrid: smtp.sendgrid.net",
      "Mailgun: smtp.mailgun.org",
    ],
  },
  smtp_port: {
    steps: [
      "587 (TLS) — khuyến nghị",
      "465 (SSL) — nếu 587 không hoạt động",
      "25 — thường bị chặn bởi ISP",
    ],
  },
  smtp_user: {
    steps: [
      "Gmail: email đầy đủ (user@gmail.com)",
      "SendGrid: apikey",
      "Mailgun: postmaster@mg.yourdomain.com",
    ],
  },
  smtp_pass: {
    steps: [
      "Gmail: dùng App Password (không dùng password chính)",
      "Tạo App Password: Google Account → Security → 2-Step Verification → App Passwords",
      "SendGrid/Mailgun: dùng API Key",
    ],
  },
  smtp_from: {
    steps: [
      "Email hiển thị khi người nhận thấy mail",
      "Mặc định: noreply@kolia.app",
      "Nên dùng domain thật để tránh spam",
    ],
  },
  telegram_bot_token: {
    steps: [
      "Mở Telegram, tìm @BotFather",
      "Gửi /newbot → đặt tên → nhận token",
      "Token có dạng: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      "Dán token vào ô bên cạnh",
    ],
    url: "https://t.me/botfather",
    urlLabel: "@BotFather trên Telegram",
  },
};

export function ConfigManager() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [helpKey, setHelpKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadConfigs = () => {
    startTransition(async () => {
      const res = await fetch("/api/config");
      const data = await res.json();
      setConfigs(data.configs ?? []);
    });
  };

  useEffect(() => { loadConfigs(); }, []);

  const saveConfig = (key: string) => {
    startTransition(async () => {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", key, value: editValue }),
      });
      const data = await res.json();
      setMessage({ type: res.ok ? "success" : "error", text: data.message || data.error });
      setEditingKey(null);
      loadConfigs();
    });
  };

  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  const confirmDeleteConfig = (key: string) => setDeleteKey(key);

  const executeDeleteConfig = async () => {
    if (!deleteKey) return;
    startTransition(async () => {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", key: deleteKey }),
      });
      const data = await res.json();
      setMessage({ type: res.ok ? "success" : "error", text: data.message || data.error });
      setDeleteKey(null);
      loadConfigs();
    });
  };

  // Providers map để hiển thị dropdown + lọc
  const AI_PROVIDERS = [
    { id: "openai", label: "OpenAI" },
    { id: "gemini", label: "Google Gemini" },
    { id: "groq", label: "Groq" },
    { id: "openrouter", label: "OpenRouter" },
    { id: "huggingface", label: "HuggingFace" },
  ];
  const providerConfigMap: Record<string, string[]> = {
    openai: ["openai_api_key", "openai_model", "openai_base_url"],
    gemini: ["gemini_api_key", "gemini_model", "gemini_base_url"],
    groq: ["groq_api_key", "groq_model", "groq_base_url"],
    openrouter: ["openrouter_api_key", "openrouter_model", "openrouter_base_url"],
    huggingface: ["huggingface_api_key", "huggingface_model", "huggingface_base_url"],
  };

  const activeAiProvider = configs.find(c => c.key === "ai_provider")?.value || "openai";
  const activeProviderKeys = providerConfigMap[activeAiProvider] || [];

  const grouped = configs.reduce<Record<string, ConfigItem[]>>((acc, c) => {
    const isProviderSpecific = Object.values(providerConfigMap).some(keys => keys.includes(c.key));
    if (isProviderSpecific && !activeProviderKeys.includes(c.key)) return acc;
    acc[c.category] = acc[c.category] ?? [];
    acc[c.category].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {message && (
        <div className={`flex items-center justify-between rounded border px-4 py-3 text-sm ${
          message.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {Object.entries(grouped).map(([category, items]) => (
        <section key={category} className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="font-bold text-kolia-ink">{CATEGORY_LABELS[category] || category}</h2>
          {category === "openai" && (
            <p className="mt-1 text-xs text-slate-400">
              Provider hiện tại: <strong className="text-kolia-ink">{activeAiProvider}</strong>
              &nbsp;— chỉ hiển thị config của provider đang dùng.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {items.map((item) => {
              const isEditing = editingKey === item.key;
              const isVisible = showSecret === item.key;

              return (
                <div key={item.key} className={`rounded border p-4 transition ${
                  item.hasValue ? "border-kolia-line bg-slate-50" : "border-amber-200 bg-amber-50"
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-kolia-ink">{item.label}</h3>
                        {item.hasValue ? (
                          <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                            {item.source === "env" ? "📄 Env" : "✅"}
                          </span>
                        ) : (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">⚠️ Chưa có</span>
                        )}
                        {item.encrypted && <Key className="h-3 w-3 text-slate-400" />}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>

                      {isEditing ? (
                        <div className="mt-2 flex items-center gap-2">
                          {item.key === "ai_provider" ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
                              autoFocus
                            >
                              {AI_PROVIDERS.map(p => (
                                <option key={p.id} value={p.id}>{p.label}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={item.isSecret && !isVisible ? "password" : "text"}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              placeholder={item.placeholder ?? "Nhập giá trị..."}
                              className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
                              autoFocus
                            />
                          )}
                          {item.isSecret && item.key !== "ai_provider" && (
                            <button onClick={() => setShowSecret(isVisible ? null : item.key)} className="text-slate-400 hover:text-slate-600">
                              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          )}
                          <button onClick={() => saveConfig(item.key)} className="rounded bg-kolia-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                            <Save className="h-3 w-3" />
                          </button>
                          <button onClick={() => setEditingKey(null)} className="rounded border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm font-mono text-slate-600">
                          {item.hasValue
                            ? (item.isSecret
                              ? (isVisible ? item.value : "••••••••")
                              : (item.key === "ai_provider"
                                ? (AI_PROVIDERS.find(p => p.id === item.value)?.label || item.value)
                                : item.value))
                            : <span className="text-slate-400 italic">Chưa cấu hình</span>
                            }
                        </p>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex shrink-0 gap-2">
                        {CONFIG_HELP[item.key] && (
                          <button
                            onClick={() => setHelpKey(helpKey === item.key ? null : item.key)}
                            className="rounded border px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50 hover:text-kolia-green"
                            title="Xem hướng dẫn"
                          >
                            <HelpCircle className={`h-3.5 w-3.5 ${helpKey === item.key ? "text-kolia-green" : ""}`} />
                          </button>
                        )}
                        {item.source !== "env" && (
                          <button
                            onClick={() => { setEditingKey(item.key); setEditValue(item.value || ""); }}
                            className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Sửa
                          </button>
                        )}
                        {item.source === "db" && (
                          <button onClick={() => confirmDeleteConfig(item.key)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        {item.isSecret && item.hasValue && (
                          <button onClick={() => setShowSecret(isVisible ? null : item.key)} className="text-slate-400 hover:text-slate-600">
                            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Help guide */}
                  {helpKey === item.key && CONFIG_HELP[item.key] && (
                    <div className="mt-3 rounded-lg border border-kolia-line bg-white p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-kolia-green">📖 Hướng dẫn</p>
                      <ol className="mt-2 space-y-1.5">
                        {CONFIG_HELP[item.key].steps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs leading-5 text-slate-600">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-kolia-mint text-[10px] font-bold text-kolia-green">
                              {i + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                      {CONFIG_HELP[item.key].url && (
                        <a
                          href={CONFIG_HELP[item.key].url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 rounded bg-kolia-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Mở {CONFIG_HELP[item.key].urlLabel ?? "trang hướng dẫn"}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {isPending && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-kolia-green" />
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-kolia-ink">🗑️ Xác nhận xoá</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Xoá config này? Sẽ dùng env fallback nếu có.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button onClick={() => setDeleteKey(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                Giữ lại
              </button>
              <button onClick={executeDeleteConfig} className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-700">
                <Trash2 className="h-4 w-4" /> Xoá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded border border-kolia-line bg-kolia-amber p-4 text-sm leading-6 text-slate-600">
        <strong>🔒 Bảo mật:</strong> Các secrets (API key, token, password) được mã hoá AES-256-GCM trước khi lưu vào DB.
        Chỉ hiển thị khi bạn bấm "Eye" icon. <strong>ENCRYPTION_KEY</strong> và <strong>DATABASE_URL</strong> vẫn phải ở .env.
      </div>
    </div>
  );
}
