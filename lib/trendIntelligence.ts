/**
 * Trend Intelligence Service
 *
 * Phân tích xu hướng nội dung từ dữ liệu đã crawl:
 *   - Tận dụng detectViralPatterns() từ viralPatterns.ts
 *   - Phát hiện topics đang "nóng lên" theo platform
 *   - Phân tích competitor movements
 *   - Gợi ý góc tiếp cận dựa trên trend + gap
 */

import { prisma } from "@/lib/prisma";
import { detectViralPatterns } from "@/lib/viralPatterns";
import type { EmergingTrend } from "@/lib/viralPatterns";
import type { Platform } from "@/lib/types";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TrendIntelligence = {
  emergingTrends: EmergingTrend[];
  hotTopicsThisWeek: Array<{
    topic: string;
    postCount: number;
    avgEngagement: number;
    platforms: string[];
  }>;
  risingEngagement: Array<{
    topic: string;
    currentAvgEngagement: number;
    previousAvgEngagement: number;
    growthPercent: number;
  }>;
  competitorMovements: Array<{
    competitor: string;
    recentTopics: string[];
    postCountLast7d: number;
    avgEngagement: number;
  }>;
  suggestedAngles: string[];
};

// ═══════════════════════════════════════════════════════════════════════════
//  CACHE
// ═══════════════════════════════════════════════════════════════════════════

let trendCache: { data: TrendIntelligence; platform: string; timestamp: number } | null = null;
const TREND_CACHE_TTL = 5 * 60 * 1000; // 5 phút

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function getTrendIntelligence(platform?: Platform): Promise<TrendIntelligence> {
  const cacheKey = platform || "all";
  if (trendCache && trendCache.platform === cacheKey && Date.now() - trendCache.timestamp < TREND_CACHE_TTL) {
    return trendCache.data;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Build platform filter
  const platformFilter = platform ? { platform } : {};

  // ─── 1. Get emerging trends from viralPatterns.ts ─────────────────
  let emergingTrends: EmergingTrend[] = [];
  try {
    const viralData = await detectViralPatterns(30);
    emergingTrends = viralData.emergingTrends;
    // Filter by platform if specified
    if (platform) {
      emergingTrends = emergingTrends.filter(
        t => t.platforms.includes(platform) || t.platforms.length === 0
      );
    }
  } catch (err) {
    console.warn("[trendIntelligence] detectViralPatterns failed:", err);
  }

  // ─── 2. Hot topics this week (7 days) ─────────────────────────────
  const recentPosts = await prisma.post.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      ...platformFilter,
    },
    select: {
      mainTopic: true,
      platform: true,
      engagementRate: true,
    },
  });

  const topicMap = new Map<string, { count: number; totalEngagement: number; platforms: Set<string> }>();
  for (const post of recentPosts) {
    const topic = post.mainTopic || "Không phân loại";
    const existing = topicMap.get(topic) || { count: 0, totalEngagement: 0, platforms: new Set<string>() };
    existing.count++;
    existing.totalEngagement += post.engagementRate;
    existing.platforms.add(post.platform);
    topicMap.set(topic, existing);
  }

  const hotTopicsThisWeek = [...topicMap.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([topic, v]) => ({
      topic,
      postCount: v.count,
      avgEngagement: v.count > 0 ? v.totalEngagement / v.count : 0,
      platforms: [...v.platforms],
    }))
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, 8);

  // ─── 3. Rising engagement: compare last 7d vs previous 7d ────────
  const prevPosts = await prisma.post.findMany({
    where: {
      publishedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      ...platformFilter,
    },
    select: {
      mainTopic: true,
      engagementRate: true,
    },
  });

  const prevTopicMap = new Map<string, { count: number; totalEngagement: number }>();
  for (const post of prevPosts) {
    const topic = post.mainTopic || "Không phân loại";
    const existing = prevTopicMap.get(topic) || { count: 0, totalEngagement: 0 };
    existing.count++;
    existing.totalEngagement += post.engagementRate;
    prevTopicMap.set(topic, existing);
  }

  const risingEngagement: TrendIntelligence["risingEngagement"] = [];
  for (const [topic, current] of topicMap.entries()) {
    const prev = prevTopicMap.get(topic);
    if (!prev || prev.count < 1) continue;
    const currentAvg = current.totalEngagement / current.count;
    const prevAvg = prev.totalEngagement / prev.count;
    if (prevAvg > 0 && currentAvg > prevAvg) {
      const growth = ((currentAvg - prevAvg) / prevAvg) * 100;
      if (growth >= 10) { // Only show >10% growth
        risingEngagement.push({
          topic,
          currentAvgEngagement: currentAvg,
          previousAvgEngagement: prevAvg,
          growthPercent: parseFloat(growth.toFixed(1)),
        });
      }
    }
  }
  risingEngagement.sort((a, b) => b.growthPercent - a.growthPercent);

  // ─── 4. Competitor movements (last 7 days) ───────────────────────
  const competitorPosts = await prisma.post.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      ...platformFilter,
    },
    select: {
      mainTopic: true,
      engagementRate: true,
      competitor: { select: { name: true } },
    },
  });

  const compMap = new Map<string, { topics: Set<string>; count: number; totalEngagement: number }>();
  for (const post of competitorPosts) {
    const name = post.competitor.name;
    const existing = compMap.get(name) || { topics: new Set<string>(), count: 0, totalEngagement: 0 };
    if (post.mainTopic) existing.topics.add(post.mainTopic);
    existing.count++;
    existing.totalEngagement += post.engagementRate;
    compMap.set(name, existing);
  }

  const competitorMovements = [...compMap.entries()]
    .map(([competitor, v]) => ({
      competitor,
      recentTopics: [...v.topics].slice(0, 5),
      postCountLast7d: v.count,
      avgEngagement: v.count > 0 ? v.totalEngagement / v.count : 0,
    }))
    .sort((a, b) => b.postCountLast7d - a.postCountLast7d)
    .slice(0, 6);

  // ─── 5. Suggested angles ─────────────────────────────────────────
  const suggestedAngles: string[] = [];

  // Rising topics that competitors haven't fully exploited
  for (const rising of risingEngagement.slice(0, 3)) {
    suggestedAngles.push(
      `"${rising.topic}" — engagement tăng ${rising.growthPercent}% tuần này, nên khai thác nhanh`
    );
  }

  // Hot topics with high engagement
  for (const hot of hotTopicsThisWeek.filter(t => t.avgEngagement > 0.03).slice(0, 3)) {
    suggestedAngles.push(
      `"${hot.topic}" — ${hot.postCount} bài tuần này, engagement BQ ${(hot.avgEngagement * 100).toFixed(1)}%`
    );
  }

  // Emerging trends
  for (const trend of emergingTrends.slice(0, 2)) {
    suggestedAngles.push(
      `🔥 Xu hướng mới: "${trend.topic}" — tăng ${trend.growthRate.toFixed(0)}%, ${trend.postCount} bài`
    );
  }

  const result: TrendIntelligence = {
    emergingTrends,
    hotTopicsThisWeek,
    risingEngagement: risingEngagement.slice(0, 6),
    competitorMovements,
    suggestedAngles: suggestedAngles.slice(0, 6),
  };

  trendCache = { data: result, platform: cacheKey, timestamp: Date.now() };
  return result;
}
