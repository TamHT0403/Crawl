/**
 * Natural Language Query Engine
 *
 * Cho phép user hỏi bằng tiếng Việt tự nhiên → phân tích → trả lời thông minh.
 * Dùng OpenAI function calling để translate NL → analytics queries.
 */

import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import { getFilteredPosts, getCompetitors, getOverviewAnalytics, getContentGapAnalytics, getPlatformAnalytics } from "@/lib/analytics";
import type { NLQueryResponse, Platform } from "@/lib/types";
import { aggregatePosts, competitorSummaries } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

export async function answerQuestion(question: string): Promise<NLQueryResponse> {
  // Normalize question
  const q = question.trim().toLowerCase();

  // ─── 1. Try rule-based for common patterns (fast, no API call) ────
  const ruleResult = await tryRuleBased(q);
  if (ruleResult) return ruleResult;

  // ─── 2. AI-powered for complex questions ──────────────────────────
  if (await isOpenAIConfigured()) {
    return aiAnswer(question);
  }

  return {
    answer: "❌ OpenAI chưa được cấu hình. Vui lòng thêm OPENAI_API_KEY vào .env để sử dụng tính năng hỏi đáp thông minh.\n\nCác câu hỏi có thể trả lời ngay:\n- Đối thủ có bao nhiêu?\n- Bài viết có engagement cao nhất?\n- Trụ cột nội dung nào hiệu quả?\n- Nền tảng nào đang hoạt động tốt?",
    confidence: "low",
    suggestedActions: ["Thêm OPENAI_API_KEY vào .env"],
  };
}

async function tryRuleBased(q: string): Promise<NLQueryResponse | null> {
  // ─── Số lượng đối thủ ─────────────────────────────────────────────
  if (/\b(bao nhiêu|mấy|đếm|tổng số|count|how many)\b.*(đối thủ|competitor|kênh|page)\b/i.test(q)) {
    return countCompetitors(q);
  }

  // ─── Bài viết/video hiệu quả nhất ─────────────────────────────────
  if (/\b(bài (viết|nào|post)|video (nào|clip)|top|hiệu quả|engagement|tương tác)\b.*\b(nhất|cao|best|top)\b/i.test(q)) {
    return topPosts(q);
  }

  // ─── Trụ cột nội dung ─────────────────────────────────────────────
  if (/\b(trụ cột|content pillar|chủ đề|nội dung)\b.*\b(hiệu quả|nào|gì|effort)\b/i.test(q)) {
    return topPillars(q);
  }

  // ─── Nền tảng nào tốt ─────────────────────────────────────────────
  if (/\b(nền tảng|platform|kênh)\b.*\b(tốt|hiệu quả|nào|phù hợp)\b/i.test(q)) {
    return platformEffectiveness();
  }

  // ─── Content gap ──────────────────────────────────────────────────
  if (/\b(khoảng trống|gap|nên làm|cơ hội|chưa)\b.*\b(nội dung|content|làm gì|chủ đề)\b/i.test(q)) {
    return contentGaps();
  }

  // ─── YouTube publish status ───────────────────────────────────────
  if (/\b(youtube|publish|đăng)\b.*\b(trạng thái|kết nối|status|connected)\b/i.test(q)) {
    return youtubeStatus();
  }

  // ─── Tổng quan nhanh ──────────────────────────────────────────────
  if (/\b(tổng quan|overview|dashboard|summary|tình hình)\b/i.test(q)) {
    return quickOverview();
  }

  return null;
}

async function countCompetitors(q: string): Promise<NLQueryResponse> {
  const platform = extractPlatform(q);
  const competitors = await getCompetitors(platform ? { platform } : {});
  const total = competitors.length;
  const byPlatform = groupByPlatform(competitors);

  const detail = Object.entries(byPlatform)
    .map(([p, c]) => `  - ${capitalize(p)}: ${c.length} đối thủ`)
    .join("\n");

  return {
    answer: `📊 Hệ thống đang theo dõi **${total} đối thủ** trên các nền tảng:\n${detail}`,
    confidence: "high",
    data: { total, byPlatform },
  };
}

