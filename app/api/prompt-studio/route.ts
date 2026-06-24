import { NextResponse } from "next/server";
import { getContentGapAnalytics, getOverviewAnalytics } from "@/lib/analytics";
import { getOpenAIModel, isOpenAIConfigured } from "@/lib/openai";
import { fetchMarketSnapshot } from "@/lib/marketData";
import { getTrendIntelligence } from "@/lib/trendIntelligence";
import type { Platform } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Module-level cache keyed by platform
let cached: Record<string, { data: any; timestamp: number }> = {};
const CACHE_TTL = 120_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platformParam = searchParams.get("platform") || "all";
  const daysParam = searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 30; // Mặc định về 30 ngày để dữ liệu tươi mới hơn

  const cacheKey = `${platformParam}_days_${days}`;
  if (cached[cacheKey] && Date.now() - cached[cacheKey].timestamp < CACHE_TTL) {
    return NextResponse.json(cached[cacheKey].data);
  }

  try {
    const filterPlatform = platformParam === "all" ? undefined : platformParam;
    
    // For trends: if it's a single platform, pass it. If multiple, pass undefined (all)
    const trendPlatform = platformParam !== "all" && !platformParam.includes(",") 
      ? platformParam as Platform 
      : undefined;

    const [gap, overview, marketSnapshot, trends] = await Promise.all([
      getContentGapAnalytics({ days, platform: filterPlatform as any }),
      getOverviewAnalytics({ days, platform: filterPlatform as any }),
      fetchMarketSnapshot(),
      getTrendIntelligence(trendPlatform),
    ]);

    const targetPlatforms = platformParam === "all"
      ? ["facebook", "youtube", "tiktok"]
      : platformParam.split(",");

    const lessonPosts = targetPlatforms.flatMap((pf) =>
      overview.topPosts
        .filter((post: any) => post.platform === pf)
        .slice(0, 18)
        .map((post: any) => ({
          title: post.title,
          competitor: post.competitor?.name ?? "",
          platform: post.platform as Platform,
          contentPillar: post.contentPillar,
          hookType: post.hookType,
          toneOfVoice: post.toneOfVoice,
          mainTopic: post.mainTopic,
          sourceUrl: post.postUrl,
          // Engagement metrics for rich display & generation
          views: post.views ?? 0,
          likes: post.likes ?? 0,
          comments: post.comments ?? 0,
          shares: post.shares ?? 0,
          engagementRate: post.engagementRate ?? 0,
          viralityScore: post.viralityScore ?? 0,
          captionPreview: (post.caption ?? "").slice(0, 200),
        }))
    );

    const formulas = [...gap.foreign.shortForm, ...gap.foreign.longForm].slice(0, 6);

    // Count posts per platform for UI badge
    const postCountByPlatform: Record<string, number> = {};
    for (const p of overview.platformPostCounts ?? []) {
      postCountByPlatform[p.platform] = p.posts ?? 0;
    }
    // Fallback: count from platformEffectiveness if platformPostCounts not available
    if (Object.keys(postCountByPlatform).length === 0 && overview.platformEffectiveness) {
      for (const pe of overview.platformEffectiveness) {
        postCountByPlatform[pe.platform] = pe.postCount ?? 0;
      }
    }

    const result = {
      configured: await isOpenAIConfigured(),
      model: await getOpenAIModel(),
      domestic: gap.domestic,
      formulas,
      lessonPosts,
      // NEW — v4 intelligence
      marketSnapshot,
      trends,
      postCountByPlatform,
    };
    cached[cacheKey] = { data: result, timestamp: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    console.error("[prompt-studio] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
