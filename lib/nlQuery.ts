/**
 * Natural Language Query Engine v2.0
 *
 * Cho phép user hỏi bằng tiếng Việt tự nhiên → phân tích → trả lời thông minh.
 * Dùng OpenAI function calling để translate NL → analytics queries.
 *
 * v2.0 improvements:
 *   - Lightweight analytics (single DB query, 5 aggregations vs 11)
 *   - 2-layer response cache (rule-based 5min, AI 10min)
 *   - Parallel DB + AI calls
 *   - Enriched AI context (top posts, competitors, platform stats)
 *   - Increased max_output_tokens (1200 vs 500)
 *   - AI call timeout (15s)
 *   - Streaming support via callback
 *   - Improved regex patterns for better rule-based coverage
 */

import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import { getCompetitors } from "@/lib/analytics";
import type { NLQueryResponse, Platform } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getNLQueryContext, type NLQueryContext } from "@/lib/nlQueryAnalytics";
import {
  getCachedRuleResponse,
  setCachedRuleResponse,
  getCachedAIResponse,
  setCachedAIResponse,
  setDataFingerprint,
} from "@/lib/nlQueryCache";

// ─── Streaming callback type ──────────────────────────────────────────────

export type StreamCallback = (chunk: string, done: boolean) => void;

// ─── Main entry point ─────────────────────────────────────────────────────

export async function answerQuestion(
  question: string,
  onStream?: StreamCallback,
): Promise<NLQueryResponse> {
  const startTime = Date.now();

  // Normalize question
  const q = question.trim().toLowerCase();

  // ─── 1. Check rule-based cache ──────────────────────────────────────
  const cachedRule = getCachedRuleResponse(q);
  if (cachedRule) {
    onStream?.(cachedRule.answer, true);
    return { ...cachedRule, _meta: { source: "rule-cache", timeMs: Date.now() - startTime } } as NLQueryResponse;
  }

  // ─── 2. Try rule-based for common patterns (fast, no API call) ──────
  const ruleResult = await tryRuleBased(q);
  if (ruleResult) {
    setCachedRuleResponse(q, ruleResult);
    onStream?.(ruleResult.answer, true);
    return { ...ruleResult, _meta: { source: "rule-based", timeMs: Date.now() - startTime } } as NLQueryResponse;
  }

  // ─── 3. Check AI cache ──────────────────────────────────────────────
  const cachedAI = getCachedAIResponse(question);
  if (cachedAI) {
    onStream?.(cachedAI.answer, true);
    return { ...cachedAI, _meta: { source: "ai-cache", timeMs: Date.now() - startTime } } as NLQueryResponse;
  }

  // ─── 4. AI-powered for complex questions ────────────────────────────
  if (await isOpenAIConfigured()) {
    const result = await aiAnswer(question, onStream);
    return { ...result, _meta: { source: "ai", timeMs: Date.now() - startTime } } as NLQueryResponse;
  }

  const fallback: NLQueryResponse = {
    answer:
      "❌ OpenAI chưa được cấu hình. Vui lòng thêm API Key trong Settings → Cấu hình & Bảo mật.\n\nCác câu hỏi có thể trả lời ngay:\n- Đối thủ có bao nhiêu?\n- Bài viết có engagement cao nhất?\n- Trụ cột nội dung nào hiệu quả?\n- Nền tảng nào đang hoạt động tốt?",
    confidence: "low",
    suggestedActions: ["Thêm API Key trong Settings"],
  };
  onStream?.(fallback.answer, true);
  return fallback;
}

// ─── Rule-based matching (improved patterns) ──────────────────────────────