async function topPosts(q: string): Promise<NLQueryResponse> {
  const platform = extractPlatform(q);
  const source = extractSource(q);
  const limit = /\b(\d+)\b/.test(q) ? parseInt(q.match(/\b(\d+)\b/)![1]) : 5;

  const posts = await getFilteredPosts({
    platform: platform ?? "all",
    source: source ?? undefined,
    days: 30,
    sortBy: "engagement",
  }, limit);

  if (posts.length === 0) {
    return { answer: "⚠️ Chưa có dữ liệu bài viết trong 30 ngày qua.", confidence: "low" };
  }

  const list = posts.slice(0, limit).map((p, i) =>
    `${i + 1}. "${p.title}" — ${p.competitor.name} (${capitalize(p.platform)})\n   ${p.contentPillar} · engagement ${(p.engagementRate * 100).toFixed(1)}%`
  ).join("\n\n");

  return {
    answer: `🏆 **Top ${limit} bài viết có tỷ lệ tương tác cao nhất (30 ngày):**\n\n${list}`,
    confidence: "high",
    data: { posts: posts.slice(0, limit) },
  };
}

async function topPillars(q: string): Promise<NLQueryResponse> {
  const platform = extractPlatform(q);
  const posts = await getFilteredPosts({ platform: platform ?? "all", days: 90 });
  const pillars = aggregatePosts(posts, "contentPillar").slice(0, 6);

  if (pillars.length === 0) {
    return { answer: "⚠️ Chưa có đủ dữ liệu để phân tích trụ cột nội dung.", confidence: "low" };
  }

  const list = pillars.map((p, i) =>
    `${i + 1}. **${p.name}**: ${p.count} bài · engagement ${(p.avgEngagement * 100).toFixed(1)}%`
  ).join("\n");

  return {
    answer: `📚 **Trụ cột nội dung hiệu quả nhất (90 ngày):**\n\n${list}`,
    confidence: "high",
    data: { pillars },
  };
}

async function platformEffectiveness(): Promise<NLQueryResponse> {
  const overview = await getOverviewAnalytics({ days: 30 });

  const list = overview.platformEffectiveness.map((p) =>
    `- **${capitalize(p.platform)}**: ${p.postCount} bài · engagement ${p.avgEngagement.toFixed(2)}% · ${p.decision}`
  ).join("\n");

  const best = overview.platformEffectiveness.sort((a, b) => b.avgEngagement - a.avgEngagement)[0];

  return {
    answer: `📱 **Hiệu quả các nền tảng (30 ngày):**\n\n${list}\n\n💡 **Khuyến nghị:** ${best ? best.insight : "Tiếp tục theo dõi thêm dữ liệu."}`,
    confidence: "high",
    data: { platformEffectiveness: overview.platformEffectiveness },
    suggestedActions: best ? [best.insight] : undefined,
  };
}

async function contentGaps(): Promise<NLQueryResponse> {
  const gap = await getContentGapAnalytics({ days: 90 });

  const gaps = gap.domestic.gaps.slice(0, 5).map((g) => `- ${g}`).join("\n");
  const suggestions = gap.domestic.suggestions.slice(0, 3).map((s) => `- ${s}`).join("\n");

  return {
    answer: `🎯 **Khoảng trống nội dung cho Kolia:**\n\n${gaps}\n\n**Gợi ý tuyến bài:**\n${suggestions}`,
    confidence: "high",
    data: { gaps: gap.domestic, foreign: gap.foreign },
  };
}

async function youtubeStatus(): Promise<NLQueryResponse> {
  const setting = await prisma.setting.findUnique({ where: { key: "youtube_tokens" } });
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID);
  const connected = Boolean(setting);

  return {
    answer: connected
      ? "✅ **YouTube đã kết nối!** Có thể đăng video trực tiếp từ Content Library."
      : configured
        ? "⚠️ YouTube đã cấu hình OAuth nhưng chưa có token. Vào Settings → kết nối YouTube."
        : "❌ YouTube chưa được cấu hình. Thêm GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET vào .env",
    confidence: "high",
    data: { configured, connected },
    suggestedActions: connected
      ? undefined
      : ["Cấu hình Google OAuth trong .env", "Vào Settings để kết nối YouTube"],
  };
}

