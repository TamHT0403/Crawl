"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, BarChart3, Check, CheckCircle2, Cloud, Eye, EyeOff, ExternalLink,
  Globe, HelpCircle, Key, Link2, Loader2, Monitor, Music2,
  Pencil, Plug, Save, Settings2, Trash2, Users, X, XCircle, Youtube,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { platformLabels, sourceLabels } from "@/lib/constants";
import { TikTokAccountManager } from "@/components/TikTokAccountManager";
import { FacebookAccountManager } from "@/components/FacebookAccountManager";

// ─── Types ─────────────────────────────────────────────────────────────────

type TabId = "api-keys" | "crawl" | "competitors" | "integrations";
type ConfigItem = {
  key: string; label: string; description: string; category: string;
  encrypted: boolean; isSecret: boolean; value: string | null;
  hasValue: boolean; source: "db" | "env" | "unset"; placeholder: string | null;
};

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "crawl", label: "Crawl Provider", icon: Settings2 },
  { id: "competitors", label: "Đối thủ", icon: Users },
  { id: "integrations", label: "Tích hợp", icon: Plug },
];

const CAT_ICON: Record<string, string> = { google: "🔑", openai: "🤖", facebook: "📘", tiktok: "🎵", smtp: "📧", telegram: "✈️", general: "⚙️" };
const CAT_LABEL: Record<string, string> = { google: "Google / YouTube", openai: "AI Provider", facebook: "Facebook", tiktok: "TikTok", smtp: "SMTP", telegram: "Telegram", general: "General" };
const CAT_COLOR: Record<string, string> = { google: "border-blue-200 bg-blue-50/50", openai: "border-emerald-200 bg-emerald-50/50", facebook: "border-indigo-200 bg-indigo-50/50", tiktok: "border-zinc-200 bg-zinc-50/50", smtp: "border-orange-200 bg-orange-50/50", telegram: "border-sky-200 bg-sky-50/50", general: "border-slate-200 bg-slate-50/50" };

const CONFIG_HELP: Record<string, { steps: string[]; url?: string; urlLabel?: string }> = {
  google_client_id: { steps: ["Mở console.cloud.google.com", "APIs & Services → Credentials", "Create Credentials → OAuth client ID"], url: "https://console.cloud.google.com/apis/credentials", urlLabel: "Google Cloud Console" },
  google_client_secret: { steps: ["Tại OAuth 2.0 Client ID vừa tạo", "Copy Client Secret"], url: "https://console.cloud.google.com/apis/credentials", urlLabel: "Google Cloud Console" },
  youtube_api_key: { steps: ["Vào Google Cloud Console", "APIs & Services → Credentials", "Create Credentials → API Key"], url: "https://console.cloud.google.com/apis/credentials", urlLabel: "Google Cloud Console" },
  openai_api_key: { steps: ["Mở platform.openai.com/api-keys", "Create new secret key"], url: "https://platform.openai.com/api-keys", urlLabel: "OpenAI Dashboard" },
  openai_model: { steps: ["Mặc định: gpt-5.5", "Có thể đổi gpt-4o, gpt-4o-mini"], url: "https://platform.openai.com/docs/models", urlLabel: "OpenAI Models" },
  tiktok_access_token: { steps: ["Mở developers.tiktok.com", "Tạo App → Get Access Token"], url: "https://developers.tiktok.com", urlLabel: "TikTok Developers" },
  telegram_bot_token: { steps: ["Mở @BotFather trên Telegram", "/newbot → đặt tên → nhận token"], url: "https://t.me/botfather", urlLabel: "@BotFather" },
  fb_page_access_token: { steps: ["Mở developers.facebook.com/tools/explorer", "Chọn App + Page, lấy token"], url: "https://developers.facebook.com/tools/explorer", urlLabel: "Graph API Explorer" },
};

// Model keys: các config key dạng {provider}_model (openai_model, gemini_model, ...)
const MODEL_KEY_SUFFIX = "_model";
const isModelKey = (key: string) => key.endsWith(MODEL_KEY_SUFFIX) && key !== "ai_provider";
const providerFromModelKey = (key: string) => key.replace(MODEL_KEY_SUFFIX, "");

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═════════════════════════════════════════════════════════════════════════════

