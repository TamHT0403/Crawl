/**
 * Smart Context Selector — Content Generator Pro v4.0
 *
 * Thay vì dump toàn bộ raw data vào mọi prompt, module này:
 *   1. Chọn top-N posts LIÊN QUAN NHẤT với topic (keyword + engagement scoring)
 *   2. Compress mỗi post thành 1-2 dòng thay vì 500+ chars
 *   3. Build lean research context ~1,500-2,500 tokens thay vì ~8,000 tokens
 *   4. Extract market highlights (chỉ top 5 data points)
 *
 * Mục tiêu: giảm 70-75% context noise ở Step 1 Research
 */

import type { Platform } from "@/lib/types";
import type { MarketSnapshot } from "@/lib/marketData";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CompressedPost {
  competitor: string;
  title: string;
  platform: string;
  views: string;
  engagementRate: string;
  viralityScore: string;
  hookType: string;
  contentPillar: string;
  toneOfVoice: string;
  mainTopic: string;
  captionSnippet: string; // Chỉ 80 ký tự đầu
}

export interface LeanResearchContext {
  topPosts: CompressedPost[];
  platformSummary: string;
  gaps: string[];
  suggestions: string[];
  viralPatterns: string[];
  formulas: string[];
  totalTokenEstimate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST RELEVANCE SCORING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tính relevance score cho 1 post với 1 topic.
 * Kết hợp keyword matching + engagement metrics.
 */
function scorePostRelevance(
  post: {
    title: string;
    caption: string;
    mainTopic?: string | null;
    contentPillar?: string | null;
    engagementRate?: number | null;
    viralityScore?: number | null;
    views?: number | null;
  },
  topic: string,
): number {
  const topicWords = topic
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 2);

  const searchableText = [
    post.title,
    post.mainTopic ?? "",
    post.contentPillar ?? "",
    post.caption.slice(0, 200),
  ]
    .join(" ")
    .toLowerCase();

  // Keyword match score (0-5)
  let keywordScore = 0;
  for (const word of topicWords) {
    if (searchableText.includes(word)) keywordScore += 1;
  }
  const keywordNorm = Math.min(keywordScore / Math.max(topicWords.length, 1), 1) * 5;

  // Engagement score (0-3) — normalize engagement rate 0-10% → 0-3
  const engScore = Math.min((post.engagementRate ?? 0) * 30, 3);

  // Virality score (0-2)
  const viralScore = Math.min((post.viralityScore ?? 0) / 5, 2);

  return keywordNorm + engScore + viralScore;
}

/**
 * Chọn top-N posts liên quan nhất với topic, từ danh sách posts đã sắp xếp theo engagement.
 */
export function selectTopPosts<
  T extends {
    title: string;
    caption: string;
    mainTopic?: string | null;
    contentPillar?: string | null;
    engagementRate?: number | null;
    viralityScore?: number | null;
    views?: number | null;
  },
