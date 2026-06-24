/**
 * Content Generator Engine
 *
 * Core engine tự động sinh kịch bản YouTube & content post từ dữ liệu crawl.
 * Flow: Crawl data → Detect gaps → Build prompt → OpenAI → Save to DB
 */

import { prisma } from "@/lib/prisma";
import { getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from "@/lib/openai";
import { getFilteredPosts, getContentGapAnalytics } from "@/lib/analytics";
import type {
  Platform,
  ContentType,
  ContentStatus,
  GenerateBatchInput,
  GenerateContentResponse,
  GenerateBatchResponse,
} from "@/lib/types";

// ─── Prompt Templates ──────────────────────────────────────────────────────

const SYSTEM_INSTRUCTIONS: Record<Platform, string> = {
  youtube:
    "Bạn là chuyên gia content strategy cho Kolia Phan — kênh tài chính đầu tư. " +
    "Tạo KỊCH BẢN YOUTUBE chi tiết với timeline rõ ràng (00:00-01:30 Hook, 01:30-04:00 Bối cảnh, " +
    "04:00-08:00 Framework phân tích, 08:00-12:00 Case study, 12:00-16:00 Kịch bản thị trường, 16:00-18:00 CTA). " +
    "Trả lời bằng tiếng Việt có dấu, trung lập, giáo dục, KHÔNG đưa khuyến nghị đầu tư cá nhân.",
  tiktok:
    "Bạn là chuyên gia content TikTok cho Kolia Phan — kênh tài chính. " +
    "Tạo KỊCH BẢN TIKTOK 60 GIÂY: 0-3s Hook mạnh, 3-12s Căng thẳng thị trường, 12-35s Giải thích trọng tâm, " +
    "35-50s Bằng chứng/dữ liệu, 50-60s Lưu ý rủi ro + CTA. " +
    "Trả lời bằng tiếng Việt có dấu, ngắn gọn, dễ hiểu, KHÔNG khuyến nghị đầu tư.",
  facebook:
    "Bạn là chuyên gia content Facebook cho Kolia Phan — page tài chính. " +
    "Tạo BÀI FACEBOOK (text/carousel) dạng chuyên gia: góc nhìn khác biệt, dữ liệu kiểm chứng, " +
    "lưu ý rủi ro rõ ràng, CTA mềm (mời theo dõi/share/tham gia cộng đồng). " +
    "Trả lời bằng tiếng Việt có dấu, KHÔNG khuyến nghị đầu tư.",
};

const CONTENT_TYPE_EXTRA: Record<ContentType, string> = {
  script: "Đây là kịch bản chi tiết có timeline.",
  post: "Đây là bài post hoàn chỉnh có caption + hashtag.",
  carousel: "Đây là nội dung carousel: slide 1-5 với tiêu đề + nội dung từng slide.",
  caption: "Đây là caption ngắn gọn dưới 300 ký tự.",
};

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generate content từ crawl data + OpenAI
 */
export async function generateContent(options: {
  platform: Platform;
  contentType: ContentType;
  mainTopic?: string;
  marketContext?: string;
  gapContext?: string;
  lessonContext?: string;
  toneOfVoice?: string;
}): Promise<{
  title: string;
  script: string;
  thumbnailIdea?: string;
  cta?: string;
  toneOfVoice: string;
  mainTopic: string;
}> {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY chưa được cấu hình. Thêm vào .env để sử dụng AI generation.");
  }

  const prompt = buildPrompt(options);
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: SYSTEM_INSTRUCTIONS[options.platform],
    max_output_tokens: 2000,
  });

  const outputText = response.output_text;

  // Parse structured output from AI response
  return parseAIResponse(outputText, options);
}

/**
 * Batch generate — sinh nhiều content cùng lúc
 */
