/**
 * Central Configuration Service
 *
 * Đọc/ghi tất cả cấu hình từ database Settings table.
 * Hỗ trợ mã hoá AES-256-GCM cho secrets, fallback về env var.
 *
 * ENCRYPTION_KEY và DATABASE_URL bắt buộc phải ở .env (infra-level).
 * Tất cả config khác có thể quản lý qua UI.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

// ─── Config Registry ───────────────────────────────────────────────────────

export type ConfigMeta = {
  key: string;
  label: string;
  description: string;
  category: "google" | "openai" | "facebook" | "tiktok" | "smtp" | "telegram" | "general" | "ai";
  encrypted: boolean;
  isSecret: boolean; // Ẩn giá trị trong UI (show ****)
  envFallback: string | null; // Tên env var để fallback
  placeholder?: string;
};

export const CONFIG_REGISTRY: ConfigMeta[] = [
  // ─── Google ────────────────────────────────────────────────────
  { key: "google_client_id", label: "Google Client ID", description: "OAuth 2.0 Client ID từ Google Cloud Console", category: "google", encrypted: true, isSecret: false, envFallback: "GOOGLE_CLIENT_ID" },
  { key: "google_client_secret", label: "Google Client Secret", description: "OAuth 2.0 Client Secret", category: "google", encrypted: true, isSecret: true, envFallback: "GOOGLE_CLIENT_SECRET" },
  { key: "google_redirect_uri", label: "Google Redirect URI", description: "Callback URL cho OAuth", category: "google", encrypted: false, isSecret: false, envFallback: "GOOGLE_REDIRECT_URI", placeholder: "http://localhost:3000/api/youtube/auth/callback" },
  { key: "youtube_api_key", label: "YouTube API Key", description: "API Key từ Google Cloud Console (YouTube Data API v3)", category: "google", encrypted: true, isSecret: true, envFallback: "YOUTUBE_API_KEY" },

  // ─── AI Provider ────────────────────────────────────────────────
  { key: "ai_provider", label: "AI Provider", description: "Nhà cung cấp AI API (openai, gemini, groq, openrouter, huggingface)", category: "openai", encrypted: false, isSecret: false, envFallback: "AI_PROVIDER", placeholder: "openai" },

  // ─── OpenAI ─────────────────────────────────────────────────────
  { key: "openai_api_key", label: "OpenAI API Key", description: "API Key từ OpenAI dashboard", category: "openai", encrypted: true, isSecret: true, envFallback: "OPENAI_API_KEY" },
  { key: "openai_model", label: "OpenAI Model", description: "Model ID (vd: gpt-5.5, gpt-4o)", category: "openai", encrypted: false, isSecret: false, envFallback: "OPENAI_MODEL", placeholder: "gpt-5.5" },
  { key: "openai_base_url", label: "OpenAI Base URL", description: "Custom API base URL (nếu dùng proxy)", category: "openai", encrypted: false, isSecret: false, envFallback: "OPENAI_BASE_URL", placeholder: "https://api.openai.com/v1" },

  // ─── Google Gemini ──────────────────────────────────────────────
  { key: "gemini_api_key", label: "Gemini API Key", description: "API Key từ Google AI Studio (https://aistudio.google.com)", category: "openai", encrypted: true, isSecret: true, envFallback: "GEMINI_API_KEY" },
  { key: "gemini_model", label: "Gemini Model", description: "Model ID (vd: gemini-2.5-flash, gemini-2.5-pro)", category: "openai", encrypted: false, isSecret: false, envFallback: "GEMINI_MODEL", placeholder: "gemini-2.5-flash" },
  { key: "gemini_base_url", label: "Gemini Base URL", description: "Custom API base URL (mặc định: https://generativelanguage.googleapis.com/v1beta/openai/)", category: "openai", encrypted: false, isSecret: false, envFallback: null, placeholder: "https://generativelanguage.googleapis.com/v1beta/openai/" },

  // ─── Groq ───────────────────────────────────────────────────────
  { key: "groq_api_key", label: "Groq API Key", description: "API Key từ Groq Console (https://console.groq.com)", category: "openai", encrypted: true, isSecret: true, envFallback: "GROQ_API_KEY" },
  { key: "groq_model", label: "Groq Model", description: "Model ID (vd: llama-3.3-70b-versatile, qwen-2.5-32b)", category: "openai", encrypted: false, isSecret: false, envFallback: "GROQ_MODEL", placeholder: "llama-3.3-70b-versatile" },
  { key: "groq_base_url", label: "Groq Base URL", description: "Custom API base URL (mặc định: https://api.groq.com/openai/v1)", category: "openai", encrypted: false, isSecret: false, envFallback: null, placeholder: "https://api.groq.com/openai/v1" },

  // ─── OpenRouter ─────────────────────────────────────────────────
  { key: "openrouter_api_key", label: "OpenRouter API Key", description: "API Key từ OpenRouter (https://openrouter.ai/keys)", category: "openai", encrypted: true, isSecret: true, envFallback: "OPENROUTER_API_KEY" },
  { key: "openrouter_model", label: "OpenRouter Model", description: "Model ID (vd: google/gemini-2.5-flash:free, anthropic/claude-3.5-sonnet:free)", category: "openai", encrypted: false, isSecret: false, envFallback: "OPENROUTER_MODEL", placeholder: "google/gemini-2.5-flash:free" },
  { key: "openrouter_base_url", label: "OpenRouter Base URL", description: "Custom API base URL (mặc định: https://openrouter.ai/api/v1)", category: "openai", encrypted: false, isSecret: false, envFallback: null, placeholder: "https://openrouter.ai/api/v1" },

  // ─── HuggingFace ────────────────────────────────────────────────
  { key: "huggingface_api_key", label: "HuggingFace API Key", description: "API Key từ Hugging Face (https://huggingface.co/settings/tokens)", category: "openai", encrypted: true, isSecret: true, envFallback: "HUGGINGFACE_API_KEY" },
  { key: "huggingface_model", label: "HuggingFace Model", description: "Model ID (vd: mistralai/Mistral-7B-Instruct-v0.3, meta-llama/Llama-3.2-3B-Instruct)", category: "openai", encrypted: false, isSecret: false, envFallback: "HUGGINGFACE_MODEL", placeholder: "mistralai/Mistral-7B-Instruct-v0.3" },
  { key: "huggingface_base_url", label: "HuggingFace Base URL", description: "Custom API base URL (mặc định: https://api-inference.huggingface.co/v1)", category: "openai", encrypted: false, isSecret: false, envFallback: null, placeholder: "https://api-inference.huggingface.co/v1" },

  // ─── Facebook ───────────────────────────────────────────────────
  { key: "fb_email", label: "Facebook Email", description: "Email đăng nhập Facebook (Playwright fallback)", category: "facebook", encrypted: true, isSecret: false, envFallback: "FB_EMAIL" },
  { key: "fb_password", label: "Facebook Password", description: "Password đăng nhập Facebook", category: "facebook", encrypted: true, isSecret: true, envFallback: "FB_PASSWORD" },
  { key: "fb_page_id", label: "Facebook Page ID", description: "ID của Facebook Page để đăng bài tự động", category: "facebook", encrypted: false, isSecret: false, envFallback: "FB_PAGE_ID" },
  { key: "fb_page_access_token", label: "Facebook Page Access Token", description: "Access Token cho Facebook Page (Graph API)", category: "facebook", encrypted: true, isSecret: true, envFallback: "FB_PAGE_ACCESS_TOKEN" },

  // ─── TikTok ─────────────────────────────────────────────────────
  { key: "tiktok_access_token", label: "TikTok Access Token", description: "Access Token cho TikTok API", category: "tiktok", encrypted: true, isSecret: true, envFallback: "TIKTOK_ACCESS_TOKEN" },
  { key: "tiktok_open_id", label: "TikTok Open ID", description: "Open ID cho TikTok API", category: "tiktok", encrypted: false, isSecret: false, envFallback: "TIKTOK_OPEN_ID" },

  // ─── SMTP ───────────────────────────────────────────────────────
  { key: "smtp_host", label: "SMTP Host", description: "Máy chủ SMTP (vd: smtp.gmail.com)", category: "smtp", encrypted: false, isSecret: false, envFallback: "SMTP_HOST" },
  { key: "smtp_port", label: "SMTP Port", description: "Cổng SMTP (587 cho TLS)", category: "smtp", encrypted: false, isSecret: false, envFallback: "SMTP_PORT", placeholder: "587" },
  { key: "smtp_user", label: "SMTP Username", description: "Tên đăng nhập SMTP", category: "smtp", encrypted: true, isSecret: false, envFallback: "SMTP_USER" },
  { key: "smtp_pass", label: "SMTP Password", description: "Mật khẩu SMTP (App Password nếu dùng Gmail)", category: "smtp", encrypted: true, isSecret: true, envFallback: "SMTP_PASS" },
  { key: "smtp_from", label: "SMTP From Email", description: "Địa chỉ email hiển thị khi gửi", category: "smtp", encrypted: false, isSecret: false, envFallback: "SMTP_FROM", placeholder: "noreply@kolia.app" },

  // ─── Telegram ───────────────────────────────────────────────────
  { key: "telegram_bot_token", label: "Telegram Bot Token", description: "Bot Token từ @BotFather", category: "telegram", encrypted: true, isSecret: true, envFallback: "TELEGRAM_BOT_TOKEN" },


  // ─── General ────────────────────────────────────────────────────
  { key: "youtube_api_base_url", label: "YouTube API Base URL", description: "Custom API base URL (nếu dùng proxy)", category: "general", encrypted: false, isSecret: false, envFallback: null, placeholder: "https://www.googleapis.com/youtube/v3" },

  // ─── Health / Monitoring thresholds ─────────────────────────────
  { key: "health_warning_days", label: "Cảnh báo token (ngày)", description: "Số ngày không cập nhật token trước khi cảnh báo (mặc định: 30)", category: "general", encrypted: false, isSecret: false, envFallback: null, placeholder: "30" },
  { key: "health_expire_days", label: "Hết hạn token (ngày)", description: "Số ngày không cập nhật token trước khi đánh dấu hết hạn (mặc định: 90)", category: "general", encrypted: false, isSecret: false, envFallback: null, placeholder: "90" },

  // ─── Web Research / Content Generator Pro ────────────────────────
  { key: "web_search_provider", label: "Web Search Provider", description: "Provider tìm kiếm web cho Content Generator Pro (tavily | serpapi | none)", category: "ai", encrypted: false, isSecret: false, envFallback: "WEB_SEARCH_PROVIDER", placeholder: "tavily" },
  { key: "web_search_api_key", label: "Web Search API Key", description: "API key của provider tìm kiếm web (Tavily hoặc SerpAPI)", category: "ai", encrypted: true, isSecret: true, envFallback: "WEB_SEARCH_API_KEY" },
  { key: "web_search_max_results", label: "Web Search Max Results", description: "Số kết quả tối đa mỗi lần tìm kiếm web (mặc định: 5)", category: "ai", encrypted: false, isSecret: false, envFallback: null, placeholder: "5" },
  { key: "web_search_token_budget", label: "Research Token Budget", description: "Token tối đa cho bước Research (mặc định: 2000)", category: "ai", encrypted: false, isSecret: false, envFallback: null, placeholder: "2000" },
  { key: "content_gen_token_budget", label: "Content Gen Token Budget", description: "Tổng token budget cho toàn bộ pipeline Content Generator Pro (mặc định: 20000, tối đa: 100000)", category: "ai", encrypted: false, isSecret: false, envFallback: null, placeholder: "20000" },
  { key: "content_gen_niche", label: "Content Niche", description: "Lĩnh vực nội dung (vd: tài chính, công nghệ, bất động sản). Dùng để cá nhân hoá prompt.", category: "ai", encrypted: false, isSecret: false, envFallback: null, placeholder: "tài chính" },
];

const CONFIG_KEYS = CONFIG_REGISTRY.map((c) => c.key);

// ─── Request-scoped cache ──────────────────────────────────────────────────
// Tránh N+1 queries: lấy tất cả config trong 1 query, cache cho request hiện tại

let configCache: Map<string, string | undefined> | null = null;
let configCachePromise: Promise<Map<string, string | undefined>> | null = null;

async function loadAllConfigs(): Promise<Map<string, string | undefined>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: "config_" } },
  });

  const dbMap = new Map<string, string>();
  for (const row of rows) {
    const configKey = row.key.replace("config_", "");
    const meta = CONFIG_REGISTRY.find((c) => c.key === configKey);
    if (meta) {
      try {
        dbMap.set(configKey, meta.encrypted ? decrypt(row.value) : row.value);
      } catch {
        dbMap.set(configKey, row.value);
      }
    }
  }

  const result = new Map<string, string | undefined>();
  for (const meta of CONFIG_REGISTRY) {
    const dbVal = dbMap.get(meta.key);
    if (dbVal !== undefined) {
      result.set(meta.key, dbVal);
    } else if (meta.envFallback && process.env[meta.envFallback]?.trim()) {
      result.set(meta.key, process.env[meta.envFallback]!.trim());
    } else {
      result.set(meta.key, undefined);
    }
  }

  configCache = result;
  configCachePromise = null;
  return result;
}

function getCachedConfig(key: string): string | undefined {
  if (!configCache) return undefined;
  return configCache.get(key);
}

/**
 * Lấy giá trị config:
 * 1. Từ cache (nếu đã load)
 * 2. DB (tất cả config trong 1 query)
 * 3. Fallback: env var
 */