async function tryRuleBased(q: string): Promise<NLQueryResponse | null> {
  // ─── Số lượng đối thủ ───────────────────────────────────────────────
  if (/\b(bao nhiêu|mấy|đếm|tổng số|count|how many|số lượng)\b.*\b(đối thủ|competitor|kênh|page|channel)\b/i.test(q) ||
      /\b(đối thủ|competitor|kênh|page)\b.*\b(bao nhiêu|mấy|đếm|tổng số|count)\b/i.test(q)) {
    return countCompetitors(q);
  }

  // ─── Tổng quan nhanh (moved up for priority) ────────────────────────
  if (/\b(tổng quan|overview|dashboard|summary|tình hình|đang theo dõi|hệ thống)\b/i.test(q)) {
    return quickOverview();
  }

  // ─── Bài viết/video hiệu quả nhất ──────────────────────────────────
  if (/\b(bài|post|video|clip|top|hiệu quả|engagement|tương tác)\b.*\b(nhất|cao|best|top|tốt|dẫn đầu|leading)\b/i.test(q) ||
      /\b(nhất|cao|best|top|tốt|dẫn đầu)\b.*\b(bài|post|video|clip|engagement|tương tác)\b/i.test(q) ||
      /\b(đối thủ)\b.*\b(engagement|tương tác|hiệu quả)\b.*\b(cao|nhất|tốt|dẫn đầu)\b/i.test(q) ||
      /\b(engagement|tương tác)\b.*\b(cao|nhất|tốt|dẫn đầu)\b/i.test(q)) {
    return topPosts(q);
  }

  // ─── Trụ cột nội dung ──────────────────────────────────────────────
  if (/\b(trụ cột|content pillar|chủ đề|nội dung|pillar)\b.*\b(hiệu quả|nào|gì|tốt|effort)\b/i.test(q) ||
      /\b(hiệu quả|tốt)\b.*\b(trụ cột|content pillar|chủ đề|nội dung)\b/i.test(q)) {
    return topPillars();
  }

  // ─── Nền tảng nào tốt ──────────────────────────────────────────────
  if (/\b(nền tảng|platform|kênh)\b.*\b(tốt|hiệu quả|nào|phù hợp|hoạt động)\b/i.test(q) ||
      /\b(hiệu quả|tốt|hoạt động)\b.*\b(nền tảng|platform|kênh)\b/i.test(q)) {
    return platformEffectiveness();
  }

  // ─── Content gap ───────────────────────────────────────────────────
  if (/\b(khoảng trống|gap|nên làm|cơ hội|chưa khai thác|content gap)\b/i.test(q) ||
      /\b(nên|cần)\b.*\b(làm|tạo|sản xuất)\b.*\b(gì|nội dung|content)\b/i.test(q)) {
    return contentGaps();
  }

  // ─── YouTube publish status ─────────────────────────────────────────
  if (/\b(youtube)\b.*\b(trạng thái|kết nối|status|connected|đăng|publish)\b/i.test(q) ||
      /\b(kết nối|connected)\b.*\b(youtube)\b/i.test(q)) {
    return youtubeStatus();
  }

  // ─── Simple Greetings (instantly bypass heavy DB queries) ───────────
  if (/^(hello|hi|xin chào|chào bạn|chào|chao|alo)\b/i.test(q)) {
    return {
      answer: "👋 **Xin chào!** Tôi là trợ lý phân tích dữ liệu đối thủ.\n\nTôi sẵn sàng hỗ trợ phân tích dữ liệu crawl từ YouTube, TikTok và Facebook. Bạn muốn hỏi tôi điều gì? Dưới đây là một số gợi ý:\n- *\"Đối thủ nào đang dẫn đầu về engagement?\"*\n- *\"Nên làm content gì cho TikTok?\"*\n- *\"Tổng quan hệ thống đang theo dõi những gì?\"*",
      confidence: "high",
    };
  }

  return null;
}

// ─── Rule-based handlers (using lightweight analytics) ────────────────────

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
  const ctx = await getNLQueryContext(30);
  updateFingerprint(ctx);

  const limit = /\b(\d+)\b/.test(q) ? parseInt(q.match(/\b(\d+)\b/)![1]) : 5;
  const platform = extractPlatform(q);

  let posts = ctx.topPosts;
  if (platform) {
    posts = posts.filter((p) => p.platform === platform);
  }

  if (posts.length === 0) {
    return { answer: "⚠️ Chưa có dữ liệu bài viết trong 30 ngày qua.", confidence: "low" };
  }

  const list = posts
    .slice(0, limit)
    .map(
      (p, i) =>
        `${i + 1}. **"${p.title}"** — ${p.competitorName} (${capitalize(p.platform)})\n   ${p.contentPillar} · engagement **${(p.engagementRate * 100).toFixed(1)}%** · ${fmtViews(p.views)} views`
    )
    .join("\n\n");

  return {
    answer: `🏆 **Top ${Math.min(limit, posts.length)} bài viết có tỷ lệ tương tác cao nhất (30 ngày):**\n\n${list}`,
    confidence: "high",
    data: { posts: posts.slice(0, limit) },
  };
}