export async function generateBatch(input: GenerateBatchInput): Promise<GenerateBatchResponse> {
  if (!await isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY chưa được cấu hình.");
  }

  // Fetch context data for prompt building
  const gapData = input.gapIds?.length
    ? await getContentGapAnalytics({ days: 90 })
    : null;

  const lessonPosts = input.lessonPostIds?.length
    ? await prisma.post.findMany({
        where: { id: { in: input.lessonPostIds } },
        include: { competitor: true },
        take: 10,
      })
    : [];

  const gapContext = gapData
    ? buildGapContext(gapData)
    : "";

  const lessonContext = lessonPosts.length > 0
    ? buildLessonContext(lessonPosts)
    : "";

  const items: GenerateContentResponse[] = [];
  const count = input.count ?? 1;

  for (const entry of input.entries) {
    for (let i = 0; i < count; i++) {
      const result = await generateContent({
        platform: entry.platform,
        contentType: entry.contentType,
        mainTopic: entry.mainTopic,
        marketContext: input.marketContext,
        gapContext,
        lessonContext,
        toneOfVoice: entry.toneOfVoice,
      });

      // Save to DB
      const saved = await prisma.generatedContent.create({
        data: {
          platform: entry.platform,
          contentType: entry.contentType,
          title: result.title,
          script: result.script,
          thumbnailIdea: result.thumbnailIdea ?? null,
          cta: result.cta ?? null,
          toneOfVoice: result.toneOfVoice,
          mainTopic: result.mainTopic,
          sourceGap: input.gapIds ? JSON.stringify(input.gapIds) : null,
          sourcePosts: input.lessonPostIds ? JSON.stringify(input.lessonPostIds) : null,
          status: "draft",
        },
      });

      items.push({
        id: saved.id,
        platform: entry.platform,
        contentType: entry.contentType,
        title: result.title,
        script: result.script,
        thumbnailIdea: result.thumbnailIdea,
        cta: result.cta,
        toneOfVoice: result.toneOfVoice,
        mainTopic: result.mainTopic,
        status: "draft",
        createdAt: saved.createdAt.toISOString(),
      });
    }
  }

  // ─── Gửi Telegram notification ─────────────────────────────────
  try {
    const { sendAlert } = await import("@/lib/alerts");
    await sendAlert(null, "content.generated", "🤖 Content được tạo",
      `AI vừa tạo **${items.length}** nội dung mới.\n` +
      `Vào Content Library để duyệt và xuất bản.`);
  } catch { /* silent */ }

  return {
    items,
    totalGenerated: items.length,
  };
}

/**
 * Auto-generate content from latest sync data — gọi sau khi sync hoàn tất
 */
export async function autoGenerateFromSync(syncRunId: string): Promise<GenerateBatchResponse> {
  const gapData = await getContentGapAnalytics({ days: 30 });
  const topPosts = await getFilteredPosts({ days: 30, sortBy: "engagement" }, 10);

  const gapContext = buildGapContext(gapData);
  const lessonContext = buildLessonContext(topPosts);

  // Identify top gaps to generate content for
  const topGaps = gapData.domestic.gaps.slice(0, 3);
  const topSuggestions = gapData.domestic.suggestions.slice(0, 3);

  const entries: Array<{
    platform: Platform;
    contentType: ContentType;
    mainTopic?: string;
    toneOfVoice?: string;
  }> = [];

  // Generate YouTube script from top gap
  if (topGaps.length > 0) {
    entries.push({ platform: "youtube", contentType: "script", mainTopic: topGaps[0].slice(0, 80) });
  }
  if (topSuggestions.length > 0) {
    entries.push({ platform: "youtube", contentType: "script", mainTopic: topSuggestions[0].slice(0, 80) });
  }

  // Generate TikTok script
  if (topGaps.length > 1) {
    entries.push({ platform: "tiktok", contentType: "script", mainTopic: topGaps[1].slice(0, 80) });
  }

  // Generate Facebook post
  entries.push({ platform: "facebook", contentType: "post", mainTopic: "Cập nhật thị trường" });

  const result = await generateBatch({
    entries,
    gapIds: [],
    lessonPostIds: topPosts.map((p) => p.id),
    count: 1,
  });

  return {
    ...result,
    syncRunId,
  };
}

// ─── Prompt Builder ────────────────────────────────────────────────────────