export async function getConfig(key: string): Promise<string | undefined> {
  const meta = CONFIG_REGISTRY.find((c) => c.key === key);
  if (!meta) return undefined;

  // Check cache first
  if (configCache) {
    return configCache.get(key);
  }

  // Load all configs in one query (deduplicate concurrent calls)
  if (!configCachePromise) {
    configCachePromise = loadAllConfigs();
  }
  const cache = await configCachePromise;
  return cache.get(key);
}

/**
 * Reset cache (gọi sau khi set/delete config)
 */
export function resetConfigCache(): void {
  configCache = null;
  configCachePromise = null;
}

const CATEGORY_NAMES: Record<string, string> = {
  google: "🔑 Google / YouTube",
  openai: "🤖 OpenAI",
  facebook: "📘 Facebook",
  tiktok: "🎵 TikTok",
  smtp: "📧 SMTP (Email)",
  telegram: "✈️ Telegram",
  general: "⚙️ General",
};

/**
 * Lấy giá trị config bắt buộc — throw error nếu không có
 */
export async function requireConfig(key: string): Promise<string> {
  const value = await getConfig(key);
  if (!value) {
    const meta = CONFIG_REGISTRY.find((c) => c.key === key);
    if (!meta) throw new Error(`❌ Thiếu cấu hình: ${key}`);
    const section = CATEGORY_NAMES[meta.category] ?? meta.category;
    const hint = meta.envFallback
      ? `Vào Settings → Cấu hình & Bảo mật → mục ${section} và nhập "${meta.label}", hoặc thêm biến môi trường ${meta.envFallback} vào file .env`
      : `Vào Settings → Cấu hình & Bảo mật → mục ${section} và nhập "${meta.label}"`;
    throw new Error(`❌ Thiếu cấu hình: ${meta.label}\n\n  ${hint}`);
  }
  return value;
}

