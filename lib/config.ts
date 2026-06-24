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
  category: "google" | "openai" | "facebook" | "tiktok" | "smtp" | "telegram" | "general";
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

  // ─── OpenAI ─────────────────────────────────────────────────────
  { key: "openai_api_key", label: "OpenAI API Key", description: "API Key từ OpenAI dashboard", category: "openai", encrypted: true, isSecret: true, envFallback: "OPENAI_API_KEY" },
  { key: "openai_model", label: "OpenAI Model", description: "Model ID (vd: gpt-5.5, gpt-4o)", category: "openai", encrypted: false, isSecret: false, envFallback: "OPENAI_MODEL", placeholder: "gpt-5.5" },
  { key: "openai_org_id", label: "OpenAI Organization ID", description: "Organization ID (lấy từ https://platform.openai.com/settings/organization/general). Cần để gọi API usage.", category: "openai", encrypted: false, isSecret: false, envFallback: "OPENAI_ORG_ID", placeholder: "org-xxxxxxxxxxxxxx" },

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

  // ─── Social Crawler (TikTok) ────────────────────────────────────
  { key: "social_crawler_api_url", label: "Social Crawler API URL", description: "Base URL của social-crawler service (được mã hoá)", category: "tiktok", encrypted: true, isSecret: true, envFallback: null, placeholder: "https://social-crawler.public.rke.crawl.tmtco.org" },
  { key: "social_crawler_api_key", label: "Social Crawler API Key", description: "API Key cho social-crawler service", category: "tiktok", encrypted: true, isSecret: true, envFallback: null },
  { key: "social_crawler_max_items", label: "Social Crawler Max Items", description: "Số item tối đa mỗi lần crawl", category: "tiktok", encrypted: false, isSecret: false, envFallback: null, placeholder: "50" },
  { key: "social_crawler_timeout_secs", label: "Social Crawler Timeout", description: "Timeout (giây) cho request crawl", category: "tiktok", encrypted: false, isSecret: false, envFallback: null, placeholder: "120" },

  // ─── General ────────────────────────────────────────────────────
  { key: "youtube_api_base_url", label: "YouTube API Base URL", description: "Custom API base URL (nếu dùng proxy)", category: "general", encrypted: false, isSecret: false, envFallback: null, placeholder: "https://www.googleapis.com/youtube/v3" },

  // ─── Health / Monitoring thresholds ─────────────────────────────
  { key: "health_warning_days", label: "Cảnh báo token (ngày)", description: "Số ngày không cập nhật token trước khi cảnh báo (mặc định: 30)", category: "general", encrypted: false, isSecret: false, envFallback: null, placeholder: "30" },
  { key: "health_expire_days", label: "Hết hạn token (ngày)", description: "Số ngày không cập nhật token trước khi đánh dấu hết hạn (mặc định: 90)", category: "general", encrypted: false, isSecret: false, envFallback: null, placeholder: "90" },
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
