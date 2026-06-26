/**
 * Context Cache Layer — Content Generator Pro v4.0
 *
 * In-memory TTL cache cho:
 *   - ProContext (DB queries): TTL 5 phút
 *   - MarketSnapshot: TTL 2 phút
 *   - Session store (manual mode step outputs): TTL 30 phút
 *
 * Lý do: Mỗi generation cũ gọi buildProContext() 1-3 lần (pipeline + manual mode)
 * → Cùng DB query lặp lại không cần thiết.
 */

import type { MarketSnapshot } from "@/lib/marketData";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface CacheEntry<T> {
  data: T;
  expiry: number; // Unix ms
}

/** Output từng step trong pipeline — dùng cho manual mode session */
export interface StepOutputs {
  step1?: string; // Research brief
  step2?: string; // Angle blueprint (JSON string)
  step2Parsed?: Record<string, unknown>; // Parsed blueprint
  step3?: string; // Scene outline (JSON string)
  step3Parsed?: Record<string, unknown>; // Parsed scenes
  step4?: string; // Full word-for-word script
  step5?: Record<string, unknown>; // QA metrics JSON
  platform?: string;
  mainTopic?: string;
  outputMode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CORE CACHE (generic TTL store)
// ═══════════════════════════════════════════════════════════════════════════

const _cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    _cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  _cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export function cacheClear(prefix?: string): void {
  if (!prefix) {
    _cache.clear();
    return;
  }
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRO CONTEXT CACHE
// ═══════════════════════════════════════════════════════════════════════════

const CONTEXT_TTL = 5 * 60 * 1000; // 5 phút

/**
 * Lấy cached ProContext. Nếu miss → gọi `builder()` và cache kết quả.
 * @param cacheKey  Thường là `platform-days` (vd: "youtube-30")
 * @param builder   Async function để build context nếu cache miss
 */
export async function getCachedProContext<T>(
  cacheKey: string,
  builder: () => Promise<T>,
  ttlMs = CONTEXT_TTL,
): Promise<T> {
  const cached = cacheGet<T>(`ctx:${cacheKey}`);
  if (cached) return cached;
  const data = await builder();
  cacheSet(`ctx:${cacheKey}`, data, ttlMs);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MARKET DATA CACHE
// ═══════════════════════════════════════════════════════════════════════════

const MARKET_TTL = 2 * 60 * 1000; // 2 phút

export async function getCachedMarketData(
  fetcher: () => Promise<MarketSnapshot | null>,
): Promise<MarketSnapshot | null> {
  const cached = cacheGet<MarketSnapshot>("market:snapshot");
  if (cached) return cached;
  try {
    const data = await fetcher();
    if (data) cacheSet("market:snapshot", data, MARKET_TTL);
    return data;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SESSION STORE — Manual mode step outputs
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_TTL = 30 * 60 * 1000; // 30 phút

export function getSessionOutputs(sessionId: string): StepOutputs | null {
  return cacheGet<StepOutputs>(`session:${sessionId}`);
}

export function setSessionStep(
  sessionId: string,
  step: 1 | 2 | 3 | 4 | 5,
  output: string,
  parsed?: Record<string, unknown>,
  meta?: Partial<Pick<StepOutputs, "platform" | "mainTopic" | "outputMode">>,
): void {
  const existing = cacheGet<StepOutputs>(`session:${sessionId}`) ?? {};
  const updated: StepOutputs = { ...existing, ...meta };
  switch (step) {
    case 1: updated.step1 = output; break;
    case 2: updated.step2 = output; updated.step2Parsed = parsed; break;
    case 3: updated.step3 = output; updated.step3Parsed = parsed; break;
    case 4: updated.step4 = output; break;
    case 5: updated.step5 = parsed; break;
  }
  cacheSet(`session:${sessionId}`, updated, SESSION_TTL);
}

export function clearSession(sessionId: string): void {
  _cache.delete(`session:${sessionId}`);
}