>(posts: T[], topic: string, limit = 5): T[] {
  if (posts.length <= limit) return posts;

  const scored = posts.map((p) => ({
    post: p,
    score: scorePostRelevance(p, topic),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.post);
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST COMPRESSION
// ═══════════════════════════════════════════════════════════════════════════

function fmtViews(n: number | null | undefined): string {
  if (!n) return "N/A";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtEng(r: number | null | undefined): string {
  if (!r) return "N/A";
  return `${(r * 100).toFixed(1)}%`;
}

/**
 * Compress 1 post thành 1 dòng ~120 chars thay vì 500-1500 chars.
 * Format: "Title | Eng: X% | Views: Y | Hook: Z | Competitor: C"
 */
export function compressPostForPrompt(post: {
  title: string;
  caption: string;
  views?: number | null;
  engagementRate?: number | null;
  viralityScore?: number | null;
  hookType?: string | null;
  contentPillar?: string | null;
  toneOfVoice?: string | null;
  mainTopic?: string | null;
  competitor?: { name: string } | null;
  platform?: string;
}): string {
  const parts = [
    `"${post.title.slice(0, 60)}"`,
    `Eng:${fmtEng(post.engagementRate)}`,
    post.views ? `Views:${fmtViews(post.views)}` : null,
    post.hookType ? `Hook:${post.hookType}` : null,
    post.contentPillar ? `Pillar:${post.contentPillar}` : null,
    post.competitor?.name ? `By:${post.competitor.name}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

// ═══════════════════════════════════════════════════════════════════════════
//  MARKET HIGHLIGHTS EXTRACTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chỉ lấy top 5-6 data points quan trọng nhất từ market snapshot.
 * Thay vì inject toàn bộ formatted context (~500-800 tokens) → chỉ ~150-200 tokens.
 */
export function extractMarketHighlights(
  snapshot: MarketSnapshot | null,
  limit = 6,
): string[] {
  if (!snapshot) return ["(Không có dữ liệu thị trường real-time)"];

  const highlights: string[] = [];

  if (snapshot.gold?.price) {
    const chg = snapshot.gold.change24h != null
      ? ` (${snapshot.gold.change24h >= 0 ? "+" : ""}${snapshot.gold.change24h.toFixed(1)}% 24h)`
      : "";
    highlights.push(`Vàng XAU: $${snapshot.gold.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}${chg}`);
  }
  if (snapshot.crypto?.btc?.price) {
    const chg = snapshot.crypto.btc.change24h >= 0
      ? `+${snapshot.crypto.btc.change24h.toFixed(1)}%`
      : `${snapshot.crypto.btc.change24h.toFixed(1)}%`;
    highlights.push(`Bitcoin: $${snapshot.crypto.btc.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${chg})`);
  }
  if (snapshot.vnindex?.price) {
    const chg = snapshot.vnindex.changePercent >= 0
      ? `+${snapshot.vnindex.changePercent}%`
      : `${snapshot.vnindex.changePercent}%`;
    highlights.push(`VN-Index: ${snapshot.vnindex.price.toLocaleString("vi-VN")} (${chg})`);
  }
  if (snapshot.fedRate?.rate != null) {
    highlights.push(`Fed Rate: ${snapshot.fedRate.rate}%`);
  }
  if (snapshot.cpiLatest?.value != null) {
    highlights.push(`CPI: ${snapshot.cpiLatest.value} (${snapshot.cpiLatest.date})`);
  }

  // Top 1-2 news headlines
  const news = (snapshot.newsHeadlines ?? []).slice(0, 2);
  for (const n of news) {
    highlights.push(`📰 [${n.source}] ${n.title.slice(0, 80)}`);
  }

  return highlights.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEAN CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build lean research context ~1,500-2,500 tokens cho Step 1 Research.
 * Nhận dữ liệu đã fetch từ DB, không tự query.
 */
export function buildLeanResearchContext(options: {
  platform: Platform;
  topic: string;
  competitorPosts: Array<{
    title: string;
    caption: string;
    views?: number | null;
    engagementRate?: number | null;
    viralityScore?: number | null;
    hookType?: string | null;
    contentPillar?: string | null;
    toneOfVoice?: string | null;
    mainTopic?: string | null;
    competitor?: { name: string } | null;
    platform?: string;
  }>;
  platformSummary: string;
  gaps: string[];
  suggestions: string[];
  viralPatterns: string[];
  shortFormFormulas: string[];
  longFormFormulas: string[];
  marketHighlights: string[];
}): string {
  const {
    platform,
    topic,
    competitorPosts,
    platformSummary,
    gaps,
    suggestions,
    viralPatterns,
    shortFormFormulas,
    longFormFormulas,
    marketHighlights,
  } = options;

  // Chọn top 5 posts liên quan nhất (thay vì dump 10-20 posts)
  const selected = selectTopPosts(competitorPosts, topic, 5);
  const compressedPosts = selected
    .map((p, i) => `${i + 1}. ${compressPostForPrompt(p)}`)
    .join("\n");

  // Chỉ lấy top 5 gaps & suggestions
  const topGaps = gaps.slice(0, 5).map((g, i) => `${i + 1}. ${g}`).join("\n");
  const topSuggestions = suggestions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join("\n");
  const topPatterns = viralPatterns.slice(0, 3).map((p, i) => `${i + 1}. ${p}`).join("\n");

  // Chỉ top 2 formulas mỗi loại
  const formulas = [
    ...shortFormFormulas.slice(0, 2),
    ...longFormFormulas.slice(0, 2),
  ].join("\n");

  return `## DỮ LIỆU ĐỐI THỦ — ${platform.toUpperCase()} (top 5 liên quan)
${compressedPosts}

## THỐNG KÊ PLATFORM
${platformSummary}

## DỮ LIỆU THỊ TRƯỜNG REAL-TIME
${marketHighlights.join("\n")}

## CONTENT GAPS (chưa được khai thác)
${topGaps || "Chưa có dữ liệu"}

## ĐỀ XUẤT NỘI DUNG
${topSuggestions || "Chưa có đề xuất"}

## VIRAL PATTERNS (quốc tế)
${topPatterns || "Chưa có dữ liệu"}

## CÔNG THỨC NỘI DUNG HIỆU QUẢ
${formulas || "Chưa có dữ liệu"}`;
}