function buildPrompt(options: {
  platform: Platform;
  contentType: ContentType;
  mainTopic?: string;
  marketContext?: string;
  gapContext?: string;
  lessonContext?: string;
  toneOfVoice?: string;
}): string {
  const lines = [
    `## Yêu cầu nội dung`,
    ``,
    `- **Nền tảng**: ${options.platform}`,
    `- **Loại nội dung**: ${options.contentType} — ${CONTENT_TYPE_EXTRA[options.contentType]}`,
    options.mainTopic ? `- **Chủ đề chính**: ${options.mainTopic}` : null,
    options.toneOfVoice ? `- **Giọng điệu**: ${options.toneOfVoice}` : null,
    ``,
  ].filter(Boolean).join("\n");

  const contextParts = [];
  if (options.marketContext) {
    contextParts.push(`## Bối cảnh thị trường\n${options.marketContext}\n`);
  }
  if (options.gapContext) {
    contextParts.push(`## Khoảng trống nội dung từ phân tích đối thủ\n${options.gapContext}\n`);
  }
  if (options.lessonContext) {
    contextParts.push(`## Bài học từ đối thủ (tham khảo)\n${options.lessonContext}\n`);
  }

  const format = `## Format đầu ra\nTrả về theo cấu trúc JSON:\n\`\`\`json\n{\n  "title": "Tiêu đề hấp dẫn",\n  "script": "Nội dung kịch bản đầy đủ...",\n  "thumbnailIdea": "Mô tả ý tưởng thumbnail (nếu có)",\n  "cta": "Lời kêu gọi hành động",\n  "toneOfVoice": "Giọng điệu sử dụng",\n  "mainTopic": "Chủ đề chính"\n}\n\`\`\``;

  return `${lines}\n${contextParts.join("\n")}\n${format}`;
}

function buildGapContext(gapData: Awaited<ReturnType<typeof getContentGapAnalytics>>): string {
  const lines = [
    "### Khoảng trống nội dung trong nước:",
    ...gapData.domestic.gaps.map((g) => `- ${g}`),
    "",
    "### Gợi ý tuyến bài:",
    ...gapData.domestic.suggestions.map((s) => `- ${s}`),
    "",
    "### Chủ đề đối thủ lặp lại (tránh):",
    ...gapData.domestic.repeatedTopics.map((r) => `- ${r}`),
    "",
    "### Công thức viral từ đối thủ nước ngoài:",
    ...gapData.foreign.viralPatterns.map((p) => `- ${p}`),
  ];
  return lines.join("\n");
}

function buildLessonContext(
  posts: Array<{ title: string; caption: string; platform: string; contentPillar: string; engagementRate: number; competitor?: { name: string } }>
): string {
  const lines = [
    "### Bài viết hiệu quả từ đối thủ (dùng làm reference):",
    ...posts.slice(0, 5).map((post, i) =>
      `${i + 1}. [${post.competitor?.name ?? "Unknown"}] "${post.title}" — ${post.contentPillar}, engagement: ${(post.engagementRate * 100).toFixed(1)}%`
    ),
  ];
  return lines.join("\n");
}

// ─── Response Parser ──────────────────────────────────────────────────────

function parseAIResponse(
  outputText: string,
  options: { platform: Platform; contentType: ContentType; mainTopic?: string; toneOfVoice?: string }
): {
  title: string;
  script: string;
  thumbnailIdea?: string;
  cta?: string;
  toneOfVoice: string;
  mainTopic: string;
} {
  // Try to parse JSON from response
  try {
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || `Content about ${options.mainTopic || "market"}`,
        script: parsed.script || outputText,
        thumbnailIdea: parsed.thumbnailIdea,
        cta: parsed.cta,
        toneOfVoice: parsed.toneOfVoice || options.toneOfVoice || "Chuyên gia",
        mainTopic: parsed.mainTopic || options.mainTopic || "Thị trường tài chính",
      };
    }
  } catch {
    // Not JSON, use raw text
  }

  // Fallback: extract title from first line
  const lines = outputText.trim().split("\n").filter(Boolean);
  const title = lines[0]?.replace(/^[#*]+\s*/, "").slice(0, 200) || `Content about ${options.mainTopic || "market"}`;

  return {
    title,
    script: outputText,
    toneOfVoice: options.toneOfVoice || "Chuyên gia",
    mainTopic: options.mainTopic || "Thị trường tài chính",
  };
}