async function topPillars(): Promise<NLQueryResponse> {
  const ctx = await getNLQueryContext(30);
  updateFingerprint(ctx);

  if (ctx.topPillars.length === 0) {
    return { answer: "⚠️ Chưa có đủ dữ liệu để phân tích trụ cột nội dung.", confidence: "low" };
  }

  const list = ctx.topPillars
    .slice(0, 6)
    .map(
      (p, i) =>
        `${i + 1}. **${p.name}**: ${p.count} bài · engagement **${(p.avgEngagement * 100).toFixed(1)}%**`
    )
    .join("\n");

  return {
    answer: `📚 **Trụ cột nội dung hiệu quả nhất (30 ngày):**\n\n${list}`,
    confidence: "high",
    data: { pillars: ctx.topPillars.slice(0, 6) },
  };
}

async function platformEffectiveness(): Promise<NLQueryResponse> {
  const ctx = await getNLQueryContext(30);
  updateFingerprint(ctx);

  const list = ctx.platformEffectiveness
    .map(
      (p) =>
        `- **${capitalize(p.platform)}**: ${p.postCount} bài · engagement **${p.avgEngagement.toFixed(2)}%** · ${p.decision}`
    )
    .join("\n");

  const best = ctx.platformEffectiveness.sort(
    (a, b) => b.avgEngagement - a.avgEngagement
  )[0];

  return {
    answer: `📱 **Hiệu quả các nền tảng (30 ngày):**\n\n${list}\n\n💡 **Khuyến nghị:** ${best ? best.insight : "Tiếp tục theo dõi thêm dữ liệu."}`,
    confidence: "high",
    data: { platformEffectiveness: ctx.platformEffectiveness },
    suggestedActions: best ? [best.insight] : undefined,
  };
}

