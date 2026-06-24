import { NextResponse } from "next/server";
import { authenticateRequest, checkRateLimit, apiSuccess, apiError } from "@/lib/publicApi";
import { getFilteredPosts } from "@/lib/analytics";
import { getCompetitors } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/v1/posts — Public API: lấy danh sách posts
 * HEADERS: Authorization: Bearer sk-...
 * QUERY: ?platform=youtube&days=30&limit=10
 */
export async function GET(request: Request) {
  // Authenticate
  const auth = await authenticateRequest(request, "read");
  if (!auth.authenticated) return auth.response;

  // Rate limit
  const rateLimit = checkRateLimit(auth.context.teamId, 100);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimit.resetAt),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") || "posts";

  try {
    switch (path) {
      case "posts": {
        const posts = await getFilteredPosts(
          {
            platform: (searchParams.get("platform") ?? "all") as "youtube" | "tiktok" | "facebook" | "all",
            days: Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30))),
            sortBy: (searchParams.get("sortBy") ?? "engagement") as "engagement" | "views" | "comments" | "newest",
          },
          Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20)))
        );
        return apiSuccess(posts.map((p) => ({
          id: p.id,
          platform: p.platform,
          title: p.title,
          caption: p.caption?.slice(0, 500),
          publishedAt: p.publishedAt,
          contentPillar: p.contentPillar,
          engagementRate: p.engagementRate,
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          competitor: { name: p.competitor.name, platform: p.competitor.platform },
        })));
      }

      case "competitors": {
        const competitors = await getCompetitors({
          platform: (searchParams.get("platform") ?? undefined) as "youtube" | "tiktok" | "facebook" | undefined,
        });
        return apiSuccess(competitors);
      }

      case "content": {
        const items = await prisma.generatedContent.findMany({
          where: {
            ...(searchParams.get("platform") ? { platform: searchParams.get("platform")! } : {}),
            ...(searchParams.get("status") ? { status: searchParams.get("status")! } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: Math.min(50, Number(searchParams.get("limit") ?? 20)),
        });
        return apiSuccess(items.map((item) => ({
          id: item.id,
          platform: item.platform,
          contentType: item.contentType,
          title: item.title,
          script: item.script.slice(0, 2000),
          status: item.status,
          createdAt: item.createdAt,
        })));
      }

      case "stats": {
        const totalPosts = await prisma.post.count();
        const totalCompetitors = await prisma.competitor.count();
        const totalContent = await prisma.generatedContent.count();
        const postsByPlatform = await prisma.post.groupBy({
          by: ["platform"],
          _count: true,
        });
        return apiSuccess({
          totalPosts,
          totalCompetitors,
          totalContent,
          postsByPlatform: postsByPlatform.map((p) => ({ platform: p.platform, count: p._count })),
        });
      }

      default:
        return apiError(`Unknown path: ${path}. Available: posts, competitors, content, stats`, 404);
    }
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Internal error", 500);
  }
}