export function SettingsPageClient() {
  const [tab, setTab] = useState<TabId>("api-keys");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMsg = useCallback((m: typeof msg) => { setMsg(m); if (m) setTimeout(() => setMsg(null), 4000); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Quản trị hệ thống</p>
          <h1 className="mt-1 text-2xl font-bold text-kolia-ink">Cấu hình & Bảo mật</h1>
          <p className="mt-1 text-sm text-slate-500">API keys, crawl providers, đối thủ và tích hợp.</p>
        </div>
      </div>

      {msg && (
        <div className={cn("flex items-center justify-between rounded-lg border px-4 py-3 text-sm", msg.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700")}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-kolia-line pb-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("inline-flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-sm font-bold transition -mb-px",
                tab === t.id ? "bg-white text-kolia-green shadow-sm border border-b-white border-kolia-line" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent"
              )}>
              <Icon className="h-4 w-4" />{t.label}
            </button>
          );
        })}
      </div>

      {tab === "api-keys" && <ApiKeysTab onMsg={showMsg} />}
      {tab === "crawl" && <CrawlTab onMsg={showMsg} />}
      {tab === "competitors" && <CompetitorsTab onMsg={showMsg} />}
      {tab === "integrations" && <IntegrationsTab onMsg={showMsg} onNavigateTab={setTab} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  API KEYS TAB
// ═════════════════════════════════════════════════════════════════════════════

function ApiKeysTab({ onMsg }: { onMsg: (m: any) => void }) {
  const [items, setItems] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [helpKey, setHelpKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const fetched = useRef(false);

  // ─── Dynamic model loading ────────────────────────────────────────
  const [dynamicModels, setDynamicModels] = useState<Record<string, { id: string; name: string }[]>>({});
  const [modelLoadState, setModelLoadState] = useState<Record<string, "idle" | "loading" | "loaded" | "error">>({});
  const [modelLoadError, setModelLoadError] = useState<Record<string, string>>({});
  const loadingTrack = useRef<Set<string>>(new Set());

  // ─── Quota checking ────────────────────────────────────────────
  const [quotaStatus, setQuotaStatus] = useState<{
    provider: string;
    valid: boolean;
    quotaAvailable: boolean;
    remaining: number | null;
    used: number | null;
    total: number | null;
    unit: string | null;
    exhausted: boolean;
    error?: string;
  } | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const quotaFetched = useRef(false);

  const checkQuota = async (provider: string, forceRefresh = false) => {
    setQuotaLoading(true);
    try {
      const params = new URLSearchParams({ provider });
      if (forceRefresh) params.set("refresh", "true");
      const res = await fetch(`/api/ai/verify?${params.toString()}`);
      const data = await res.json();
      setQuotaStatus(data);
    } catch {
      setQuotaStatus(null);
    } finally {
      setQuotaLoading(false);
    }
  };

  const loadModels = async (provider: string, modelKey: string) => {
    if (loadingTrack.current.has(modelKey)) return;
    loadingTrack.current.add(modelKey);
    setModelLoadState(prev => ({ ...prev, [modelKey]: "loading" }));
    try {
      const res = await fetch(`/api/ai/models?provider=${provider}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Lỗi ${res.status}`);
      }
      const data = await res.json();
      setDynamicModels(prev => ({ ...prev, [modelKey]: data.models || [] }));
      setModelLoadState(prev => ({ ...prev, [modelKey]: "loaded" }));
    } catch (err: any) {
      setModelLoadError(prev => ({ ...prev, [modelKey]: err.message }));
      setModelLoadState(prev => ({ ...prev, [modelKey]: "error" }));
    } finally {
      loadingTrack.current.delete(modelKey);
    }
  };

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch("/api/config").then(r => r.json()).then(d => setItems(d.configs ?? [])).finally(() => setLoading(false));
  }, []);

  // AI provider filter: chỉ hiển thị config của provider đang chọn
  const AI_PROVIDER_KEYS: Record<string, string[]> = {
    openai: ["openai_api_key", "openai_model", "openai_base_url"],
    gemini: ["gemini_api_key", "gemini_model", "gemini_base_url"],
    groq: ["groq_api_key", "groq_model", "groq_base_url"],
    openrouter: ["openrouter_api_key", "openrouter_model", "openrouter_base_url"],
    huggingface: ["huggingface_api_key", "huggingface_model", "huggingface_base_url"],
  };
  const allProviderKeys = Object.values(AI_PROVIDER_KEYS).flat();
  const activeAiProvider = items.find(c => c.key === "ai_provider")?.value || "openai";
  const activeProviderKeys = AI_PROVIDER_KEYS[activeAiProvider] || [];

  const grouped = useMemo(() => {
    const g: Record<string, ConfigItem[]> = {};
    for (const c of items) {
      // Filter: nếu là config riêng của provider không được chọn thì bỏ qua
      if (allProviderKeys.includes(c.key) && !activeProviderKeys.includes(c.key)) continue;
      if (!g[c.category]) g[c.category] = [];
      g[c.category].push(c);
    }
    return g;
  }, [items, activeProviderKeys.join(",")]);

  // Auto-check quota khi load xong config
  useEffect(() => {
    if (!fetched.current || loading) return;
    if (quotaFetched.current) return;
    const hasKey = items.find(c => c.key === `${activeAiProvider}_api_key`)?.hasValue;
    if (!hasKey) return;
    quotaFetched.current = true;
    checkQuota(activeAiProvider);
  }, [loading, items, activeAiProvider]);

  const reload = async () => { const d = await fetch("/api/config").then(r => r.json()); setItems(d.configs ?? []); };

  const save = (key: string) => {
    startTransition(async () => {
      await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", key, value: editVal }) });
      setEditing(null); onMsg({ type: "success", text: "✅ Đã lưu" }); await reload();
      // Refresh quota nếu vừa lưu API key
      if (key.endsWith("_api_key") || key === "ai_provider") {
        const prov = key === "ai_provider" ? editVal : key.replace("_api_key", "");
        checkQuota(prov, true);
      }
    });
  };

  const del = (key: string) => {
    startTransition(async () => {
      await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", key }) });
      onMsg({ type: "success", text: "✅ Đã xoá" }); await reload();
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-kolia-green" /></div>;

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([cat, configs]) => {
        const isCollapsed = collapsed[cat];
        return (
          <section key={cat} className={cn("rounded-xl border overflow-hidden", CAT_COLOR[cat] || "")}>
            {/* Collapsible header */}
            <button type="button" onClick={() => setCollapsed({ ...collapsed, [cat]: !isCollapsed })}
              className="flex w-full items-center gap-2 px-5 py-3 border-b bg-white/80 hover:bg-white transition text-left">
              <span className="text-base">{CAT_ICON[cat] || "⚙️"}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex-1">{CAT_LABEL[cat] || cat}</span>
              {cat === "openai" && activeAiProvider ? (
                <span className="text-[10px] font-semibold text-kolia-green mr-2">({({ openai: "OpenAI", gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter", huggingface: "HuggingFace" } as Record<string, string>)[activeAiProvider] || activeAiProvider})</span>
              ) : null}
              {cat === "openai" && quotaStatus && (
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap mr-1",
                  quotaStatus.exhausted ? "bg-red-100 text-red-700" :
                  quotaStatus.valid ? "bg-green-100 text-green-700" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {quotaLoading ? (
                    <Loader2 className="inline h-3 w-3 animate-spin" />
                  ) : quotaStatus.exhausted ? (
                    "⚠️ Hết quota"
                  ) : quotaStatus.quotaAvailable && quotaStatus.remaining !== null ? (
                    `${quotaStatus.remaining.toFixed(1)} ${quotaStatus.unit}`
                  ) : quotaStatus.valid ? (
                    "✅ Key hợp lệ"
                  ) : (
                    "❌ Key lỗi"
                  )}
                </span>
              )}
              {cat === "openai" && quotaLoading && !quotaStatus && (
                <span className="mr-1">
                  <Loader2 className="inline h-3 w-3 animate-spin text-slate-400" />
                </span>
              )}
              <span className="text-xs text-slate-400">{configs.filter(c => !c.hasValue).length} thiếu</span>
              <svg className={cn("h-4 w-4 text-slate-400 transition-transform", isCollapsed ? "" : "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>

            {/* Body */}
            {!isCollapsed && (
              <div className="bg-white">
                {/* Column headers */}
                <div className="hidden md:grid grid-cols-[1fr_2fr_auto] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-kolia-line/30">
                  <span>Config</span>
                  <span>Giá trị</span>
                  <span>Actions</span>
                </div>

                <div className="divide-y divide-kolia-line/30">
                  {configs.map((item) => {
                    const isEditing = editing === item.key;
                    const isVisible = showSecret === item.key;
                    const showHelp = helpKey === item.key;
                    return (
                      <div key={item.key}>
                        {/* Row: 3 columns on desktop, stacked on mobile */}
                        <div className="grid md:grid-cols-[1fr_2fr_auto] gap-2 md:gap-3 px-5 py-2.5 items-center min-h-[44px]">
                          {/* Col 1: Label + badge */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-semibold text-kolia-ink whitespace-nowrap">{item.label}</span>
                            {item.hasValue ? (
                              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", item.source === "env" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700")}>
                                {item.source === "env" ? "Env" : "DB"}
                              </span>
                            ) : (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 whitespace-nowrap">Thiếu</span>
                            )}
                          </div>

                          {/* Col 2: Value */}
                          <div className="min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                {item.key === "ai_provider" ? (
                                  <select value={editVal} onChange={(e) => setEditVal(e.target.value)}
                                    className="h-8 flex-1 rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint w-full" autoFocus>
                                    <option value="openai">OpenAI</option>
                                    <option value="gemini">Google Gemini</option>
                                    <option value="groq">Groq</option>
                                    <option value="openrouter">OpenRouter</option>
                                    <option value="huggingface">HuggingFace</option>
                                  </select>
                                ) : isModelKey(item.key) ? (
                                  <div className="flex w-full items-center gap-1">
                                    {/* Loading state */}
                                    {modelLoadState[item.key] === "loading" && (
                                      <div className="flex items-center gap-2 flex-1">
                                        <Loader2 className="h-4 w-4 animate-spin text-kolia-green" />
                                        <span className="text-xs text-slate-500">Đang tải danh sách model…</span>
                                      </div>
                                    )}

                                    {/* Error state */}
                                    {modelLoadState[item.key] === "error" && (
                                      <div className="flex flex-col gap-1 flex-1">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            value={editVal}
                                            onChange={(e) => setEditVal(e.target.value)}
                                            placeholder="Nhập tên model…"
                                            className="h-8 flex-1 rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
                                            autoFocus
                                          />
                                          <button
                                            onClick={() => loadModels(providerFromModelKey(item.key), item.key)}
                                            className="shrink-0 rounded-lg border border-kolia-line px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                                            title="Thử lại"
                                          >
                                            🔄
                                          </button>
                                        </div>
                                        <p className="text-[10px] text-red-500 leading-tight">{modelLoadError[item.key]}</p>
                                      </div>
                                    )}

                                    {/* Loaded state: dropdown */}
                                    {modelLoadState[item.key] === "loaded" && dynamicModels[item.key] && (
                                      <div className="flex w-full gap-1">
                                        <select
                                          value={dynamicModels[item.key]?.some(m => m.id === editVal) ? editVal : "__custom__"}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === "__custom__") {
                                              if (dynamicModels[item.key]?.some(m => m.id === editVal)) setEditVal("");
                                            } else {
                                              setEditVal(v);
                                            }
                                          }}
                                          className="h-8 flex-1 rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint w-full"
                                          autoFocus
                                        >
                                          <option value="" disabled>Chọn model…</option>
                                          {dynamicModels[item.key]?.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                          ))}
                                          <option value="__custom__">✏️ Nhập model khác…</option>
                                        </select>
                                        {(!dynamicModels[item.key]?.some(m => m.id === editVal)) && (
                                          <input
                                            type="text"
                                            value={editVal}
                                            onChange={(e) => setEditVal(e.target.value)}
                                            placeholder="Nhập tên model…"
                                            className="h-8 flex-1 rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
                                            autoFocus
                                          />
                                        )}
                                      </div>
                                    )}

                                    {/* Idle state (chưa load): show text input + load button */}
                                    {(!modelLoadState[item.key] || modelLoadState[item.key] === "idle") && (
                                      <div className="flex w-full gap-1">
                                        <input
                                          type="text"
                                          value={editVal}
                                          onChange={(e) => setEditVal(e.target.value)}
                                          placeholder="Nhập tên model…"
                                          className="h-8 flex-1 rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => loadModels(providerFromModelKey(item.key), item.key)}
                                          className="shrink-0 rounded-lg border border-kolia-line px-2.5 py-1 text-xs font-semibold text-kolia-green hover:bg-kolia-mint"
                                          title="Tải danh sách model từ API"
                                        >
                                          📡 Load
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <input type={item.isSecret && !isVisible ? "password" : "text"} value={editVal}
                                    onChange={(e) => setEditVal(e.target.value)}
                                    className="h-8 flex-1 rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint w-full" autoFocus />
                                )}
                              </div>
                            ) : (
                              <p className="text-sm font-mono text-slate-500 truncate">
                                {item.hasValue
                                  ? (item.isSecret
                                    ? (isVisible ? item.value : "••••••••••••")
                                    : (item.key === "ai_provider"
                                      ? (({ openai: "OpenAI", gemini: "Google Gemini", groq: "Groq", openrouter: "OpenRouter", huggingface: "HuggingFace" } as Record<string, string>)[item.value ?? ""] || item.value)
                                      : item.value))
                                  : <span className="italic text-slate-400">Chưa cấu hình</span>}
                              </p>
                            )}
                          </div>

                          {/* Col 3: Action icons */}
                          <div className="flex items-center gap-0.5 shrink-0 justify-end">
                            {isEditing ? (
                              <>
                                {item.isSecret && (
                                  <button onClick={() => setShowSecret(isVisible ? null : item.key)} className="rounded p-1.5 text-slate-400 hover:text-slate-600" title={isVisible ? "Ẩn" : "Hiện"}>
                                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                )}
                                <button onClick={() => save(item.key)} className="rounded p-1.5 text-kolia-green hover:bg-kolia-mint" title="Lưu">
                                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                </button>
                                <button onClick={() => setEditing(null)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100" title="Huỷ">
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                {CONFIG_HELP[item.key] && (
                                  <button onClick={() => setHelpKey(showHelp ? null : item.key)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-kolia-green" title="Hướng dẫn">
                                    <HelpCircle className="h-4 w-4" />
                                  </button>
                                )}
                                {item.key.endsWith("_api_key") && item.hasValue && (
                                  <button
                                    onClick={() => {
                                      const prov = item.key.replace("_api_key", "");
                                      checkQuota(prov, true);
                                    }}
                                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-kolia-green"
                                    title="Kiểm tra API key & quota"
                                  >
                                    {quotaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                {item.isSecret && item.hasValue && (
                                  <button onClick={() => setShowSecret(isVisible ? null : item.key)} className="rounded p-1.5 text-slate-400 hover:text-slate-600" title={isVisible ? "Ẩn" : "Hiện"}>
                                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                )}
                                <button onClick={() => {
                                  setEditing(item.key);
                                  setEditVal(item.value || "");
                                  if (isModelKey(item.key)) loadModels(providerFromModelKey(item.key), item.key);
                                }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-kolia-ink" title="Sửa">
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                {item.source === "db" && (
                                  <button onClick={() => del(item.key)} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Xoá">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Help dropdown */}
                        {showHelp && CONFIG_HELP[item.key] && (
                          <div className="mx-5 mb-3 rounded-lg border bg-slate-50 p-4">
                            <p className="text-xs font-bold uppercase tracking-wide text-kolia-green mb-2">📖 Hướng dẫn</p>
                            <ol className="space-y-1.5">
                              {CONFIG_HELP[item.key].steps.map((s, i) => (
                                <li key={i} className="flex gap-2 text-xs leading-5 text-slate-600">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-kolia-mint text-[10px] font-bold text-kolia-green">{i + 1}</span>{s}
                                </li>
                              ))}
                            </ol>
                            {CONFIG_HELP[item.key].url && (
                              <a href={CONFIG_HELP[item.key].url} target="_blank" rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-1.5 rounded bg-kolia-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                                <ExternalLink className="h-3 w-3" /> Mở {CONFIG_HELP[item.key].urlLabel}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  CRAWL PROVIDER TAB
// ═════════════════════════════════════════════════════════════════════════════

function CrawlTab({ onMsg }: { onMsg: (m: any) => void }) {
  const [platform, setPlatform] = useState<"tiktok" | "facebook" | "youtube">("tiktok");
  const [providers, setProviders] = useState<any>(null);
  const [configItems, setConfigItems] = useState<any[]>([]);
  const [youtubeStatus, setYoutubeStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    Promise.all([
      fetch("/api/settings/providers").then(r => r.json()),
      fetch("/api/config").then(r => r.json()),
    ]).then(([p, c]) => {
      setProviders(p);
      setConfigItems(c.configs ?? []);
      const apiKey = c.configs?.find((x: any) => x.key === "youtube_api_key");
      setYoutubeStatus(apiKey);
    }).finally(() => setLoading(false));
  }, []);

  // Helper: lấy giá trị từ config registry (encrypted)
  const scConfigVal = (key: string) => configItems.find((x: any) => x.key === key);

  const cfg: any = providers?.[platform === "youtube" ? "tiktok" : platform];

  const update = (partial: any) => {
    if (!providers) return;
    const key = platform === "youtube" ? "tiktok" : platform;
    setProviders({ ...providers, [key]: { ...providers[key], ...partial } });
  };

  const save = async () => {
    if (!cfg || platform === "youtube") return;
    startTransition(async () => {
      // Lưu cấu hình provider (activeProvider, playwright, apify) qua API cũ
      await fetch("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          activeProvider: cfg.activeProvider,
          playwright: cfg.playwright,
          apify: cfg.apify,
          // Không gửi socialCrawler.apiUrl + apiKey — chúng được lưu riêng qua config API (mã hoá)
          socialCrawler: {
            ...cfg.socialCrawler,
            apiUrl: undefined,
            apiKey: undefined,
          },
        }),
      });

      // Lưu Social Crawler API URL + Key qua config API (mã hoá AES-256-GCM)
      const scApiUrl = scConfigVal("social_crawler_api_url");
      const scApiKey = scConfigVal("social_crawler_api_key");
      const promises: Promise<any>[] = [];
      if (cfg.socialCrawler.apiUrl !== scApiUrl?.value) {
        promises.push(
          fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save", key: "social_crawler_api_url", value: cfg.socialCrawler.apiUrl }),
          })
        );
      }
      if (cfg.socialCrawler.apiKey !== scApiKey?.value) {
        promises.push(
          fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save", key: "social_crawler_api_key", value: cfg.socialCrawler.apiKey }),
          })
        );
      }
      await Promise.all(promises);

      onMsg({ type: "success", text: `✅ Đã lưu ${platform}` });
    });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-kolia-green" /></div>;

  // ─── YouTube view ────────────────────────────────────────────────
  if (platform === "youtube") {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {(["tiktok", "facebook", "youtube"] as const).map((p) => (
            <button key={p} onClick={() => setPlatform(p)}
              className={cn("inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition capitalize",
                platform === p ? "border-kolia-green bg-kolia-mint text-kolia-green" : "border-kolia-line bg-white text-slate-600")}>
              {p === "tiktok" ? <Music2 className="h-4 w-4" /> : p === "facebook" ? <BarChart3 className="h-4 w-4" /> : <Youtube className="h-4 w-4" />}{p}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-kolia-line bg-white p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600"><Youtube className="h-5 w-5" /></div>
            <div><h3 className="text-sm font-bold text-kolia-ink">YouTube Data API v3</h3><p className="text-xs text-slate-500">YouTube chỉ sử dụng YouTube Data API — không có provider crawl khác</p></div>
          </div>
          <div className="rounded-lg border border-kolia-line bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-kolia-ink">YouTube API Key</p>
                <p className="text-xs text-slate-500 mt-0.5">API Key từ Google Cloud Console</p>
              </div>
              <span className={cn("rounded px-2 py-1 text-xs font-bold", youtubeStatus?.hasValue ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                {youtubeStatus?.hasValue ? "✅ Đã cấu hình" : "⚠️ Chưa có"}
              </span>
            </div>
            <p className="mt-2 text-sm font-mono text-slate-500">
              {youtubeStatus?.hasValue ? "••••••••••••" : <span className="italic">Chưa cấu hình — vào tab API Keys để thêm</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const inp = "mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["tiktok", "facebook", "youtube"] as const).map((p) => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn("inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition capitalize",
              platform === p ? "border-kolia-green bg-kolia-mint text-kolia-green" : "border-kolia-line bg-white text-slate-600")}>
            {p === "tiktok" ? <Music2 className="h-4 w-4" /> : p === "facebook" ? <BarChart3 className="h-4 w-4" /> : <Youtube className="h-4 w-4" />}{p}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        {/* Left: provider config */}
        <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {([
          { id: "apify", title: "Apify Cloud", desc: "Crawl qua Apify Actor", icon: <Cloud className="h-5 w-5" /> },
          { id: "social-crawler" as const, title: "Social Crawler", desc: "Third-party crawl service", icon: <Globe className="h-5 w-5" /> },
          ...(process.env.NODE_ENV !== "production" ? [{ id: "playwright" as const, title: "Playwright", desc: "Crawl local bằng trình duyệt", icon: <Monitor className="h-5 w-5" /> }] : []),
        ]).map((p: any) => (
          <button key={p.id} onClick={() => update({ activeProvider: p.id })}
            className={cn("relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition",
              cfg.activeProvider === p.id ? "border-kolia-green bg-gradient-to-br from-kolia-mint/40 to-white shadow-sm" : "border-kolia-line bg-white hover:border-kolia-green/50")}>
            {cfg.activeProvider === p.id && <span className="absolute right-2.5 top-2.5 rounded-full bg-kolia-green px-2 py-0.5 text-[10px] font-bold text-white">Active</span>}
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", cfg.activeProvider === p.id ? "bg-kolia-green text-white" : "bg-slate-100 text-slate-500")}>{p.icon}</div>
            <p className="text-sm font-bold text-kolia-ink">{p.title}</p>
            <p className="text-xs text-slate-500">{p.desc}</p>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-kolia-line bg-white p-5">
        <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.1em] text-kolia-green">
          {cfg.activeProvider === "playwright" ? "⚙️ Playwright" : cfg.activeProvider === "apify" ? "☁️ Apify" : "🌐 Social Crawler"}
        </h3>
        {cfg.activeProvider === "playwright" && process.env.NODE_ENV === "production" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
            ⛔ Playwright crawl bị vô hiệu trên môi trường production. Vui lòng chọn <strong>Apify Cloud</strong> hoặc <strong>Social Crawler</strong>.
          </div>
        ) : cfg.activeProvider === "playwright" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-kolia-line bg-slate-50 p-4">
              <h4 className="mb-2 text-xs font-bold text-kolia-ink">🔄 GraphQL Interception Crawler</h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                Crawler dùng <strong>Playwright</strong> mở browser, intercept <strong>GraphQL API</strong> responses của Facebook
                để lấy dữ liệu — ổn định hơn DOM parsing rất nhiều vì cấu trúc JSON ít thay đổi hơn DOM.
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                Ported từ Python social-crawler (<code className="bg-slate-100 px-1 rounded">scrape_facebook.py</code>).
                Hỗ trợ <strong>session cookies</strong> từ Facebook Account Manager, giả lập hành vi người dùng,
                scroll tự động, chống phát hiện bot.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Trình duyệt</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">Engine dùng để crawl.</p>
                <select value={cfg.playwright.browserEngine}
                  onChange={(e) => update({ playwright: { ...cfg.playwright, browserEngine: e.target.value } })}
                  className={inp}>
                  {(platform === "tiktok"
                    ? [{ v: "cloakbrowser", l: "CloakBrowser" }, { v: "playwright", l: "Chromium" }, { v: "msedge", l: "Edge" }]
                    : [{ v: "playwright", l: "Chromium" }, { v: "cloakbrowser", l: "CloakBrowser" }, { v: "msedge", l: "Edge" }]
                  ).map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-kolia-line p-3 mt-5">
                <input type="checkbox" checked={cfg.playwright.browserEngine === 'cloakbrowser' ? true : cfg.playwright.headless}
                  onChange={(e) => {
                    if (cfg.playwright.browserEngine === 'cloakbrowser') return;
                    update({ playwright: { ...cfg.playwright, headless: e.target.checked } });
                  }}
                  disabled={cfg.playwright.browserEngine === 'cloakbrowser'}
                  className="h-4 w-4 accent-kolia-green" />
                <span className="text-sm font-semibold text-slate-700">Headless</span>
                {cfg.playwright.browserEngine === 'cloakbrowser' && (
                  <span className="text-[10px] text-slate-400 ml-1">(bắt buộc với CloakBrowser)</span>
                )}
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Scroll min (ms)</span>
                <input type="number" min={400} max={10000}
                  value={cfg.playwright.scrollDelayMin}
                  onChange={(e) => update({ playwright: { ...cfg.playwright, scrollDelayMin: Number(e.target.value) } })}
                  className={inp} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Scroll max (ms)</span>
                <input type="number" min={400} max={10000}
                  value={cfg.playwright.scrollDelayMax}
                  onChange={(e) => update({ playwright: { ...cfg.playwright, scrollDelayMax: Number(e.target.value) } })}
                  className={inp} />
              </label>
            </div>
          </div>
        )}
        {cfg.activeProvider === "apify" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="block col-span-2"><span className="text-xs font-semibold text-slate-600">API Token</span>
              <input type="password" value={cfg.apify.apiToken} onChange={(e) => update({ apify: { ...cfg.apify, apiToken: e.target.value } })} placeholder={cfg.apify.apiToken ? "••••••••" : "apify_api_xxx..."} className={inp} />
            </label>
            <label className="block col-span-2"><span className="text-xs font-semibold text-slate-600">Actor ID</span>
              <input type="text" value={cfg.apify.actorId} onChange={(e) => update({ apify: { ...cfg.apify, actorId: e.target.value } })} placeholder={platform === "tiktok" ? "clockworks/tiktok-scraper" : "apify/facebook-posts-scraper"} className={inp} />
            </label>
            {platform === "facebook" && (
              <label className="block col-span-2"><span className="text-xs font-semibold text-slate-600">Actor ID (Group)</span>
                <input type="text" value={cfg.apify.groupActorId} onChange={(e) => update({ apify: { ...cfg.apify, groupActorId: e.target.value } })} placeholder="apify/facebook-groups-scraper" className={inp} />
              </label>
            )}
            <label className="block"><span className="text-xs font-semibold text-slate-600">Max items</span>
              <input type="number" min={1} max={1000} value={cfg.apify.maxItems} onChange={(e) => update({ apify: { ...cfg.apify, maxItems: Number(e.target.value) } })} className={inp} />
            </label>
            <label className="block"><span className="text-xs font-semibold text-slate-600">Timeout (s)</span>
              <input type="number" min={30} max={3600} value={cfg.apify.timeoutSecs} onChange={(e) => update({ apify: { ...cfg.apify, timeoutSecs: Number(e.target.value) } })} className={inp} />
            </label>
          </div>
        )}
        {cfg.activeProvider === "social-crawler" && (
          <div className="space-y-4">
            {/* ── Base config (chung cho cả Facebook & TikTok) ── */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">API URL <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">Mã hoá</span></span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Địa chỉ của Social Crawler service. Mặc định là server TMTCO.<br />
                  Chỉ thay đổi nếu bạn tự host service riêng.
                </p>
                <input type="password" value={cfg.socialCrawler.apiUrl}
                  onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, apiUrl: e.target.value } })}
                  placeholder={scConfigVal("social_crawler_api_url")?.hasValue ? "••••••••••••" : "https://social-crawler.public.rke.crawl.tmtco.org"}
                  className={cn(inp, "font-mono")} />
              </label>
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-slate-600">API Key <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">Mã hoá</span></span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  API Key để xác thực với Social Crawler service. Liên hệ admin để lấy key.
                </p>
                <input type="password" value={cfg.socialCrawler.apiKey}
                  onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, apiKey: e.target.value } })}
                  placeholder={scConfigVal("social_crawler_api_key")?.hasValue ? "••••••••" : "Nhập key..."}
                  className={cn(inp, "font-mono")} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Max items</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Số item tối đa mỗi lần crawl (áp dụng cho TikTok).<br />
                  Facebook dùng <strong>Số bài viết tối đa</strong> bên dưới.
                </p>
                <input type="number" min={1} max={1000} value={cfg.socialCrawler.maxItems} onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, maxItems: Number(e.target.value) } })} className={inp} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Timeout (s)</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Thời gian tối đa chờ response từ service.<br />
                  Nếu quá thời gian này, request bị huỷ.<br />
                  <strong>Mặc định:</strong> 120s
                </p>
                <input type="number" min={30} max={600} value={cfg.socialCrawler.timeoutSecs} onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, timeoutSecs: Number(e.target.value) } })} className={inp} />
              </label>
            </div>

            {/* ── Facebook-specific scroll / anti-ban config ── */}
            {platform === "facebook" && (
              <>
                <div className="border-t border-kolia-line pt-3">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-kolia-green">
                    🛡️ Scroll & Anti-ban (Facebook)
                  </h4>
                  <p className="mb-3 text-[11px] text-slate-500 leading-relaxed">
                    Các tham số này kiểm soát cách crawler tương tác với Facebook để tránh bị phát hiện là bot.
                    Giá trị <strong className="text-slate-700">càng cao</strong> → an toàn hơn (chống banned) nhưng <strong className="text-slate-700">chậm hơn</strong>.
                    Facebook rất nhạy cảm với automated crawling, hãy ưu tiên safety nếu không muốn mất account.
                  </p>

                  {/* Số lượng bài viết */}
                  <div className="mb-4">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Số bài viết tối đa</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Tổng số bài viết Facebook tối đa sẽ thu thập. Đạt ngưỡng này → crawl dừng ngay.<br />
                        <strong>Mặc định:</strong> 50 &nbsp;|&nbsp; <strong>Tối đa:</strong> 500
                      </p>
                      <input type="number" min={1} max={500}
                        value={cfg.socialCrawler.facebookMaxPosts ?? 50}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, facebookMaxPosts: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                  </div>

                  {/* ── Scroll timing ── */}
                  <h5 className="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">⏱️ Scroll Timing</h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Scroll delay min (ms)</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Thời gian chờ <strong>tối thiểu</strong> sau mỗi lần scroll, chờ GraphQL load bài mới.<br />
                        ⚡ Nhanh: 2000 &nbsp;|&nbsp; 🛡️ An toàn: 12000<br />
                        <strong>Mặc định:</strong> 5000
                      </p>
                      <input type="number" min={1000} max={30000}
                        value={cfg.socialCrawler.scrollDelayMin ?? 5000}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, scrollDelayMin: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Scroll delay max (ms)</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Thời gian chờ <strong>tối đa</strong> sau mỗi lần scroll. Hệ thống random trong khoảng [min, max].<br />
                        ⚡ Nhanh: 3000 &nbsp;|&nbsp; 🛡️ An toàn: 18000<br />
                        <strong>Mặc định:</strong> 9000
                      </p>
                      <input type="number" min={1000} max={30000}
                        value={cfg.socialCrawler.scrollDelayMax ?? 9000}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, scrollDelayMax: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Steps min</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Số lần nhấn PageDown <strong>tối thiểu</strong> mỗi chu kỳ scroll.<br />
                        Càng nhiều steps → càng kích hoạt nhiều GraphQL request.<br />
                        <strong>Mặc định:</strong> 3
                      </p>
                      <input type="number" min={1} max={20}
                        value={cfg.socialCrawler.scrollStepsMin ?? 3}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, scrollStepsMin: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Steps max</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Số lần nhấn PageDown <strong>tối đa</strong> mỗi chu kỳ.<br />
                        Hệ thống random steps trong khoảng [min, max].<br />
                        <strong>Mặc định:</strong> 5
                      </p>
                      <input type="number" min={1} max={20}
                        value={cfg.socialCrawler.scrollStepsMax ?? 5}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, scrollStepsMax: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Inter-step delay min (ms)</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Delay <strong>tối thiểu</strong> giữa các lần nhấn PageDown trong cùng chu kỳ.<br />
                        Giả lập người đọc lướt từ từ, không phải bot nhấn liên tục.<br />
                        <strong>Mặc định:</strong> 400
                      </p>
                      <input type="number" min={100} max={5000}
                        value={cfg.socialCrawler.interStepDelayMin ?? 400}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, interStepDelayMin: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Inter-step delay max (ms)</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Delay <strong>tối đa</strong> giữa các PageDown.<br />
                        Giá trị cao → hành vi tự nhiên hơn nhưng chậm hơn.<br />
                        <strong>Mặc định:</strong> 800
                      </p>
                      <input type="number" min={100} max={5000}
                        value={cfg.socialCrawler.interStepDelayMax ?? 800}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, interStepDelayMax: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                  </div>

                  {/* ── Giới hạn & dừng sớm ── */}
                  <h5 className="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">🛑 Giới hạn &amp; Dừng sớm</h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Max scrolls</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Tổng số chu kỳ scroll tối đa trước khi dừng hẳn.<br />
                        Nếu đã đủ số bài, crawl dừng trước khi hết max_scrolls.<br />
                        <strong>Mặc định:</strong> 15
                      </p>
                      <input type="number" min={1} max={100}
                        value={cfg.socialCrawler.maxScrolls ?? 15}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, maxScrolls: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Stale limit</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Số lần scroll liên tiếp <strong>không có bài mới</strong> thì tự động dừng.<br />
                        Tránh lãng phí thời gian khi Facebook không load thêm bài.<br />
                        <strong>Mặc định:</strong> 4
                      </p>
                      <input type="number" min={1} max={20}
                        value={cfg.socialCrawler.staleLimit ?? 4}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, staleLimit: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                  </div>

                  {/* ── Human simulation ── */}
                  <h5 className="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">🧑 Giả lập hành vi người dùng</h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Human scroll chance (0–1)</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Xác suất crawler nhấn thêm PageDown ngẫu nhiên (hành vi giống người đọc).<br />
                        <strong>0</strong> = tắt &nbsp;|&nbsp; <strong>1</strong> = luôn scroll phụ<br />
                        <strong>Mặc định:</strong> 0.7
                      </p>
                      <input type="number" min={0} max={1} step={0.05}
                        value={cfg.socialCrawler.humanScrollChance ?? 0.7}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, humanScrollChance: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Human scroll up chance (0–1)</span>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Xác suất crawler cuộn <strong>lên trên</strong> (giả lập đọc lại bài viết).<br />
                        Hành vi rất tự nhiên, khó bị detect.<br />
                        <strong>Mặc định:</strong> 0.3
                      </p>
                      <input type="number" min={0} max={1} step={0.05}
                        value={cfg.socialCrawler.humanScrollUpChance ?? 0.3}
                        onChange={(e) => update({ socialCrawler: { ...cfg.socialCrawler, humanScrollUpChance: Number(e.target.value) } })}
                        className={inp} />
                    </label>
                  </div>

                  {/* Gợi ý preset */}
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800 leading-relaxed">
                    <strong>💡 Gợi ý preset:</strong><br />
                    • <strong>An toàn (chống banned):</strong> delay 12000–18000ms, steps 2–3, max_scrolls 8, human_chance 0.9<br />
                    • <strong>Cân bằng (mặc định):</strong> delay 5000–9000ms, steps 3–5, max_scrolls 15, human_chance 0.7<br />
                    • <strong>Nhanh (rủi ro cao):</strong> delay 2000–3000ms, steps 5–8, max_scrolls 30, human_chance 0
                  </div>
                </div>
              </>
            )}

            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-[11px] text-sky-700 leading-relaxed">
              🔒 <strong>API URL &amp; Key</strong> được mã hoá AES-256-GCM khi lưu trong DB.
              {platform === "facebook" ? (
                <>
                  <br />📘 Tất cả tham số <strong>Scroll &amp; Anti-ban</strong> bên dưới được gửi trực tiếp đến
                  <code className="bg-sky-200/50 px-1 rounded mx-0.5">POST /crawl/facebook</code>.
                  <br />💡 Nếu không rõ nên dùng giá trị nào, hãy giữ <strong>mặc định</strong> — đã được tối ưu cho đa số trường hợp.
                </>
              ) : (
                <span> TikTok crawl chỉ dùng các tham số cơ bản (API URL, Key, Max items, Timeout).</span>
              )}
            </div>
          </div>
        )}
        <div className="mt-4 border-t border-kolia-line pt-4">
          <button onClick={save} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-kolia-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu cấu hình
          </button>
        </div>
      </div>
      </div>

      {/* Account Manager */}
      <div className="xl:col-span-1">
        {platform === "facebook" ? <FacebookAccountManager /> : <TikTokAccountManager />}
      </div>
    </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMPETITORS TAB
// ═════════════════════════════════════════════════════════════════════════════

type SortField = "name" | "platform" | "source" | "category" | "createdAt";

const categoryLabels: Record<string, string> = {
  ban_sach: "Bán sách", kol_dao_tao: "KOL đào tạo",
  vi_mo: "Vĩ mô", ky_thuat: "Kỹ thuật", ca_hai: "Cả hai", other: "Khác"
};

const sortFieldLabels: Record<SortField, string> = {
  name: "Tên", platform: "Nền tảng", source: "Nguồn", category: "Phân loại", createdAt: "Ngày tạo"
};

function CompetitorsTab({ onMsg }: { onMsg: (m: any) => void }) {
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({ name: "", platform: "youtube", source: "trong_nuoc", segmentation: "", category: "other", topicDescription: "", channelUrl: "", avatarUrl: "" });
  const formKeyRef = useRef(0); // force re-mount form khi chọn/xoá

  // ─── Sub-tabs ─────────────────────────────────────────────────────
  const [subTab, setSubTab] = useState("");

  // ─── Filters & paging ─────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // ─── Data (server-side paging) ────────────────────────────────────
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (subTab) params.set("platform", subTab);
      if (source) params.set("source", source);
      if (search.trim()) params.set("search", search.trim());

      const d = await fetch(`/api/competitors?${params.toString()}`).then(r => r.json());
      setCompetitors(d.competitors ?? []);
      setPagination(d.pagination ?? { page: 1, pageSize: 10, total: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, subTab, source, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page khi filter thay đổi
  useEffect(() => { setPage(1); }, [subTab, source, search, sortBy, sortDir]);

  // ─── Form handlers ────────────────────────────────────────────────
  const select = (id: string) => {
    setSelectedId(id);
    if (!id) {
      setForm({ name: "", platform: "youtube", source: "trong_nuoc", segmentation: "", category: "other", topicDescription: "", channelUrl: "", avatarUrl: "" });
      return;
    }
    // Fetch single competitor from the paginated list (or we already have it)
    const c = competitors.find((x: any) => x.id === id);
    if (c) {
      setForm({ name: c.name, platform: c.platform, source: c.source, segmentation: c.segmentation ?? "", category: c.category, topicDescription: c.topicDescription ?? "", channelUrl: c.channelUrl, avatarUrl: c.avatarUrl ?? "" });
    } else {
      // Fallback: fetch from API
      fetch(`/api/competitors?search=${encodeURIComponent(id)}`).then(r => r.json()).then(d => {
        const found = d.competitors?.find((x: any) => x.id === id);
        if (found) setForm({ name: found.name, platform: found.platform, source: found.source, segmentation: found.segmentation ?? "", category: found.category, topicDescription: found.topicDescription ?? "", channelUrl: found.channelUrl, avatarUrl: found.avatarUrl ?? "" });
      });
    }
  };

  const save = () => {
    startTransition(async () => {
      await fetch(selectedId ? `/api/competitors/${selectedId}` : "/api/competitors", {
        method: selectedId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      onMsg({ type: "success", text: selectedId ? "✅ Đã cập nhật" : "✅ Đã thêm" });
      setSelectedId("");
      formKeyRef.current++;
      await fetchData();
    });
  };

  const remove = (id?: string) => {
    const targetId = id || selectedId;
    if (!targetId) return;
    startTransition(async () => {
      await fetch(`/api/competitors/${targetId}`, { method: "DELETE" });
      setSelectedId("");
      formKeyRef.current++;
      onMsg({ type: "success", text: "✅ Đã xoá" });
      await fetchData();
    });
  };

  const inp = "mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint";

  // ─── Pagination helpers ───────────────────────────────────────────
  const safePage = Math.min(page, pagination.totalPages || 1);
  const goToPage = (p: number) => setPage(Math.max(1, Math.min(p, pagination.totalPages)));
  const startItem = pagination.total > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(safePage * pageSize, pagination.total);

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      {/* ─── Left: table ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-kolia-line bg-white overflow-hidden">
        {/* Sub-tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-kolia-line px-4 pt-3 pb-0">
          {[
            { value: "", label: "Tất cả" },
            { value: "youtube", label: "YouTube" },
            { value: "tiktok", label: "TikTok" },
            { value: "facebook", label: "Facebook" }
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => { setSubTab(tab.value); }}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold transition -mb-px ${
                subTab === tab.value
                  ? "bg-white text-kolia-green border border-b-white border-kolia-line"
                  : "text-slate-500 hover:text-slate-700 border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter row */}
        <div className="border-b border-kolia-line px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Tìm theo tên đối thủ…"
              className="h-9 rounded-lg border border-kolia-line bg-white px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
            />
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-9 rounded-lg border border-kolia-line bg-white px-3 text-sm font-medium outline-none focus:border-kolia-green"
            >
              <option value="">Tất cả nguồn</option>
              <option value="trong_nuoc">Trong nước</option>
              <option value="nuoc_ngoai">Nước ngoài</option>
            </select>
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                className="h-9 flex-1 min-w-[100px] rounded-lg border border-kolia-line bg-white px-2 text-sm font-medium outline-none focus:border-kolia-green"
              >
                {Object.entries(sortFieldLabels).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-kolia-line bg-white hover:bg-kolia-mint"
                title={sortDir === "asc" ? "Tăng dần" : "Giảm dần"}
              >
                {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-[700px] w-full divide-y divide-kolia-line text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                <th className="px-4 py-3">Tên</th>
                <th className="px-4 py-3">Nền tảng</th>
                <th className="px-4 py-3">Nguồn</th>
                <th className="px-4 py-3">Phân loại</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kolia-line">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Đang tải…</td></tr>
              ) : competitors.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Chưa có đối thủ nào.</td></tr>
              ) : (
                competitors.map((c: any) => (
                  <tr key={c.id} className={cn("hover:bg-kolia-mint/35", selectedId === c.id && "bg-kolia-mint/30")}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => select(c.id)} className="font-semibold text-kolia-ink hover:text-kolia-green text-left">
                        {c.name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {platformLabels[c.platform as keyof typeof platformLabels] ?? c.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {sourceLabels[c.source as keyof typeof sourceLabels] ?? c.source}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{categoryLabels[c.category] ?? c.category}</td>
                    <td className="max-w-[180px] truncate px-4 py-3">
                      <a href={c.channelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-kolia-green hover:underline">
                        {c.channelUrl} <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button type="button" onClick={() => select(c.id)} className="rounded p-1 text-slate-500 hover:bg-kolia-mint hover:text-kolia-ink" title="Sửa">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => remove(c.id)} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Xoá">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && !loading && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-kolia-line px-4 py-3">
            <p className="text-xs text-slate-500">
              {startItem}–{endItem} / {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}
                className="rounded border border-kolia-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-kolia-mint disabled:opacity-40">← Trước</button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === pagination.totalPages || Math.abs(p - safePage) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-slate-300">…</span>}
                    <button onClick={() => goToPage(p)}
                      className={`min-w-[28px] rounded px-1.5 py-1 text-xs font-semibold ${p === safePage ? "bg-kolia-ink text-white" : "text-slate-600 hover:bg-kolia-mint"}`}>{p}</button>
                  </span>
                ))}
              <button disabled={safePage >= pagination.totalPages} onClick={() => goToPage(safePage + 1)}
                className="rounded border border-kolia-line px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-kolia-mint disabled:opacity-40">Sau →</button>
            </div>
          </div>
        )}

        {/* No-pagination info */}
        {pagination.totalPages <= 1 && !loading && pagination.total > 0 && (
          <div className="border-t border-kolia-line px-4 py-2 text-xs text-slate-400 text-right">
            Tổng: {pagination.total} đối thủ
          </div>
        )}
      </div>

      {/* ─── Right: form ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-kolia-line bg-white p-5" key={formKeyRef.current}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-kolia-ink">
            {selectedId ? "Sửa đối thủ" : "Thêm đối thủ"}
          </h2>
          {selectedId && (
            <button type="button" onClick={() => select("")}
              className="text-xs text-slate-500 hover:text-slate-700">Bỏ chọn</button>
          )}
        </div>
        <div className="space-y-3">
          <label className="block"><span className="text-xs font-semibold text-slate-600">Tên</span>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold text-slate-600">Nền tảng</span>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className={inp}>
                <option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="facebook">Facebook</option>
              </select>
            </label>
            <label className="block"><span className="text-xs font-semibold text-slate-600">Nguồn</span>
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inp}>
                <option value="trong_nuoc">Trong nước</option><option value="nuoc_ngoai">Nước ngoài</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-semibold text-slate-600">Phân khúc</span>
              <input type="text" value={form.segmentation} onChange={(e) => setForm({ ...form, segmentation: e.target.value })} className={inp} placeholder="VD: Bán sách, KOL…" />
            </label>
            <label className="block"><span className="text-xs font-semibold text-slate-600">Phân loại</span>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inp}>
                {Object.entries(categoryLabels).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
              </select>
            </label>
          </div>
          <label className="block"><span className="text-xs font-semibold text-slate-600">Channel URL</span>
            <input type="text" value={form.channelUrl} onChange={(e) => setForm({ ...form, channelUrl: e.target.value })} className={inp} placeholder="https://…" />
          </label>
          <label className="block"><span className="text-xs font-semibold text-slate-600">Mô tả chủ đề</span>
            <input type="text" value={form.topicDescription} onChange={(e) => setForm({ ...form, topicDescription: e.target.value })} className={inp} placeholder="VD: Đầu tư - Tài chính - Kinh tế" />
          </label>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={pending || !form.name || !form.channelUrl}
              className="flex-1 rounded-lg bg-kolia-green px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {pending ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <Save className="inline h-4 w-4 mr-1" />}Lưu
            </button>
            {selectedId && (
              <button onClick={() => remove()} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  INTEGRATIONS TAB (YouTube, TikTok, Facebook Publish)
// ═════════════════════════════════════════════════════════════════════════════

type PlatformIntegration = {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
  capabilities: string[];
};

const PLATFORMS: PlatformIntegration[] = [
  {
    id: "youtube",
    name: "YouTube",
    icon: <Youtube className="h-6 w-6" />,
    color: "text-red-600",
    bgColor: "bg-red-50",
    description: "Đăng video, quản lý kênh YouTube tự động",
    capabilities: ["Tải video lên", "Quản lý playlist", "Theo dõi analytics"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: <Music2 className="h-6 w-6" />,
    color: "text-zinc-900",
    bgColor: "bg-zinc-100",
    description: "Đăng video, quản lý tài khoản TikTok",
    capabilities: ["Đăng video", "Quản lý content", "Theo dõi hiệu suất"],
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: <BarChart3 className="h-6 w-6" />,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Đăng bài, quản lý Fanpage Facebook",
    capabilities: ["Đăng bài viết", "Lên lịch đăng", "Theo dõi tương tác"],
  },
];

type IntegrationState = {
  configured: boolean;
  connected: boolean;
  loading: boolean;
  label: string;
  statusText: string;
  statusBadge: "connected" | "disconnected" | "not-configured";
};

function IntegrationsTab({ onMsg, onNavigateTab }: { onMsg: (m: any) => void; onNavigateTab: (tab: TabId) => void }) {
  const [youtube, setYoutube] = useState<IntegrationState>({
    configured: false, connected: false, loading: true,
    label: "YouTube", statusText: "Đang tải...", statusBadge: "disconnected",
  });
  const [tiktokConfig, setTiktokConfig] = useState<IntegrationState>({
    configured: false, connected: false, loading: true,
    label: "TikTok", statusText: "Đang tải...", statusBadge: "disconnected",
  });
  const [facebookConfig, setFacebookConfig] = useState<IntegrationState>({
    configured: false, connected: false, loading: true,
    label: "Facebook", statusText: "Đang tải...", statusBadge: "disconnected",
  });
  const [configItems, setConfigItems] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/youtube/auth").then(r => r.json()).catch(() => null),
      fetch("/api/config").then(r => r.json()).catch(() => ({ configs: [] })),
    ]).then(([yt, cfg]) => {
      setConfigItems(cfg.configs ?? []);

      // YouTube
      if (yt) {
        setYoutube({
          ...youtube,
          configured: yt.configured ?? false,
          connected: yt.connected ?? false,
          loading: false,
          label: "YouTube",
          statusText: yt.connected
            ? `Đã kết nối ${yt.channels?.length || 0} kênh`
            : yt.configured
              ? "Chưa kết nối — nhấn để xác thực"
              : "Thiếu Client ID — cấu hình trong API Keys",
          statusBadge: yt.connected ? "connected" : yt.configured ? "disconnected" : "not-configured",
          _authUrl: yt.authUrl || null,
          _channels: yt.channels || [],
        } as any);
      }

      // TikTok publish
      const tkToken = cfg.configs?.find((x: any) => x.key === "tiktok_access_token");
      const tkOpenId = cfg.configs?.find((x: any) => x.key === "tiktok_open_id");
      const tkReady = tkToken?.hasValue && tkOpenId?.hasValue;
      setTiktokConfig({
        configured: Boolean(tkToken?.hasValue),
        connected: Boolean(tkReady),
        loading: false,
        label: "TikTok",
        statusText: tkReady
          ? "Đã kết nối — sẵn sàng đăng bài"
          : tkToken?.hasValue
            ? "Thiếu Open ID"
            : "Chưa cấu hình — thêm Access Token trong API Keys",
        statusBadge: tkReady ? "connected" : tkToken?.hasValue ? "disconnected" : "not-configured",
      });

      // Facebook publish
      const fbPageId = cfg.configs?.find((x: any) => x.key === "fb_page_id");
      const fbToken = cfg.configs?.find((x: any) => x.key === "fb_page_access_token");
      const fbReady = fbPageId?.hasValue && fbToken?.hasValue;
      setFacebookConfig({
        configured: Boolean(fbToken?.hasValue),
        connected: Boolean(fbReady),
        loading: false,
        label: "Facebook",
        statusText: fbReady
          ? "Đã kết nối — sẵn sàng đăng bài"
          : fbToken?.hasValue
            ? "Thiếu Page ID"
            : "Chưa cấu hình — thêm Access Token trong API Keys",
        statusBadge: fbReady ? "connected" : fbToken?.hasValue ? "disconnected" : "not-configured",
      });
    });
  }, []);

  const connectYouTube = () => {
    // Mở popup OAuth — YouTube auth URL từ state
    const authUrl = (youtube as any)._authUrl;
    if (!authUrl) return;
    const popup = window.open(authUrl, "google-oauth",
      `width=600,height=700,left=${window.screenX + (window.innerWidth - 600) / 2},top=${window.screenY + (window.innerHeight - 700) / 2},popup=1`);
    const t = setInterval(() => {
      if (popup?.closed) {
        clearInterval(t);
        fetch("/api/youtube/auth").then(r => r.json()).then(d => {
          setYoutube(prev => ({
            ...prev, connected: d.connected ?? false, loading: false,
            statusText: d.connected ? `Đã kết nối ${d.channels?.length || 0} kênh` : "Chưa kết nối",
            statusBadge: d.connected ? "connected" : "disconnected" as const,
          }));
          if (d.connected) onMsg({ type: "success", text: "✅ Đã kết nối YouTube" });
        });
      }
    }, 1000);
  };

  const disconnectYouTube = async () => {
    await fetch("/api/youtube/auth", { method: "DELETE" });
    setYoutube(prev => ({
      ...prev, connected: false, _channels: [],
      statusText: "Chưa kết nối — nhấn để xác thực",
      statusBadge: "disconnected" as const,
    }));
    onMsg({ type: "success", text: "✅ Đã ngắt kết nối YouTube" });
  };

  // ─── Render ───────────────────────────────────────────────────
  if (youtube.loading && tiktokConfig.loading && facebookConfig.loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-kolia-green" /></div>;
  }

  const statusIcon = (badge: string) => {
    switch (badge) {
      case "connected": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "disconnected": return <XCircle className="h-5 w-5 text-amber-500" />;
      default: return <XCircle className="h-5 w-5 text-slate-300" />;
    }
  };

  const statusLabel = (badge: string) => {
    switch (badge) {
      case "connected": return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">Đã kết nối</span>;
      case "disconnected": return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">Chưa kết nối</span>;
      default: return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">Chưa cấu hình</span>;
    }
  };

  const renderPlatformCard = (platform: PlatformIntegration, state: IntegrationState) => {
    const isYt = platform.id === "youtube";
    return (
      <div key={platform.id} className="group relative rounded-xl border border-kolia-line bg-white p-5 transition hover:shadow-md hover:border-slate-300">
        {/* Top row: icon + status */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${platform.bgColor} ${platform.color}`}>
              {platform.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-kolia-ink">{platform.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{platform.description}</p>
            </div>
          </div>
          {state.loading
            ? <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
            : statusIcon(state.statusBadge)}
        </div>

        {/* Capabilities */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {platform.capabilities.map((cap) => (
            <span key={cap} className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
              {cap}
            </span>
          ))}
        </div>

        {/* Status + action bar */}
        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            {statusLabel(state.statusBadge)}
            <span className="text-xs text-slate-500">{state.statusText}</span>
          </div>
          <div className="flex gap-2">
            {state.statusBadge === "connected" ? (
              <button onClick={isYt ? disconnectYouTube : undefined}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">
              Ngắt kết nối
              </button>
            ) : isYt ? (
              <button onClick={connectYouTube}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-700">
              <Link2 className="h-3.5 w-3.5" />Kết nối
              </button>
            ) : (
              <button onClick={() => onNavigateTab("api-keys")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-kolia-line px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <Key className="h-3.5 w-3.5" />Cấu hình
              </button>
            )}
          </div>
        </div>

        {/* YouTube channels detail */}
        {isYt && state.connected && (youtube as any)._channels?.map((ch: any) => (
          <div key={ch.id} className="mt-3 flex items-center gap-3 rounded-lg border border-green-100 bg-green-50/50 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">
              {ch.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-kolia-ink truncate">{ch.name}</p>
            </div>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-xl border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-kolia-green to-emerald-500 text-white shadow-sm">
          <Plug className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-kolia-ink">Tích hợp nền tảng</h2>
          <p className="text-xs text-slate-500">
            Kết nối tài khoản YouTube, TikTok, Facebook để tự động hoá quy trình đăng bài và quản lý nội dung.
            Thêm API keys trong tab <strong>API Keys</strong> trước khi kết nối.
          </p>
        </div>
      </div>

      {/* Platform cards grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => {
          const state =
            p.id === "youtube" ? youtube :
            p.id === "tiktok" ? tiktokConfig :
            facebookConfig;
          return renderPlatformCard(p, state);
        })}
      </div>
    </div>
  );
}
