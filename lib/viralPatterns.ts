/**
 * Viral Pattern Recognition Engine
 *
 * Phân tích dữ liệu post để phát hiện pattern viral:
 * - Clustering theo engagement/virality score
 * - Phát hiện emerging trends
 * - Seasonal pattern detection
 * - AI-powered pattern explanation
 */

import { prisma } from "@/lib/prisma";
import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import type { Platform } from "@/lib/types";

// ─── Module-level cache ────────────────────────────────────────────────────

type CacheEntry = {
  data: { patterns: ViralPattern[]; clusters: ViralCluster[]; emergingTrends: EmergingTrend[] } | null;
  timestamp: number;
};
const resultCache = new Map<string, CacheEntry>();
const CACHE_TTL = 120_000; // 2 phút

export type ViralPattern = {
  id: string;
  type: "hook" | "format" | "topic" | "timing" | "structure";
  name: string;
  description: string;
  avgEngagement: number;
  sampleCount: number;
  confidence: number; // 0-1
  examplePost?: { title: string; url: string; competitor: string };
  platform: Platform;
};

export type ViralCluster = {
  id: string;
  label: string;
  posts: Array<{ title: string; engagementRate: number; viralityScore: number; platform: string }>;
  avgEngagement: number;
  avgVirality: number;
  commonPatterns: string[];
  size: number;
};

export type EmergingTrend = {
  topic: string;
  growthRate: number; // % increase in last 30 days vs previous 30
  postCount: number;
  avgEngagement: number;
  platforms: Platform[];
  description: string;
};

/**
 * Phát hiện pattern viral từ dữ liệu posts
 */
export async function detectViralPatterns(days = 90): Promise<{
  patterns: ViralPattern[];
  clusters: ViralCluster[];
  emergingTrends: EmergingTrend[];
}> {
  // Cache hit
  const cacheKey = `days=${days}`;
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data ?? { patterns: [], clusters: [], emergingTrends: [] };
  }

  // Optimized query: chỉ lấy fields cần thiết, tránh include competitor
  const posts = await prisma.post.findMany({
    where: {
      publishedAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      title: true,
      caption: true,
      platform: true,
      engagementRate: true,
      viralityScore: true,
      contentPillar: true,
      hookType: true,
      format: true,
      mainTopic: true,
      postUrl: true,
      competitor: { select: { name: true } },
    },
    orderBy: { engagementRate: "desc" },
  });

  if (posts.length === 0) {
    return { patterns: [], clusters: [], emergingTrends: [] };
  }

  // ─── 1. Pattern Detection ────────────────────────────────────────
  const patterns = await detectPatterns(posts);

  // ─── 2. Clustering ───────────────────────────────────────────────
  const clusters = buildClusters(posts);

  // ─── 3. Emerging Trends ──────────────────────────────────────────
  const emergingTrends = await detectEmergingTrends(days);

  const result = { patterns, clusters, emergingTrends };
  resultCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

async function detectPatterns(
  posts: Array<{ title: string; caption: string; platform: string; engagementRate: number; viralityScore: number; contentPillar: string; hookType: string; format: string; competitor: { name: string }; postUrl: string }>
): Promise<ViralPattern[]> {
  const patterns: ViralPattern[] = [];
  const topPosts = posts.filter((p) => p.engagementRate > 0.05).slice(0, 50);

  if (topPosts.length < 5) return [];

  // ─── Hook pattern analysis ───────────────────────────────────────
  const hookGroups = groupBy(topPosts, (p) => p.hookType);
  for (const [hook, group] of Object.entries(hookGroups)) {
    if (group.length >= 2) {
      patterns.push({
        id: `hook-${hook}`,
        type: "hook",
        name: `Hook "${hook}"`,
        description: `Nội dung dùng hook "${hook}" có engagement BQ ${(avg(group, "engagementRate") * 100).toFixed(1)}%`,
        avgEngagement: avg(group, "engagementRate"),
        sampleCount: group.length,
        confidence: Math.min(group.length / 10, 1),
        examplePost: {
          title: group[0].title.slice(0, 100),
          url: group[0].postUrl,
          competitor: group[0].competitor.name,
        },
        platform: group[0].platform as Platform,
      });
    }
  }

  // ─── Format pattern analysis ─────────────────────────────────────
  const formatGroups = groupBy(topPosts, (p) => p.format);
  for (const [fmt, group] of Object.entries(formatGroups)) {
    if (group.length >= 2) {
      patterns.push({
        id: `format-${fmt}`,
        type: "format",
        name: `Format "${fmt}"`,
        description: `Định dạng ${fmt} đạt virality BQ ${avg(group, "viralityScore").toFixed(1)}`,
        avgEngagement: avg(group, "engagementRate"),
        sampleCount: group.length,
        confidence: Math.min(group.length / 8, 1),
        platform: group[0].platform as Platform,
      });
    }
  }

  // ─── AI-powered pattern discovery ────────────────────────────────
  if ((await isOpenAIConfigured()) && topPosts.length >= 10) {
    try {
      const aiPatterns = await aiDiscoverPatterns(topPosts);
      patterns.push(...aiPatterns);
    } catch (err) {
      console.warn("[viral-patterns] AI discovery failed:", err);
    }
  }

  // Sort by engagement descending
  return patterns.sort((a, b) => b.avgEngagement - a.avgEngagement);
}