async function quickOverview(): Promise<NLQueryResponse> {
  const overview = await getOverviewAnalytics({ days: 30 });
  const topPillar = overview.topPillars[0];
  const bestPlatform = overview.platformEffectiveness.sort((a, b) => b.avgEngagement - a.avgEngagement)[0];

  return {
    answer: `📊 **Tổng quan 30 ngày:**\n\n` +
      `- 👥 **${overview.totalCompetitors}** đối thủ\n` +
      `- 📝 **${overview.totalPosts}** bài viết/video\n` +
      `- 📈 Engagement BQ: **${(overview.avgEngagement * 100).toFixed(1)}%**\n` +
      `- 🔥 Trụ cột nổi bật: **${topPillar?.name ?? "N/A"}**\n` +
      `- 📱 Nền tảng tốt nhất: **${bestPlatform ? capitalize(bestPlatform.platform) : "N/A"}**`,
    confidence: "high",
    data: overview,
  };
}

async function aiAnswer(question: string): Promise<NLQueryResponse> {
  const overview = await getOverviewAnalytics({ days: 30 });
  const gap = await getContentGapAnalytics({ days: 90 });

  const context = buildContextSummary(overview, gap);

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `Trả lời câu hỏi về dữ liệu nghiên cứu đối thủ.

**Context data (30-90 ngày)**:
${context}

**Câu hỏi của user**: "${question}"

Trả lời bằng tiếng Việt có dấu, ngắn gọn (2-4 câu), trung lập.
Nếu không đủ dữ liệu, nói rõ.
KHÔNG đưa khuyến nghị đầu tư cá nhân.`;

    const response = await client.responses.create({
      model,
      input: prompt,
      instructions: "Bạn là chuyên gia phân tích content intelligence. Trả lời bằng tiếng Việt, súc tích, dựa trên dữ liệu có sẵn.",
      max_output_tokens: 500,
    });

    return {
      answer: response.output_text,
      confidence: "medium",
      data: { overview, gap },
    };
  } catch (error) {
    return {
      answer: "❌ Lỗi kết nối AI: " + (error instanceof Error ? error.message : "Unknown"),
      confidence: "low",
    };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractPlatform(q: string): Platform | undefined {
  if (/\byoutube\b/i.test(q)) return "youtube";
  if (/\btiktok\b/i.test(q)) return "tiktok";
  if (/\bfacebook\b|\bfb\b/i.test(q)) return "facebook";
  return undefined;
}

function extractSource(q: string): "trong_nuoc" | "nuoc_ngoai" | undefined {
  if (/trong nước|việt nam|việt/i.test(q)) return "trong_nuoc";
  if (/nước ngoài|quốc tế|foreign/i.test(q)) return "nuoc_ngoai";
  return undefined;
}

function groupByPlatform(competitors: Array<{ platform: string }>): Record<string, Array<{ platform: string }>> {
  return competitors.reduce<Record<string, Array<{ platform: string }>>>((acc, c) => {
    acc[c.platform] = acc[c.platform] ?? [];
    acc[c.platform].push(c);
    return acc;
  }, {});
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildContextSummary(
  overview: Awaited<ReturnType<typeof getOverviewAnalytics>>,
  gap: Awaited<ReturnType<typeof getContentGapAnalytics>>
): string {
  return [
    `Tổng quan: ${overview.totalCompetitors} đối thủ, ${overview.totalPosts} bài, engagement BQ ${(overview.avgEngagement * 100).toFixed(1)}%`,
    `Trụ cột: ${overview.topPillars.slice(0, 3).map((p) => `${p.name}(${p.count} bài)`).join(", ")}`,
    `Platform: ${overview.platformEffectiveness.map((p) => `${p.platform} ${p.decision}`).join(", ")}`,
    `Gaps: ${gap.domestic.gaps.slice(0, 3).join("; ")}`,
    `Suggestions: ${gap.domestic.suggestions.slice(0, 2).join("; ")}`,
  ].join("\n");
}