async function contentGaps(): Promise<NLQueryResponse> {
  const ctx = await getNLQueryContext(30);
  updateFingerprint(ctx);

  const gapList = ctx.gaps.slice(0, 5).map((g) => `- ${g}`).join("\n");
  const suggestionList = ctx.suggestions.slice(0, 3).map((s) => `- ${s}`).join("\n");

  return {
    answer: `🎯 **Khoảng trống nội dung cho Kolia:**\n\n${gapList}\n\n**Gợi ý tuyến bài:**\n${suggestionList}`,
    confidence: "high",
    data: { gaps: ctx.gaps, suggestions: ctx.suggestions },
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
  const ctx = await getNLQueryContext(30);
  updateFingerprint(ctx);

  const bestPlatform = ctx.platformEffectiveness.sort(
    (a, b) => b.avgEngagement - a.avgEngagement
  )[0];
  const topPillar = ctx.topPillars[0];
  const topCompetitor = ctx.topCompetitors[0];

  return {
    answer:
      `📊 **Tổng quan 30 ngày:**\n\n` +
      `- 👥 **${ctx.totalCompetitors}** đối thủ đang theo dõi\n` +
      `- 📝 **${ctx.totalPosts}** bài viết/video\n` +
      `- 📈 Engagement trung bình: **${(ctx.avgEngagement * 100).toFixed(1)}%**\n` +
      `- 💬 Tổng tương tác: **${fmtViews(ctx.totalInteractions)}**\n` +
      `- 🔥 Trụ cột nổi bật: **${topPillar?.name ?? "N/A"}** (${topPillar ? (topPillar.avgEngagement * 100).toFixed(1) + "%" : ""})\n` +
      `- 📱 Nền tảng tốt nhất: **${bestPlatform ? capitalize(bestPlatform.platform) : "N/A"}** (${bestPlatform ? bestPlatform.avgEngagement.toFixed(2) + "%" : ""})\n` +
      `- 🏆 Đối thủ dẫn đầu: **${topCompetitor?.name ?? "N/A"}** (${topCompetitor ? (topCompetitor.avgEngagement * 100).toFixed(1) + "% engagement" : ""})`,
    confidence: "high",
    data: ctx as unknown as Record<string, unknown>,
  };
}

async function aiModelInfo(): Promise<NLQueryResponse> {
  try {
    const { getProviderInfo, getAIModel } = await import("@/lib/openai");
    const provider = await getProviderInfo();
    const model = await getAIModel();
    return {
      answer: `🤖 **Thông tin AI:**\n\n- Provider: **${provider.label}**\n- Model: **${model}**\n- Trạng thái: ✅ Đã cấu hình`,
      confidence: "high",
      data: { provider: provider.label, model },
    };
  } catch {
    return {
      answer: "❌ AI chưa được cấu hình. Vào Settings → Cấu hình & Bảo mật để thêm API Key.",
      confidence: "low",
    };
  }
}

// ─── AI-powered answer (with streaming support) ───────────────────────────

async function aiAnswer(
  question: string,
  onStream?: StreamCallback,
): Promise<NLQueryResponse> {
  // Fetch context (lightweight, cached)
  const ctx = await getNLQueryContext(30);
  updateFingerprint(ctx);

  // Build enriched context
  const context = buildEnrichedContext(ctx);

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `Trả lời câu hỏi về dữ liệu nghiên cứu đối thủ.

**Context data (30 ngày gần nhất)**:
${context}

**Câu hỏi của user**: "${question}"

Hướng dẫn trả lời:
- Trả lời bằng tiếng Việt có dấu.
- TRẢ LỜI NGẮN GỌN VÀ ĐI THẲNG VÀO TRỌNG TÂM câu hỏi trong 3-4 câu.
- Dùng markdown formatting: **bold** cho số liệu quan trọng, bullet points cho danh sách ngắn (tối đa 3 items).
- Trích dẫn dữ liệu cụ thể từ context (tên đối thủ, con số, %) liên quan trực tiếp đến câu hỏi.
- Không lặp lại hoặc tóm tắt lại toàn bộ thông tin hệ thống nếu câu hỏi chỉ nhắm vào 1 khía cạnh.
- KHÔNG đưa khuyến nghị đầu tư cá nhân.
- Trả lời đầy đủ, không để câu bị lửng lơ hoặc dở dang.`;

    // Use streaming if callback provided
    if (onStream) {
      return await streamAIResponse(client, model, prompt, question, ctx, onStream);
    }

    // Non-streaming fallback
    const response = await Promise.race([
      client.responses.create({
        model,
        input: prompt,
        instructions:
          "Bạn là chuyên gia phân tích content intelligence. Trả lời bằng tiếng Việt, dựa trên dữ liệu có sẵn. Dùng markdown formatting.",
        max_output_tokens: 1500,
      }),
      timeoutPromise(15000),
    ]);

    const result: NLQueryResponse = {
      answer: response.output_text,
      confidence: "medium",
      data: { overview: { totalPosts: ctx.totalPosts, totalCompetitors: ctx.totalCompetitors } },
    };

    setCachedAIResponse(question, result);
    return result;
  } catch (error) {
    const errMsg =
      error instanceof Error
        ? error.message === "AI_TIMEOUT"
          ? "⏱️ AI phản hồi quá chậm (>15s). Vui lòng thử lại hoặc hỏi câu đơn giản hơn."
          : "❌ Lỗi kết nối AI: " + error.message
        : "❌ Lỗi không xác định";

    onStream?.(errMsg, true);
    return { answer: errMsg, confidence: "low" };
  }
}

// ─── Streaming AI response ────────────────────────────────────────────────