async function aiDiscoverPatterns(
  topPosts: Array<{ title: string; engagementRate: number; contentPillar: string; hookType: string; format: string; platform: string; competitor: { name: string } }>
): Promise<ViralPattern[]> {
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  const samples = topPosts.slice(0, 15).map((p, i) =>
    `${i + 1}. "${p.title}" - ${p.competitor.name} - ${p.contentPillar} - hook:${p.hookType} - engagement:${(p.engagementRate * 100).toFixed(1)}%`
  ).join("\n");

  const prompt = `Phân tích 15 bài viết có engagement cao nhất và phát hiện 3 pattern viral đang hoạt động:

${samples}

Trả về JSON array:
[{
  "type": "hook|format|topic|structure",
  "name": "tên pattern",
  "description": "mô tả ngắn",
  "avgEngagement": 0.0 (0-1)
}]`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: "Bạn là chuyên gia content intelligence. Trả lời JSON array thuần.",
    max_output_tokens: 500,
  });

  try {
    const jsonMatch = response.output_text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ type: string; name: string; description: string; avgEngagement: number }>;
      return parsed.map((p, i) => ({
        id: `ai-pattern-${i}`,
        type: p.type as ViralPattern["type"],
        name: p.name,
        description: p.description,
        avgEngagement: p.avgEngagement,
        sampleCount: topPosts.length,
        confidence: 0.5,
        platform: topPosts[0].platform as Platform,
      }));
    }
  } catch { /* ignore */ }

  return [];
}

function buildClusters(
  posts: Array<{ title: string; engagementRate: number; viralityScore: number; platform: string; contentPillar: string; hookType: string; format: string }>
): ViralCluster[] {
  const clusters: ViralCluster[] = [];

  // Cluster by contentPillar + high engagement
  const pillarGroups = groupBy(posts, (p) => p.contentPillar);
  for (const [pillar, group] of Object.entries(pillarGroups)) {
    const highEngagement = group.filter((p) => p.engagementRate > 0.03);
    if (highEngagement.length >= 3) {
      clusters.push({
        id: `cluster-${pillar}`,
        label: `Cụm "${pillar}" engagement cao`,
        posts: highEngagement.slice(0, 10).map((p) => ({
          title: p.title.slice(0, 100),
          engagementRate: p.engagementRate,
          viralityScore: p.viralityScore,
          platform: p.platform,
        })),
        avgEngagement: avg(highEngagement, "engagementRate"),
        avgVirality: avg(highEngagement, "viralityScore"),
        commonPatterns: extractCommonPatterns(highEngagement),
        size: highEngagement.length,
      });
    }
  }

  return clusters.sort((a, b) => b.avgEngagement - a.avgEngagement);
}

async function detectEmergingTrends(days: number): Promise<EmergingTrend[]> {
  const trends: EmergingTrend[] = [];
  const now = new Date();
  const current = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previous = new Date(current.getTime() - days * 24 * 60 * 60 * 1000);

  // Count posts by mainTopic in current period vs previous (parallel queries)
  const [currentPosts, previousPosts] = await Promise.all([
    prisma.post.findMany({
      where: { publishedAt: { gte: current } },
      select: { mainTopic: true, platform: true, engagementRate: true },
    }),
    prisma.post.findMany({
      where: { publishedAt: { gte: previous, lt: current } },
      select: { mainTopic: true, platform: true, engagementRate: true },
    }),
  ]);

  const currentByTopic = groupBy(currentPosts, (p) => p.mainTopic);
  const previousByTopic = groupBy(previousPosts, (p) => p.mainTopic);

  for (const [topic, curGroup] of Object.entries(currentByTopic)) {
    const prevGroup = previousByTopic[topic] ?? [];
    const prevCount = prevGroup.length || 1; // avoid division by zero
    const growthRate = ((curGroup.length - prevCount) / prevCount) * 100;

    if (growthRate > 20 && curGroup.length >= 3) {
      trends.push({
        topic,
        growthRate,
        postCount: curGroup.length,
        avgEngagement: avg(curGroup, "engagementRate"),
        platforms: [...new Set(curGroup.map((p) => p.platform as Platform))],
        description: `Chủ đề "${topic}" tăng ${growthRate.toFixed(0)}% so với kỳ trước`,
      });
    }
  }

  return trends.sort((a, b) => b.growthRate - a.growthRate);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], getKey: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});
}

function avg<T>(items: T[], field: keyof T): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + (item[field] as number), 0) / items.length;
}

function extractCommonPatterns(
  posts: Array<{ hookType: string; format: string; contentPillar: string }>
): string[] {
  const patterns: string[] = [];
  const hookCounts: Record<string, number> = {};
  const formatCounts: Record<string, number> = {};

  for (const p of posts) {
    hookCounts[p.hookType] = (hookCounts[p.hookType] ?? 0) + 1;
    formatCounts[p.format] = (formatCounts[p.format] ?? 0) + 1;
  }

  const topHook = Object.entries(hookCounts).sort((a, b) => b[1] - a[1])[0];
  const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0];

  if (topHook && topHook[1] >= posts.length * 0.3) {
    patterns.push(`Hook "${topHook[0]}" xuất hiện trong ${((topHook[1] / posts.length) * 100).toFixed(0)}% bài`);
  }
  if (topFormat && topFormat[1] >= posts.length * 0.3) {
    patterns.push(`Format "${topFormat[0]}" chiếm ${((topFormat[1] / posts.length) * 100).toFixed(0)}%`);
  }

  return patterns;
}
