/**
 * AI Quota & Key Verification Service
 *
 * Kiểm tra hạn mức API cho từng AI provider.
 * Cash kết quả trong memory với TTL 5 phút để tránh gọi API liên tục.
 *
 * Providers có hỗ trợ quota API:
 *   - OpenAI: GET /v1/dashboard/billing/subscription + /usage
 *   - OpenRouter: GET /api/v1/auth/key → credits
 *
 * Các provider khác (Gemini, Groq, HuggingFace): chỉ verify key.
 */

import { getConfig } from "@/lib/config";

// ─── Types ─────────────────────────────────────────────────────────────────

export type QuotaStatus = {
  provider: string;
  modelKey: string;
  valid: boolean;
  quotaAvailable: boolean;
  /** Số lượng còn lại (USD, credits, hoặc null nếu không xác định) */
  remaining: number | null;
  /** Đã sử dụng */
  used: number | null;
  /** Tổng giới hạn */
  total: number | null;
  unit: "USD" | "credits" | "requests" | null;
  /** true nếu đã hết quota */
  exhausted: boolean;
  error?: string;
  checkedAt: string;
};

// ─── In-memory cache ──────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

const quotaCache = new Map<
  string,
  { status: QuotaStatus; expiresAt: number }
>();

function getCached(provider: string): QuotaStatus | null {
  const entry = quotaCache.get(provider);
  if (entry && Date.now() < entry.expiresAt) return entry.status;
  quotaCache.delete(provider);
  return null;
}