async function streamAIResponse(
  client: any,
  model: string,
  prompt: string,
  question: string,
  ctx: NLQueryContext,
  onStream: StreamCallback,
): Promise<NLQueryResponse> {
  try {
    // Try chat completions streaming (works with all providers via adapter)
    const stream = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Bạn là chuyên gia phân tích content intelligence. Trả lời bằng tiếng Việt, dựa trên dữ liệu có sẵn. Dùng markdown formatting.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      stream: true,
    });

    let fullText = "";

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onStream(delta, false);
      }
    }

    onStream("", true); // Signal done

    const result: NLQueryResponse = {
      answer: fullText,
      confidence: "medium",
      data: { overview: { totalPosts: ctx.totalPosts, totalCompetitors: ctx.totalCompetitors } },
    };

    setCachedAIResponse(question, result);
    return result;
  } catch {
    // Fallback to non-streaming if streaming not supported
    const response = await Promise.race([
      client.responses.create({
        model,
        input: prompt,
        instructions:
          "Bạn là chuyên gia phân tích content intelligence. Trả lời bằng tiếng Việt, dựa trên dữ liệu có sẵn. Dùng markdown formatting.",
        max_output_tokens: 1500,
      }),
      timeoutPromise(15000),
    ]);

    // Stream the full text to the client first, then send done signal
    onStream(response.output_text, false);
    onStream("", true);

    const result: NLQueryResponse = {
      answer: response.output_text,
      confidence: "medium",
      data: { overview: { totalPosts: ctx.totalPosts, totalCompetitors: ctx.totalCompetitors } },
    };

    setCachedAIResponse(question, result);
    return result;
  }
}

// ─── Enriched context builder ─────────────────────────────────────────────

function buildEnrichedContext(ctx: NLQueryContext): string {
  // Top posts detail
  const topPostsList = ctx.topPosts
    .slice(0, 7)
    .map(
      (p, i) =>
        `${i + 1}. "${p.title}" — ${p.competitorName} (${p.platform}) | Eng: ${(p.engagementRate * 100).toFixed(1)}% | Views: ${fmtViews(p.views)} | Pillar: ${p.contentPillar} | Hook: ${p.hookType}`
    )
    .join("\n");

  // Top competitors
  const topCompetitorsList = ctx.topCompetitors
    .slice(0, 5)
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} (${c.platform}) — ${c.postCount} bài, eng ${(c.avgEngagement * 100).toFixed(1)}%, views ${fmtViews(c.totalViews)}`
    )
    .join("\n");

  // Platform stats
  const platformList = ctx.platformEffectiveness
    .map(
      (p) =>
        `- ${capitalize(p.platform)}: ${p.postCount} bài, eng ${p.avgEngagement.toFixed(2)}%, ${p.totalInteractions} tương tác → ${p.decision}`
    )
    .join("\n");

  // Pillars
  const pillarList = ctx.topPillars
    .slice(0, 5)
    .map((p) => `- ${p.name}: ${p.count} bài, eng ${(p.avgEngagement * 100).toFixed(1)}%`)
    .join("\n");

  return `## TỔNG QUAN (30 ngày)
- Tổng đối thủ: ${ctx.totalCompetitors}
- Tổng bài viết: ${ctx.totalPosts}
- Engagement trung bình: ${(ctx.avgEngagement * 100).toFixed(1)}%
- Tổng tương tác: ${fmtViews(ctx.totalInteractions)}

## TOP BÀI VIẾT (by engagement)
${topPostsList || "Chưa có dữ liệu"}

## TOP ĐỐI THỦ (by engagement)
${topCompetitorsList || "Chưa có dữ liệu"}

## HIỆU QUẢ NỀN TẢNG
${platformList}

## TRỤ CỘT NỘI DUNG
${pillarList}

## CONTENT GAPS
${ctx.gaps.slice(0, 4).map((g) => `- ${g}`).join("\n")}

## GỢI Ý
${ctx.suggestions.slice(0, 3).map((s) => `- ${s}`).join("\n")}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractPlatform(q: string): Platform | undefined {
  if (/\byoutube\b/i.test(q)) return "youtube";
  if (/\btiktok\b/i.test(q)) return "tiktok";
  if (/\bfacebook\b|\bfb\b/i.test(q)) return "facebook";
  return undefined;
}

function groupByPlatform(
  competitors: Array<{ platform: string }>
): Record<string, Array<{ platform: string }>> {
  return competitors.reduce<Record<string, Array<{ platform: string }>>>((acc, c) => {
    acc[c.platform] = acc[c.platform] ?? [];
    acc[c.platform].push(c);
    return acc;
  }, {});
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function updateFingerprint(ctx: NLQueryContext): void {
  setDataFingerprint(ctx.totalPosts, ctx.totalCompetitors, ctx.avgEngagement);
}

function timeoutPromise(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT")), ms)
  );
}
