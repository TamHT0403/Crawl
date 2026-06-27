/**
 * NL Query Cache — 2-Layer Response Cache
 *
 * Layer 1: Rule-based cache (TTL 5 phút) — cache kết quả rule-based theo question pattern
 * Layer 2: AI response cache (TTL 10 phút) — cache AI response theo hash(question + data_fingerprint)
 *
 * Khi data thay đổi (sync mới), gọi invalidateNLCache() để clear.
 */

import type { NLQueryResponse } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiry: number; // Unix ms
  createdAt: number;
}

// ─── Core Cache ────────────────────────────────────────────────────────────

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
  _cache.set(key, { data, expiry: Date.now() + ttlMs, createdAt: Date.now() });
}

// ─── TTL Constants ─────────────────────────────────────────────────────────

const RULE_CACHE_TTL = 5 * 60 * 1000;  // 5 phút
const AI_CACHE_TTL = 10 * 60 * 1000;   // 10 phút
const DATA_FINGERPRINT_TTL = 5 * 60 * 1000; // 5 phút

// ─── Simple hash function ──────────────────────────────────────────────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// ─── Normalize question for cache key ──────────────────────────────────────

function normalizeQuestion(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/g, "");
}

// ─── Layer 1: Rule-based Cache ─────────────────────────────────────────────

export function getCachedRuleResponse(question: string): NLQueryResponse | null {
  const key = `rule:${normalizeQuestion(question)}`;
  return cacheGet<NLQueryResponse>(key);
}

export function setCachedRuleResponse(question: string, response: NLQueryResponse): void {
  const key = `rule:${normalizeQuestion(question)}`;
  cacheSet(key, response, RULE_CACHE_TTL);
}

// ─── Layer 2: AI Response Cache ────────────────────────────────────────────

let _dataFingerprint: string | null = null;
let _dataFingerprintExpiry = 0;

/**
 * Set data fingerprint — called after DB queries to track data version.
 * AI cache entries are keyed against this fingerprint so stale data auto-invalidates.
 */
export function setDataFingerprint(totalPosts: number, totalCompetitors: number, avgEngagement: number): void {
  _dataFingerprint = simpleHash(`${totalPosts}-${totalCompetitors}-${avgEngagement.toFixed(4)}`);
  _dataFingerprintExpiry = Date.now() + DATA_FINGERPRINT_TTL;
}

function getDataFingerprint(): string {
  if (_dataFingerprint && Date.now() < _dataFingerprintExpiry) {
    return _dataFingerprint;
  }
  return "no-fp";
}

export function getCachedAIResponse(question: string): NLQueryResponse | null {
  const fp = getDataFingerprint();
  const key = `ai:${fp}:${simpleHash(normalizeQuestion(question))}`;
  return cacheGet<NLQueryResponse>(key);
}

export function setCachedAIResponse(question: string, response: NLQueryResponse): void {
  const fp = getDataFingerprint();
  const key = `ai:${fp}:${simpleHash(normalizeQuestion(question))}`;
  cacheSet(key, response, AI_CACHE_TTL);
}

// ─── Invalidation ──────────────────────────────────────────────────────────

/**
 * Clear all NL Query caches. Call after data sync or manual invalidation.
 */
export function invalidateNLCache(): void {
  const keysToDelete: string[] = [];
  for (const key of _cache.keys()) {
    if (key.startsWith("rule:") || key.startsWith("ai:")) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    _cache.delete(key);
  }
  _dataFingerprint = null;
  _dataFingerprintExpiry = 0;
}

/**
 * Get cache stats for debugging
 */
export function getNLCacheStats(): { totalEntries: number; ruleEntries: number; aiEntries: number } {
  let ruleEntries = 0;
  let aiEntries = 0;
  for (const key of _cache.keys()) {
    if (key.startsWith("rule:")) ruleEntries++;
    if (key.startsWith("ai:")) aiEntries++;
  }
  return { totalEntries: _cache.size, ruleEntries, aiEntries };
}