/**
 * Lưu giá trị config (tự động mã hoá nếu cần)
 */
export async function setConfig(key: string, value: string): Promise<void> {
  const meta = CONFIG_REGISTRY.find((c) => c.key === key);
  if (!meta) throw new Error(`Unknown config key: ${key}`);

  const storedValue = meta.encrypted ? encrypt(value) : value;

  await prisma.setting.upsert({
    where: { key: `config_${key}` },
    create: { key: `config_${key}`, value: storedValue },
    update: { value: storedValue },
  });

  resetConfigCache();
}

/**
 * Xoá config (reset về env fallback)
 */
export async function deleteConfig(key: string): Promise<void> {
  await prisma.setting.delete({ where: { key: `config_${key}` } }).catch(() => {});
  resetConfigCache();
}

/**
 * Lấy tất cả config values (đã giải mã)
 */
export async function getAllConfigs(): Promise<Record<string, { value: string | undefined; source: "db" | "env" | "unset" }>> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: "config_" } },
  });

  const dbMap = new Map<string, string>();
  for (const row of rows) {
    const configKey = row.key.replace("config_", "");
    const meta = CONFIG_REGISTRY.find((c) => c.key === configKey);
    if (meta) {
      try {
        dbMap.set(configKey, meta.encrypted ? decrypt(row.value) : row.value);
      } catch {
        dbMap.set(configKey, row.value);
      }
    }
  }

  const result: Record<string, { value: string | undefined; source: "db" | "env" | "unset" }> = {};

  for (const meta of CONFIG_REGISTRY) {
    const dbVal = dbMap.get(meta.key);
    if (dbVal !== undefined) {
      result[meta.key] = { value: dbVal, source: "db" };
    } else if (meta.envFallback && process.env[meta.envFallback]?.trim()) {
      result[meta.key] = { value: process.env[meta.envFallback]!.trim(), source: "env" };
    } else {
      result[meta.key] = { value: undefined, source: "unset" };
    }
  }

  return result;
}

/**
 * Kiểm tra xem config có được cấu hình chưa (DB hoặc env)
 */
export async function isConfigReady(key: string): Promise<boolean> {
  const val = await getConfig(key);
  return Boolean(val);
}

/**
 * Lấy config theo category — trả về object các config đã ready
 */
export async function getConfigsByCategory(category: ConfigMeta["category"]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const meta of CONFIG_REGISTRY.filter((c) => c.category === category)) {
    const val = await getConfig(meta.key);
    if (val) result[meta.key] = val;
  }
  return result;
}
