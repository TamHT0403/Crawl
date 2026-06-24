/**
 * Smart Content Recommendation Engine
 *
 * Phân tích dữ liệu crawl + content gaps → đề xuất nội dung chiến lược.
 * Sử dụng AI để đưa ra recommendations có độ ưu tiên.
 */

import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import { getOverviewAnalytics, getContentGapAnalytics, getFilteredPosts, competitorSummaries } from "@/lib/analytics";
import { getCompetitors } from "@/lib/analytics";
import type { ContentRecommendation, RecommendationReport, Platform } from "@/lib/types";
import { prisma } from "@/lib/prisma";

// ─── Module-level cache ────────────────────────────────────────────────────

type CacheEntry = { data: RecommendationReport; timestamp: number };
const recCache = new Map<string, CacheEntry>();
const CACHE_TTL = 120_000; // 2 phút

export async function generateRecommendations(days = 30): Promise<RecommendationReport> {
  // Cache hit
  const cacheKey = `days=${days}`;
  const cached = recCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const [overview, gapData, competitors] = await Promise.all([
    getOverviewAnalytics({ days }),
    getContentGapAnalytics({ days }),
    getCompetitors({}),
  ]);

  const recommendations: ContentRecommendation[] = [];

  // ─── 1. Rule-based: Gap recommendations ───────────────────────────
  for (const gap of gapData.domestic.gaps.slice(0, 4)) {
    recommendations.push({
      id: `gap-${recommendations.length}`,
      type: "gap",
      priority: "high",
      platform: "youtube",
      title: `Khai thác: ${gap.slice(0, 80)}`,
      reason: "Khoảng trống nội dung đối thủ chưa khai thác — cơ hội chiếm lĩnh chủ đề.",
      expectedImpact: "Cao — ít cạnh tranh, nhu cầu tìm kiếm có sẵn.",
      action: `Tạo video phân tích hoặc short về "${gap.slice(0, 60)}"`,
    });
  }

  for (const suggestion of gapData.domestic.suggestions.slice(0, 3)) {
    recommendations.push({
      id: `suggest-${recommendations.length}`,
      type: "experiment",
      priority: "medium",
      platform: "tiktok",
      title: suggestion.slice(0, 100),
      reason: "Gợi ý từ phân tích content gap — format có engagement tốt ở đối thủ.",
      expectedImpact: "Trung bình — cần thử nghiệm để đo hiệu quả thực tế.",
      action: `Thực hiện "${suggestion.slice(0, 60)}" trên TikTok`,
    });
  }

  // ─── 2. Platform effectiveness ────────────────────────────────────
  for (const pe of overview.platformEffectiveness) {
    if (pe.decision === "Cơ hội thử nghiệm") {
      recommendations.push({
        id: `platform-${recommendations.length}`,
        type: "experiment",
        priority: "high",
        platform: pe.platform as Platform,
        title: `Tăng cường nội dung trên ${pe.platform === "youtube" ? "YouTube" : pe.platform === "tiktok" ? "TikTok" : "Facebook"}`,
        reason: pe.insight,
        expectedImpact: "Cao — nền tảng có tín hiệu tương tác tốt nhưng chưa được đầu tư đúng mức.",
        action: `Tăng tần suất đăng bài trên ${pe.platform} lên gấp đôi trong 30 ngày`,
      });
    }
    if (pe.decision === "Cần tối ưu chất lượng") {
      recommendations.push({
        id: `optimize-${recommendations.length}`,
        type: "improvement",
        priority: "medium",
        platform: pe.platform as Platform,
        title: `Tối ưu chất lượng nội dung ${pe.platform === "youtube" ? "YouTube" : pe.platform === "tiktok" ? "TikTok" : "Facebook"}`,
        reason: pe.insight,
        expectedImpact: "Trung bình — cải thiện hook, CTA và format.",
        action: `Rà soát hook và CTA cho các bài đăng ${pe.platform}`,
      });
    }
  }

  // ─── 3. AI-powered recommendations ─────────────────────────────────
  if (await isOpenAIConfigured()) {
    try {
      const aiRecs = await aiRecommendations(overview, gapData, days);
      recommendations.push(...aiRecs);
    } catch (error) {
      console.warn("[recommender] AI recommendations failed:", error);
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  const summary = buildSummary(recommendations);

  const report: RecommendationReport = {
    recommendations,
    summary,
    generatedAt: new Date().toISOString(),
  };

  recCache.set(cacheKey, { data: report, timestamp: Date.now() });
  return report;
}

async function aiRecommendations(
  overview: Awaited<ReturnType<typeof getOverviewAnalytics>>,
  gapData: Awaited<ReturnType<typeof getContentGapAnalytics>>,
  days: number
): Promise<ContentRecommendation[]> {
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  const topPosts = overview.topPosts.slice(0, 5).map(
    (p) => `- "${p.title}" (${p.competitor?.name ?? "unknown"}): ${p.contentPillar}, engagement ${(p.engagementRate * 100).toFixed(1)}%`
  ).join("\n");

  const gaps = gapData.domestic.gaps.slice(0, 3).map((g) => `- ${g}`).join("\n");
  const foreignPatterns = gapData.foreign.viralPatterns.slice(0, 3).map((p) => `- ${p}`).join("\n");

  const prompt = `Phân tích dữ liệu nghiên cứu đối thủ (${days} ngày) và đề xuất 3 chiến lược nội dung ưu tiên cao nhất cho Kolia Phan (kênh tài chính đầu tư).

**Dữ liệu tổng quan**:
- ${overview.totalCompetitors} đối thủ, ${overview.totalPosts} bài viết
- Trụ cột nổi bật: ${overview.topPillars.slice(0, 3).map((p) => p.name).join(", ")}
- Nền tảng: ${overview.platformEffectiveness.map((p) => `${p.platform} (${p.decision})`).join(", ")}

**Top bài hiệu quả**:
${topPosts}

**Khoảng trống nội dung**:
${gaps}

**Pattern viral từ nước ngoài**:
${foreignPatterns}

Trả về JSON array:
[{ "title": "string", "reason": "string", "expectedImpact": "string", "platform": "youtube|tiktok|facebook", "action": "string", "priority": "high|medium|low" }]`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: "Bạn là chuyên gia content strategy. Trả lời JSON array thuần, không markdown. Mỗi item phải có đủ các field.",
    max_output_tokens: 1000,
  });

  try {
    const jsonMatch = response.output_text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        title: string; reason: string; expectedImpact: string;
        platform: string; action: string; priority: string;
      }>;
      return parsed.map((item, i) => ({
        id: `ai-${i}`,
        type: "trend" as const,
        priority: item.priority as "high" | "medium" | "low",
        platform: item.platform as Platform,
        title: item.title.slice(0, 120),
        reason: item.reason.slice(0, 200),
        expectedImpact: item.expectedImpact.slice(0, 100),
        action: item.action.slice(0, 200),
      }));
    }
  } catch {
    // fallback
  }

  return [];
}

function buildSummary(recommendations: ContentRecommendation[]): string {
  const high = recommendations.filter((r) => r.priority === "high").length;
  const medium = recommendations.filter((r) => r.priority === "medium").length;
  const low = recommendations.filter((r) => r.priority === "low").length;
  const platforms = [...new Set(recommendations.map((r) => r.platform))];
  const types = [...new Set(recommendations.map((r) => r.type))];

  return [
    `📋 ${recommendations.length} đề xuất chiến lược`,
    `  - Ưu tiên cao: ${high} | Trung bình: ${medium} | Thấp: ${low}`,
    `  - Nền tảng: ${platforms.join(", ")}`,
    `  - Loại: ${types.join(", ")}`,
    `  - Top đề xuất: "${recommendations[0]?.title ?? ""}"`,
  ].join("\n");
}