function setCache(provider: string, status: QuotaStatus) {
  quotaCache.set(provider, { status, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearQuotaCache(provider?: string) {
  if (provider) quotaCache.delete(provider);
  else quotaCache.clear();
}

/**
 * Throw error nếu AI provider đã hết quota.
 * Dùng trong các hàm server-side (lib/) trước khi gọi AI.
 */
export async function throwIfAiQuotaExhausted(provider?: string): Promise<void> {
  const exhausted = await isAiQuotaExhausted(provider);
  if (exhausted) {
    const name = provider || "AI";
    throw new Error(
      `⚠️ ${name} đã hết hạn mức API. Vào Settings → API Keys để kiểm tra và thêm key mới.`,
    );
  }
}

/**
 * Middleware cho API routes: kiểm tra quota, trả về NextResponse 402 nếu hết.
 * Dùng trong các route handler để nhanh chóng từ chối request.
 *
 * @example
 * export async function GET() {
 *   const guard = await requireAiQuota();
 *   if (guard) return guard;
 *   // ... tiếp tục xử lý
 * }
 */
import { NextResponse } from "next/server";

export async function requireAiQuota(provider?: string): Promise<NextResponse | null> {
  try {
    await throwIfAiQuotaExhausted(provider);
    return null; // OK
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message,
        code: "AI_QUOTA_EXHAUSTED",
        hint: "Vào Settings → API Keys để cập nhật API key hoặc kiểm tra hạn mức.",
      },
      { status: 402 },
    );
  }
}

// ─── Provider config ──────────────────────────────────────────────────────

type ProviderConfig = {
  apiKeyKey: string;
  modelKey: string;
  /** Endpoint để verify key (GET models list) */
  verifyUrl: string;
  verifyAuth: "header" | "query";
  /** Endpoint để check quota (nếu có) */
  quotaUrl?: string;
  quotaAuth?: "header" | "query";
  quotaUnit: "USD" | "credits" | null;
};

const PROVIDER_CONFIG: Record<string, ProviderConfig> = {
  openai: {
    apiKeyKey: "openai_api_key",
    modelKey: "openai_model",
    verifyUrl: "https://api.openai.com/v1/models",
    verifyAuth: "header",
    quotaUrl: "https://api.openai.com/v1/dashboard/billing/subscription",
    quotaAuth: "header",
    quotaUnit: "USD",
  },
  gemini: {
    apiKeyKey: "gemini_api_key",
    modelKey: "gemini_model",
    verifyUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    verifyAuth: "query",
    quotaUnit: null,
  },
  groq: {
    apiKeyKey: "groq_api_key",
    modelKey: "groq_model",
    verifyUrl: "https://api.groq.com/openai/v1/models",
    verifyAuth: "header",
    quotaUnit: null,
  },
  openrouter: {
    apiKeyKey: "openrouter_api_key",
    modelKey: "openrouter_model",
    verifyUrl: "https://openrouter.ai/api/v1/models",
    verifyAuth: "header",
    quotaUrl: "https://openrouter.ai/api/v1/auth/key",
    quotaAuth: "header",
    quotaUnit: "credits",
  },
  huggingface: {
    apiKeyKey: "huggingface_api_key",
    modelKey: "huggingface_model",
    verifyUrl: "https://huggingface.co/api/whoami",
    verifyAuth: "header",
    quotaUnit: null,
  },
};

// ─── Verify key + check quota ─────────────────────────────────────────────

async function verifyKey(provider: string, cfg: ProviderConfig, apiKey: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    let url = cfg.verifyUrl;
    if (cfg.verifyAuth === "header") headers["Authorization"] = `Bearer ${apiKey}`;
    if (cfg.verifyAuth === "query") url = `${url}?key=${apiKey}`;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkOpenAIBilling(apiKey: string): Promise<{
  used: number | null;
  total: number | null;
  remaining: number | null;
  quotaAvailable: boolean;
}> {
  try {
    // Gọi subscription để lấy giới hạn
    const subRes = await fetch("https://api.openai.com/v1/dashboard/billing/subscription", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!subRes.ok) {
      // Key không có quyền billing → không check được quota
      return { used: null, total: null, remaining: null, quotaAvailable: false };
    }
    const sub = await subRes.json();
    const totalLimit = sub.hard_limit_usd ?? sub.soft_limit_usd ?? null;
    if (!totalLimit) {
      return { used: null, total: null, remaining: null, quotaAvailable: false };
    }

    // Gọi usage trong tháng này
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

    const usageRes = await fetch(
      `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) },
    );

    let usedUsd: number | null = null;
    if (usageRes.ok) {
      const usage = await usageRes.json();
      // total_usage trả về cents → đổi sang USD
      usedUsd = (usage.total_usage ?? 0) / 100;
    }

    const remaining = usedUsd !== null ? Math.max(0, totalLimit - usedUsd) : null;
    return { used: usedUsd, total: totalLimit, remaining, quotaAvailable: true };
  } catch {
    return { used: null, total: null, remaining: null, quotaAvailable: false };
  }
}

async function checkOpenRouterCredits(apiKey: string): Promise<{
  used: number | null;
  total: number | null;
  remaining: number | null;
  quotaAvailable: boolean;
}> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { used: null, total: null, remaining: null, quotaAvailable: false };

    const data = await res.json();
    // { data: { credits: number, usage: number, limit: number | null } }
    const credits = data.data?.credits ?? null;
    const usage = data.data?.usage ?? null;

    return {
      used: usage,
      total: credits !== null ? credits + (usage ?? 0) : null,
      remaining: credits,
      quotaAvailable: credits !== null,
    };
  } catch {
    return { used: null, total: null, remaining: null, quotaAvailable: false };
  }
}

// ─── Main check function ──────────────────────────────────────────────────

/**
 * Kiểm tra API key + hạn mức của một provider.
 * Kết quả được cache 5 phút.
 */
export async function checkAiQuota(provider: string): Promise<QuotaStatus> {
  const cached = getCached(provider);
  if (cached) return cached;

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) {
    const result: QuotaStatus = {
      provider,
      modelKey: "",
      valid: false,
      quotaAvailable: false,
      remaining: null,
      used: null,
      total: null,
      unit: null,
      exhausted: false,
      error: `Unknown provider: ${provider}`,
      checkedAt: new Date().toISOString(),
    };
    return result;
  }

  const apiKey = await getConfig(cfg.apiKeyKey);
  if (!apiKey) {
    const result: QuotaStatus = {
      provider,
      modelKey: cfg.modelKey,
      valid: false,
      quotaAvailable: false,
      remaining: null,
      used: null,
      total: null,
      unit: null,
      exhausted: false,
      error: "API key chưa được cấu hình",
      checkedAt: new Date().toISOString(),
    };
    setCache(provider, result);
    return result;
  }

  // 1. Verify key
  const valid = await verifyKey(provider, cfg, apiKey);
  if (!valid) {
    const result: QuotaStatus = {
      provider,
      modelKey: cfg.modelKey,
      valid: false,
      quotaAvailable: false,
      remaining: null,
      used: null,
      total: null,
      unit: null,
      exhausted: true,
      error: "API key không hợp lệ hoặc đã hết hạn",
      checkedAt: new Date().toISOString(),
    };
    setCache(provider, result);
    return result;
  }

  // 2. Check quota (nếu provider hỗ trợ)
  let used: number | null = null;
  let total: number | null = null;
  let remaining: number | null = null;
  let quotaAvailable = false;

  if (provider === "openai") {
    const billing = await checkOpenAIBilling(apiKey);
    used = billing.used;
    total = billing.total;
    remaining = billing.remaining;
    quotaAvailable = billing.quotaAvailable;
  } else if (provider === "openrouter") {
    const credits = await checkOpenRouterCredits(apiKey);
    used = credits.used;
    total = credits.total;
    remaining = credits.remaining;
    quotaAvailable = credits.quotaAvailable;
  }

  // Với provider không có quota API → coi như còn quota (xác định qua key valid)
  if (!quotaAvailable) {
    remaining = null;
    used = null;
    total = null;
  }

  const exhausted = quotaAvailable ? (remaining !== null && remaining <= 0) : false;

  const result: QuotaStatus = {
    provider,
    modelKey: cfg.modelKey,
    valid,
    quotaAvailable,
    remaining,
    used,
    total,
    unit: cfg.quotaUnit,
    exhausted,
    checkedAt: new Date().toISOString(),
  };

  setCache(provider, result);
  return result;
}

/**
 * Quick check: provider có còn quota không?
 * Cache-aware, không gọi API nếu cache còn hiệu lực.
 */
export async function isAiQuotaExhausted(provider?: string): Promise<boolean> {
  // Nếu không chỉ định provider, dùng provider đang active
  if (!provider) {
    const { getActiveProvider } = await import("@/lib/openai");
    provider = await getActiveProvider();
  }

  const cached = getCached(provider);
  if (cached) return cached.exhausted;

  // Không có cache → check fresh, nhưng fast mode: chỉ verify key + quota nếu có sẵn
  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) return false;

  const apiKey = await getConfig(cfg.apiKeyKey);
  if (!apiKey) return true; // Không có key → exhausted

  const valid = await verifyKey(provider, cfg, apiKey);
  if (!valid) return true; // Key không hợp lệ → exhausted

  // Thử check quota nhanh
  if (provider === "openai") {
    const billing = await checkOpenAIBilling(apiKey);
    if (billing.remaining !== null && billing.remaining <= 0) return true;
  } else if (provider === "openrouter") {
    const credits = await checkOpenRouterCredits(apiKey);
    if (credits.remaining !== null && credits.remaining <= 0) return true;
  }

  return false;
}
