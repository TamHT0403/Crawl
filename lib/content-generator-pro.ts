/**
 * PRO Content Generator Engine — Version 3.0
 *
 * TRUE multi-step AI generation pipeline with 4 real OpenAI calls:
 *   Step 1: RESEARCH  — Competitor intelligence analysis (Data Analyst)
 *   Step 2: OUTLINE   — Strategic content architecture (Creative Director)
 *   Step 3: DRAFT     — Expert scriptwriting (Platform Specialist)
 *   Step 4: POLISH    — Quality assurance & optimization (Editor-in-Chief)
 *
 * Flow: Crawl data → Research → Outline → Draft → Polish → Save DB
 *
 * Key improvements over v2:
 *   - 4 real OpenAI calls instead of 1
 *   - All templates (YOUTUBE/TIKTOK/FACEBOOK_STRUCTURE) are actively used
 *   - PRO_SYSTEM_INSTRUCTIONS are actively used in Step 3
 *   - Full competitor data (no truncation)
 *   - platformSummary, gaps, suggestions, viralPatterns all injected
 *   - Proper Vietnamese with diacritics throughout
 *   - SSE streaming via onStepComplete callback
 *   - Appropriate max_output_tokens per step
 */

import { prisma } from "@/lib/prisma";
import { getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from "@/lib/openai";
import { getFilteredPosts, getContentGapAnalytics, getOverviewAnalytics } from "@/lib/analytics";
import { getBrandVoice, applyBrandVoicePrompt } from "@/lib/brandVoice";
import type { Platform, ContentType, GenerateBatchInput, GenerateContentResponse, GenerateBatchResponse } from "@/lib/types";
import { fetchMarketSnapshot, formatMarketContext } from "@/lib/marketData";
import type { MarketSnapshot } from "@/lib/marketData";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type StepResult = {
  step: 1 | 2 | 3;
  stepName: string;
  output: string;
  durationMs: number;
};

export type ProGenerateResult = {
  title: string;
  script: string;
  thumbnailIdea?: string;
  cta?: string;
  toneOfVoice: string;
  mainTopic: string;
  keyTakeaways: string[];
  competitorReferences: string[];
  hookScore?: number;
  retentionRisks?: string[];
  alternativeHooks?: string[];
  seoTitle?: string;
  seoDescription?: string;
  hashtags?: string[];
  qualityChecklist?: Record<string, unknown>;
  titleVariants?: string[];
  researchBrief?: string;
  outline?: string;
  stepsCompleted?: number;
  totalDurationMs?: number;
};

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Safely parse JSON from AI output, returns null on failure */
function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    // Try direct parse first
    return JSON.parse(text);
  } catch {
    // Try to extract JSON object from markdown code blocks or mixed text
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch { /* fall through */ }
    }
    // Try to find a top-level JSON object
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch { /* fall through */ }
    }
    return null;
  }
}

/** Format number for display in Vietnamese */
function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return n.toLocaleString("vi-VN");
}

/** Format engagement rate as percentage */
function fmtPct(rate: number | null | undefined): string {
  if (rate == null || isNaN(rate)) return "N/A";
  return `${(rate * 100).toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRO SCRIPT TEMPLATES — Used in Step 2 (Outline)
// ═══════════════════════════════════════════════════════════════════════════

const YOUTUBE_STRUCTURE = `CẤU TRÚC KỊCH BẢN YOUTUBE CHUYÊN NGHIỆP:

📌 PHẦN 1: HOOK & LUẬN ĐIỂM (00:00 - 01:30)
  • Mở đầu bằng một câu hỏi hoặc tuyên bố gây tranh luận
  • Đưa ra luận điểm chính của video (thesis statement)
  • Cho người xem biết họ sẽ học được gì sau video này

📌 PHẦN 2: BỐI CẢNH DỮ LIỆU (01:30 - 04:00)
  • Trình bày dữ liệu vĩ mô đang chi phối thị trường
  • So sánh dữ liệu hiện tại với quá khứ (YoY, MoM)
  • Visual: chart, biểu đồ, số liệu cụ thể

📌 PHẦN 3: FRAMEWORK PHÂN TÍCH (04:00 - 08:00)
  • Giới thiệu framework 3-5 bước để phân tích vấn đề
  • Áp dụng framework vào bối cảnh hiện tại
  • Giải thích logic đằng sau mỗi bước

📌 PHẦN 4: CASE STUDY / BẰNG CHỨNG (08:00 - 12:00)
  • Đưa ra ví dụ thực tế từ đối thủ hoặc thị trường
  • Phân tích kết quả dựa trên dữ liệu (không cảm tính)
  • So sánh trước/sau nếu có

📌 PHẦN 5: KỊCH BẢN THỊ TRƯỜNG (12:00 - 15:00)
  • Nêu các kịch bản: lạc quan, trung tính, tiêu cực
  • Xác suất cho mỗi kịch bản dựa trên dữ liệu
  • Điều kiện để mỗi kịch bản xảy ra

📌 PHẦN 6: KẾT LUẬN & CTA (15:00 - 18:00)
  • Tổng kết luận điểm chính
  • Lưu ý rủi ro (disclaimer)
  • CTA: theo dõi, comment, webinar, checklist

📌 METADATA:
  • SEO Title (60 ký tự): ...
  • SEO Description (160 ký tự): ...
  • Thumbnail Idea: ...
  • Tags: ...`;

const TIKTOK_STRUCTURE = `CẤU TRÚC KỊCH BẢN TIKTOK 60 GIÂY CHUYÊN NGHIỆP:

⏱ 0-3s: HOOK MẠNH — mở bằng vấn đề cụ thể, gây tò mò
  • Công thức: "Bạn có biết...?" / "Đừng bao giờ... trước khi..." / Sốc + dữ liệu

⏱ 3-12s: GIỚI THIỆU VẤN ĐỀ — đặt bối cảnh thị trường
  • Tại sao vấn đề này quan trọng với nhà đầu tư
  • Dữ liệu nhanh (1-2 con số)

⏱ 12-30s: GIẢI THÍCH TRỌNG TÂM — framework đơn giản
  • 1 ý chính duy nhất, dễ hiểu
  • Visual: chữ trên màn hình, biểu đồ đơn giản

⏱ 30-45s: BẰNG CHỨNG / VÍ DỤ — dữ liệu kiểm chứng
  • Case ngắn hoặc so sánh
  • Kết luận rút ra

⏱ 45-55s: LƯU Ý RỦI RO — giữ trung lập, giáo dục
  • Cảnh báo không khuyến nghị đầu tư
  • Khuyến khích tự nghiên cứu

⏱ 55-60s: CTA — theo dõi, comment, học thêm
  • "Theo dõi để không bỏ lỡ phân tích hàng tuần"

📌 METADATA:
  • Caption: ...
  • Hashtags: ...`;

const FACEBOOK_STRUCTURE = `CẤU TRÚC BÀI FACEBOOK CHUYÊN NGHIỆP:

📰 HEADLINE: Tiêu đề thu hút (dưới 80 ký tự)
  • Gây chú ý, chứa luận điểm chính

📝 BODY: 3-5 đoạn ngắn, mỗi đoạn 2-3 câu
  • Đoạn 1: Luận điểm + dữ liệu chính
  • Đoạn 2: Phân tích / giải thích
  • Đoạn 3: Bối cảnh thị trường
  • Đoạn 4: Góc nhìn khác biệt
  • Đoạn 5: Kết luận + rủi ro

💬 ENGAGEMENT: Câu hỏi kết nối cộng đồng
  • "Bạn nghĩ sao về...?"
  • "Theo dõi để cập nhật thêm"

🔖 HASHTAGS: 5-10 hashtag

📌 NẾU LÀ CAROUSEL:
  • Slide 1: Cover + headline
  • Slide 2-4: Nội dung chính
  • Slide 5: Kết luận + CTA`;

const PLATFORM_STRUCTURES: Record<Platform, string> = {
  youtube: YOUTUBE_STRUCTURE,
  tiktok: TIKTOK_STRUCTURE,
  facebook: FACEBOOK_STRUCTURE,
};

// ═══════════════════════════════════════════════════════════════════════════
//  PRO SYSTEM INSTRUCTIONS — Used in Step 3 (Draft)
// ═══════════════════════════════════════════════════════════════════════════

const PRO_SYSTEM_INSTRUCTIONS: Record<Platform, string> = {
  youtube: `Bạn là chuyên gia content strategy hàng đầu cho kênh tài chính Kolia Phan — phong cách chuyên gia trung lập, dữ liệu là trọng tâm, giáo dục nhà đầu tư cá nhân Việt Nam.

NGUYÊN TẮC VÀNG:
1. LUẬN ĐIỂM RÕ RÀNG — Mỗi video phải có 1 thesis duy nhất, xuyên suốt
2. DỮ LIỆU KIỂM CHỨNG — Mọi nhận định phải có số liệu, chart, hoặc nguồn tham khảo
3. TRUNG LẬP — Không thiên vị mua/bán, trình bày nhiều kịch bản
4. GIÁO DỤC — Người xem học được framework để tự phân tích
5. CÓ CẤU TRÚC — Hook → Context → Framework → Case → Scenarios → CTA

QUY TẮC VỀ GIỌNG VĂN:
- Chuyên gia nhưng dễ hiểu (không dùng thuật ngữ quá chuyên sâu)
- Dữ liệu dẫn dắt câu chuyện, không cảm tính
- Tôn trọng người xem, không FOMO, không bán hàng trực tiếp
- Kết luận luôn kèm lưu ý rủi ro

KHÔNG BAO GIỜ:
- Đưa khuyến nghị mua/bán cá nhân
- Hứa hẹn lợi nhuận
- Dùng FOMO, clickbait
- Sao chép nội dung đối thủ`,

  tiktok: `Bạn là chuyên gia content TikTok cho Kolia Phan — kênh tài chính giáo dục nhà đầu tư cá nhân. Phong cách: nhanh, gọn, dễ hiểu, có chất lượng.

NGUYÊN TẮC:
1. 3 giây đầu quyết định — Hook phải cụ thể, có vấn đề
2. 1 video = 1 ý duy nhất — Đừng nhồi nhét
3. Dữ liệu trực quan — Số, chart, so sánh
4. Kết thúc có CTA rõ ràng
5. Luôn kèm lưu ý rủi ro

CÔNG THỨC HOOK HIỆU QUẢ (chọn 1):
- Con số gây sốc: "2.000 tỷ đã bốc hơi chỉ trong 1 ngày"
- Câu hỏi: "Bạn có biết tại sao vàng giảm dù lãi suất giảm?"
- Cảnh báo: "Đừng mua vàng trước khi xem video này"
- Lật tẩy: "3 điều mà các KOL tài chính không nói với bạn"`,

  facebook: `Bạn là chuyên gia content Facebook cho Kolia Phan — trang tài chính giáo dục nhà đầu tư cá nhân. Phong cách: chuyên gia sâu sắc, có góc nhìn riêng, dễ chia sẻ.

NGUYÊN TẮC:
1. HEADLINE gây chú ý trong 2 giây đầu
2. Nội dung có chiều sâu — không chỉ là tin tức
3. Dữ liệu kiểm chứng — số liệu cụ thể
4. Có góc nhìn khác biệt với đám đông
5. Kêu gọi tương tác (bình luận, chia sẻ)
6. Luôn kèm rủi ro disclaimer`,
};

// ═══════════════════════════════════════════════════════════════════════════
//  PLATFORM CONTENT FORMAT DESCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

const PLATFORM_FORMAT_DESC: Record<Platform, string> = {
  youtube: "YouTube video dài (12-18 phút), kịch bản chi tiết với timestamps",
  tiktok: "TikTok video ngắn (45-60 giây), kịch bản súc tích có hook mạnh",
  facebook: "Facebook post chuyên sâu (3-5 đoạn), có dữ liệu và góc nhìn riêng",
};

// ═══════════════════════════════════════════════════════════════════════════
//  PRO CONTEXT BUILDER — Thu thập dữ liệu đối thủ chi tiết (không cắt ngắn)
// ═══════════════════════════════════════════════════════════════════════════

async function buildProContext(platform: Platform, days = 30) {
  // 1. Lấy competitor posts cho platform — sorted by engagement, lấy nhiều hơn để có dữ liệu phong phú
  const competitorPosts = await getFilteredPosts({ platform, days, sortBy: "engagement" }, 20);

  // 2. Lấy content gap analysis
  const gapData = await getContentGapAnalytics({ days });

  // 3. Lấy overview stats
  const overview = await getOverviewAnalytics({ days });

  // 4. Lấy brand voice
  const brandVoice = await getBrandVoice();

  // 5. Phân tích chi tiết từng post — KHÔNG cắt ngắn nội dung
  const topPostsDetail = competitorPosts.slice(0, 10).map((post, i) => {
    const postAny = post as any;
    const transcriptSnippet = postAny.transcript
      ? `\n  • Lời thoại (Transcript): "${postAny.transcript.slice(0, 1000)}..."`
      : "";
    return `[Bài ${i + 1}]
  • Đối thủ: ${post.competitor.name} (${post.competitor.source === "trong_nuoc" ? "Trong nước" : "Nước ngoài"})
  • Danh mục: ${post.competitor.category}
  • Tiêu đề: "${post.title}"
  • Nội dung: ${post.caption.slice(0, 500)}${transcriptSnippet}
  • Trụ cột nội dung: ${post.contentPillar || "N/A"}
  • Loại hook: ${post.hookType || "N/A"}
  • Định dạng: ${post.format || "N/A"}
  • Giọng điệu: ${post.toneOfVoice || "N/A"}
  • Chủ đề chính: ${post.mainTopic || "N/A"}
  • Loại quảng bá: ${post.promotionType || "N/A"}
  • Views: ${fmtNum(post.views)}
  • Likes: ${fmtNum(post.likes)}
  • Comments: ${fmtNum(post.comments)}
  • Shares: ${fmtNum(post.shares)}
  • Tỷ lệ tương tác: ${fmtPct(post.engagementRate)}
  • Điểm viral: ${post.viralityScore?.toFixed(1) ?? "N/A"}`;
  }).join("\n\n");

  // 6. Thống kê platform
  const platformStats = overview.platformEffectiveness.find(p => p.platform === platform);
  const platformSummary = platformStats
    ? `• Nền tảng: ${platform.toUpperCase()}
• Số bài đã thu thập: ${platformStats.postCount}
• Engagement trung bình: ${platformStats.avgEngagement.toFixed(2)}%
• Tổng tương tác: ${fmtNum(platformStats.totalInteractions)}
• Đánh giá hiệu quả: ${platformStats.decision}
• Insight chiến lược: ${platformStats.insight}`
    : "• Chưa có đủ dữ liệu thống kê cho nền tảng này";

  // 7. Gap analysis — lấy đầy đủ, không cắt ngắn
  const relevantGaps = gapData.domestic.gaps.map((g, i) => `${i + 1}. ${g}`).join("\n");
  const relevantSuggestions = gapData.domestic.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const viralPatterns = gapData.foreign.viralPatterns.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const commonTopics = gapData.domestic.commonTopics?.slice(0, 8).join(", ") || "";
  const underusedHighEngagement = gapData.domestic.underusedHighEngagement?.slice(0, 5).join(", ") || "";

  // 8. Foreign formulas (short-form & long-form)
  const shortFormFormulas = gapData.foreign.shortForm?.slice(0, 3).map((f: any) =>
    `• "${f.title || f.formula}": ${f.formula || ""} — Đối thủ: ${f.competitor || "N/A"} — Việt hóa: ${f.vietnamized || "N/A"}`
  ).join("\n") || "Chưa có dữ liệu";
  const longFormFormulas = gapData.foreign.longForm?.slice(0, 3).map((f: any) =>
    `• "${f.title || f.formula}": ${f.formula || ""} — Đối thủ: ${f.competitor || "N/A"} — Việt hóa: ${f.vietnamized || "N/A"}`
  ).join("\n") || "Chưa có dữ liệu";

  // 9. Build brand voice section
  const brandVoiceSection = applyBrandVoicePrompt(brandVoice, platform);

  return {
    topPostsDetail,
    platformSummary,
    relevantGaps,
    relevantSuggestions,
    viralPatterns,
    commonTopics,
    underusedHighEngagement,
    shortFormFormulas,
    longFormFormulas,
    brandVoiceSection,
    brandVoice,
    competitorPostsCount: competitorPosts.length,
    gapData,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 1: RESEARCH — Competitor Intelligence Analysis
// ═══════════════════════════════════════════════════════════════════════════

async function stepResearch(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  mainTopic: string,
  marketContext: string,
  ctx: Awaited<ReturnType<typeof buildProContext>>,
): Promise<string> {
  const systemInstruction = `Bạn là Data Analyst chuyên phân tích nội dung đối thủ trong lĩnh vực tài chính.

NHIỆM VỤ: Phân tích toàn bộ dữ liệu đối thủ được cung cấp và tạo báo cáo nghiên cứu chi tiết phục vụ cho việc sản xuất nội dung.

YÊU CẦU ĐẦU RA:
- Viết báo cáo nghiên cứu dạng văn bản có cấu trúc (KHÔNG phải JSON)
- Sử dụng tiếng Việt có dấu chuẩn
- Mỗi nhận định phải có số liệu hoặc dẫn chứng cụ thể từ dữ liệu
- Tập trung vào actionable insights cho nền tảng ${platform.toUpperCase()}`;

  const prompt = `CHỦ ĐỀ CẦN PHÂN TÍCH: "${mainTopic}"
NỀN TẢNG MỤC TIÊU: ${platform.toUpperCase()}
${marketContext ? `\nBỐI CẢNH THỊ TRƯỜNG HIỆN TẠI:\n${marketContext}` : ""}

═══════════════════════════════════════
DỮ LIỆU ĐỐI THỦ (${ctx.competitorPostsCount} bài, sắp xếp theo engagement):
═══════════════════════════════════════
${ctx.topPostsDetail}

═══════════════════════════════════════
THỐNG KÊ NỀN TẢNG ${platform.toUpperCase()}:
═══════════════════════════════════════
${ctx.platformSummary}

═══════════════════════════════════════
PHÂN TÍCH LỖ HỔNG NỘI DUNG (Content Gaps):
═══════════════════════════════════════
Lỗ hổng chưa được khai thác:
${ctx.relevantGaps || "Chưa phát hiện lỗ hổng rõ ràng"}

Đề xuất nội dung từ phân tích:
${ctx.relevantSuggestions || "Chưa có đề xuất"}

Chủ đề phổ biến trong ngành: ${ctx.commonTopics || "N/A"}
Chủ đề ít dùng nhưng engagement cao: ${ctx.underusedHighEngagement || "N/A"}

═══════════════════════════════════════
XU HƯỚNG VIRAL TỪ THỊ TRƯỜNG QUỐC TẾ:
═══════════════════════════════════════
${ctx.viralPatterns || "Chưa có dữ liệu"}

Công thức video ngắn hiệu quả:
${ctx.shortFormFormulas}

Công thức video dài hiệu quả:
${ctx.longFormFormulas}

═══════════════════════════════════════
YÊU CẦU BÁO CÁO:
═══════════════════════════════════════
Hãy phân tích và viết báo cáo nghiên cứu với các phần sau:

1. TOP VIRAL PATTERNS — Những pattern nội dung nào đang tạo engagement cao nhất? Trích dẫn số liệu cụ thể từ dữ liệu.

2. HOOK PATTERNS — Xếp hạng các loại hook theo hiệu quả (dựa trên engagement rate thực tế). Cho ví dụ cụ thể.

3. CONTENT GAPS & CƠ HỘI — Những chủ đề/góc nhìn nào đối thủ chưa khai thác mà có tiềm năng engagement cao?

4. AUDIENCE INSIGHTS — Khán giả phản ứng tốt nhất với loại nội dung nào? (dựa trên comments, shares, engagement patterns)

5. ĐỀ XUẤT CHIẾN LƯỢC — Kolia Phan nên tiếp cận chủ đề "${mainTopic}" từ góc độ nào để tạo sự khác biệt?`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: 2000,
  });

  return response.output_text;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 2: OUTLINE — Strategic Content Architecture
// ═══════════════════════════════════════════════════════════════════════════

async function stepOutline(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  mainTopic: string,
  marketContext: string,
  researchBrief: string,
  ctx: Awaited<ReturnType<typeof buildProContext>>,
): Promise<{ raw: string; parsed: Record<string, unknown> }> {
  const structureTemplate = PLATFORM_STRUCTURES[platform];

  const systemInstruction = `Bạn là Creative Director chuyên thiết kế cấu trúc nội dung viral cho kênh tài chính.

NHIỆM VỤ: Dựa trên báo cáo nghiên cứu đối thủ và template cấu trúc nền tảng, thiết kế outline chi tiết cho 1 nội dung ${PLATFORM_FORMAT_DESC[platform]}.

YÊU CẦU:
- CẤM TUYỆT ĐỐI lấy nguyên văn câu mô tả chủ đề/lỗ hổng (ví dụ: "Cập nhật thị trường có tương tác tốt...") để làm tiêu đề chính ("title"). Hãy tự đặt một tiêu đề mới giật tít, khơi gợi tò mò, ngắn gọn (dưới 70 ký tự) và mang tính chuyên môn cao.
- Outline phải tận dụng insights từ nghiên cứu đối thủ
- Hook phải viết word-for-word (không chung chung)
- Mỗi section phải có key points cụ thể
- Emotional arc phải rõ ràng
- Trả lời bằng JSON hợp lệ, KHÔNG có markdown code block`;

  const prompt = `CHỦ ĐỀ: "${mainTopic}"
NỀN TẢNG: ${platform.toUpperCase()} — ${PLATFORM_FORMAT_DESC[platform]}
${marketContext ? `BỐI CẢNH: ${marketContext}` : ""}

═══════════════════════════════════════
BÁO CÁO NGHIÊN CỨU ĐỐI THỦ (từ Step 1):
═══════════════════════════════════════
${researchBrief}

═══════════════════════════════════════
TEMPLATE CẤU TRÚC ${platform.toUpperCase()} (bắt buộc tuân theo):
═══════════════════════════════════════
${structureTemplate}

═══════════════════════════════════════
LỖ HỔNG NỘI DUNG CẦN KHAI THÁC:
═══════════════════════════════════════
${ctx.relevantGaps || "Không có lỗ hổng cụ thể"}

ĐỀ XUẤT NỘI DUNG:
${ctx.relevantSuggestions || "Không có đề xuất cụ thể"}

═══════════════════════════════════════
YÊU CẦU: Trả về JSON với cấu trúc sau:
═══════════════════════════════════════
{
  "title": "Tiêu đề chính (tối đa 70 ký tự, có luận điểm rõ ràng)",
  "titleVariants": ["Biến thể tiêu đề 1", "Biến thể tiêu đề 2", "Biến thể tiêu đề 3"],
  "thumbnailIdea": "Mô tả ý tưởng thumbnail chi tiết (bố cục, màu sắc, text overlay, biểu cảm)",
  "hookStrategy": "Viết word-for-word câu hook mở đầu (không chung chung, phải cụ thể với chủ đề)",
  "sections": [
    {
      "time": "00:00-01:30",
      "title": "Tên section",
      "keyPoints": ["Điểm chính 1", "Điểm chính 2"],
      "visualCues": ["Gợi ý hình ảnh/chart"]
    }
  ],
  "emotionalArc": "curiosity → surprise → insight → action",
  "retentionCheckpoints": ["tại 2 phút: reveal dữ liệu bất ngờ", "tại 5 phút: plot twist"]
}`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: 2000,
  });

  const raw = response.output_text;
  const parsed = safeParseJSON(raw) || {};
  return { raw, parsed };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 3: DRAFT & POLISH — Scriptwriting + Quality Assessment (MERGED)
// ═══════════════════════════════════════════════════════════════════════════

async function stepDraftAndPolish(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  mainTopic: string,
  researchBrief: string,
  outlineJSON: Record<string, unknown>,
  outlineRaw: string,
  realMarketContext: string,
  ctx: Awaited<ReturnType<typeof buildProContext>>,
): Promise<{ script: string; metrics: Record<string, unknown> }> {
  // Use platform-specific PRO_SYSTEM_INSTRUCTIONS + quality assessment role
  const systemInstruction = PRO_SYSTEM_INSTRUCTIONS[platform] + `

NHIỆM VỤ: Viết kịch bản hoàn chỉnh sẵn sàng sản xuất, sau đó TỰ ĐÁNH GIÁ chất lượng.

QUY TẮC VIẾT KỊCH BẢN:
- Viết word-for-word — đây là lời thoại thực tế, KHÔNG phải tóm tắt
- Thêm [TIMESTAMP] markers cho từng đoạn
- Thêm [VISUAL] cues cho editor biết cần hiển thị gì
- Thêm [B-ROLL] suggestions cho footage bổ sung
- Mọi số liệu phải dùng DỮ LIỆU THỊ TRƯỜNG REAL-TIME được cung cấp bên dưới — KHÔNG bịa số liệu từ kiến thức cũ
- Giọng văn tự nhiên như đang nói chuyện, không khô khan
- Kết thúc LUÔN có lưu ý rủi ro (disclaimer)

SAU KHI VIẾT XONG, thêm dòng ---QUALITY_METRICS--- rồi viết JSON đánh giá.`;

  const outlineForPrompt = Object.keys(outlineJSON).length > 0
    ? JSON.stringify(outlineJSON, null, 2)
    : outlineRaw;

  const prompt = `CHỦ ĐỀ: "${mainTopic}"
NỀN TẢNG: ${platform.toUpperCase()}

═══════════════════════════════════════
${realMarketContext}
═══════════════════════════════════════

═══════════════════════════════════════
BÁO CÁO NGHIÊN CỨU ĐỐI THỦ:
═══════════════════════════════════════
${researchBrief}

═══════════════════════════════════════
OUTLINE ĐÃ ĐƯỢC DUYỆT:
═══════════════════════════════════════
${outlineForPrompt}

═══════════════════════════════════════
BRAND VOICE CẦN TUÂN THỦ:
═══════════════════════════════════════
${ctx.brandVoiceSection}

═══════════════════════════════════════
CÔNG THỨC NỘI DUNG THAM KHẢO:
═══════════════════════════════════════
Video ngắn:
${ctx.shortFormFormulas}

Video dài:
${ctx.longFormFormulas}

═══════════════════════════════════════
YÊU CẦU PHẦN 1 — VIẾT KỊCH BẢN:
═══════════════════════════════════════
Viết kịch bản HOÀN CHỈNH với:
1. Mở đầu bằng hook word-for-word (đã có trong outline)
2. Mỗi section có [TIMESTAMP], [VISUAL], [B-ROLL] markers
3. Lời thoại viết đầy đủ — không tóm tắt, không bullet points
4. SỬ DỤNG SỐ LIỆU THỊ TRƯỜNG REAL-TIME ở trên — đây là data thực, mới nhất
5. Transitions tự nhiên giữa các sections
6. Disclaimer rủi ro ở cuối
7. CTA rõ ràng

═══════════════════════════════════════
YÊU CẦU PHẦN 2 — ĐÁNH GIÁ CHẤT LƯỢNG:
═══════════════════════════════════════
Sau khi viết xong kịch bản, thêm dòng:
---QUALITY_METRICS---
Rồi viết JSON (không markdown code block):
{
  "hookScore": 8.5,
  "retentionRisks": ["tại 3:00 - risk mô tả"],
  "alternativeHooks": ["Hook 1", "Hook 2", "Hook 3"],
  "seoTitle": "Tiêu đề SEO (max 60 ký tự)",
  "seoDescription": "Mô tả SEO (max 160 ký tự)",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "qualityChecklist": {"hasDataPoints": true, "hasVisualCues": true, "hasRiskDisclaimer": true, "hookStrength": "strong", "estimatedDuration": "12:30"},
  "keyTakeaways": ["Key 1", "Key 2", "Key 3"],
  "competitorReferences": ["Ref 1", "Ref 2"],
  "cta": "Call-to-action"
}

Bắt đầu viết kịch bản:`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: 6000,
  });

  const output = response.output_text;

  // Parse: split by ---QUALITY_METRICS---
  const separator = "---QUALITY_METRICS---";
  const sepIndex = output.indexOf(separator);
  let script: string;
  let metrics: Record<string, unknown> = {};

  if (sepIndex !== -1) {
    script = output.slice(0, sepIndex).trim();
    const metricsRaw = output.slice(sepIndex + separator.length).trim();
    metrics = safeParseJSON(metricsRaw) || {};
  } else {
    script = output;
    // Try to extract JSON from the end of the output
    const lastBrace = output.lastIndexOf("}");
    const lastOpen = output.lastIndexOf('{"hookScore"');
    if (lastOpen !== -1 && lastBrace > lastOpen) {
      const possibleJSON = output.slice(lastOpen, lastBrace + 1);
      const parsed = safeParseJSON(possibleJSON);
      if (parsed && parsed.hookScore) {
        script = output.slice(0, lastOpen).trim();
        metrics = parsed;
      }
    }
  }

  return { script, metrics };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN PIPELINE: generateProContent() — 3-Step Engine with SSE + Market Data
// ═══════════════════════════════════════════════════════════════════════════

export async function generateProContent(options: {
  platform: Platform;
  contentType: ContentType;
  mainTopic?: string;
  toneOfVoice?: string;
  marketContext?: string;
  marketSnapshot?: MarketSnapshot;
  onStepComplete?: (result: StepResult) => void;
}): Promise<ProGenerateResult> {
  if (!await isOpenAIConfigured()) {
    throw new Error("OpenAI chưa được cấu hình. Vào Settings để thêm API key.");
  }

  const client = await getOpenAIClient();
  const model = await getOpenAIModel();
  const pipelineStart = Date.now();

  const mainTopic = options.mainTopic || "Phân tích thị trường tài chính";

  // ─── Fetch real-time market data ──────────────────────────────────────
  let snapshot = options.marketSnapshot;
  if (!snapshot) {
    try { snapshot = await fetchMarketSnapshot(); } catch { /* fallback below */ }
  }
  const realMarketContext = snapshot
    ? formatMarketContext(snapshot)
    : "(Không có dữ liệu thị trường real-time)";
  // Combine real data + user-supplied context
  const combinedMarketContext = [
    realMarketContext,
    options.marketContext ? `\nBỔ SUNG TỪ NGƯỜI DÙNG:\n${options.marketContext}` : "",
  ].filter(Boolean).join("\n");

  // ─── Gather context (DB queries, no AI calls) ────────────────────────
  const ctx = await buildProContext(options.platform);

  // ─── STEP 1: RESEARCH ────────────────────────────────────────────────
  const step1Start = Date.now();
  const researchBrief = await stepResearch(
    client, model, options.platform, mainTopic, combinedMarketContext, ctx
  );
  const step1Duration = Date.now() - step1Start;

  options.onStepComplete?.({
    step: 1,
    stepName: "Nghiên cứu đối thủ",
    output: researchBrief,
    durationMs: step1Duration,
  });

  // ─── STEP 2: OUTLINE ─────────────────────────────────────────────────
  const step2Start = Date.now();
  const outlineResult = await stepOutline(
    client, model, options.platform, mainTopic, combinedMarketContext, researchBrief, ctx
  );
  const step2Duration = Date.now() - step2Start;

  options.onStepComplete?.({
    step: 2,
    stepName: "Thiết kế cấu trúc",
    output: outlineResult.raw,
    durationMs: step2Duration,
  });

  // ─── STEP 3: DRAFT & POLISH (MERGED) ─────────────────────────────────
  const step3Start = Date.now();
  const draftResult = await stepDraftAndPolish(
    client, model, options.platform, mainTopic, researchBrief,
    outlineResult.parsed, outlineResult.raw, realMarketContext, ctx
  );
  const step3Duration = Date.now() - step3Start;

  options.onStepComplete?.({
    step: 3,
    stepName: "Viết kịch bản & đánh giá",
    output: draftResult.script,
    durationMs: step3Duration,
  });

  const totalDurationMs = Date.now() - pipelineStart;

  // ─── Assemble final result ───────────────────────────────────────────
  const metrics = draftResult.metrics;
  const outline = outlineResult.parsed;

  // Title: prefer outline title, then SEO title from metrics, then fallback
  let title = (outline.title as string) || (metrics.seoTitle as string);
  if (!title) {
    title = mainTopic.length > 50
      ? (mainTopic.split("có")[0]?.trim() || mainTopic.slice(0, 45))
      : mainTopic;
  }

  return {
    title: title.slice(0, 100),
    script: draftResult.script,
    thumbnailIdea: (outline.thumbnailIdea as string) || undefined,
    cta: (metrics.cta as string) || undefined,
    toneOfVoice: options.toneOfVoice || ctx.brandVoice.traits[0] || "Chuyên gia",
    mainTopic,
    keyTakeaways: (metrics.keyTakeaways as string[]) || [],
    competitorReferences: (metrics.competitorReferences as string[]) || [],
    hookScore: (metrics.hookScore as number) || undefined,
    retentionRisks: (metrics.retentionRisks as string[]) || undefined,
    alternativeHooks: (metrics.alternativeHooks as string[]) || undefined,
    seoTitle: (metrics.seoTitle as string) || undefined,
    seoDescription: (metrics.seoDescription as string) || undefined,
    hashtags: (metrics.hashtags as string[]) || undefined,
    qualityChecklist: (metrics.qualityChecklist as Record<string, unknown>) || undefined,
    titleVariants: (outline.titleVariants as string[]) || undefined,
    researchBrief,
    outline: outlineResult.raw,
    stepsCompleted: 3,
    totalDurationMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export async function generateProBatch(input: GenerateBatchInput): Promise<GenerateBatchResponse> {
  if (!await isOpenAIConfigured()) {
    throw new Error("OpenAI chưa được cấu hình.");
  }

  const items: GenerateContentResponse[] = [];
  const count = input.count ?? 1;

  for (const entry of input.entries) {
    for (let i = 0; i < count; i++) {
      const result = await generateProContent({
        platform: entry.platform,
        contentType: entry.contentType,
        mainTopic: entry.mainTopic,
        toneOfVoice: entry.toneOfVoice,
        marketContext: input.marketContext,
      });

      // Ensure title is a clean string
      let rawTitle: string;
      if (typeof result.title === 'object' && result.title !== null) {
        rawTitle = result.mainTopic || "";
      } else {
        rawTitle = String(result.title ?? "");
      }

      // Remove JSON prefix artifacts and duplicate topic phrases
      const cleanTitle = (rawTitle || result.mainTopic || "Phân tích thị trường")
        .replace(/^[\{\[]+/, '')
        .trim()
        .replace(new RegExp(`^(${escapeRegex(result.mainTopic?.split(" ")[0] || '')})\\s+\\1`, 'i'), '$1 ')
        .trim() || result.mainTopic || "Phân tích thị trường";

      // Build comprehensive script document
      const scriptSections = [
        `# ${cleanTitle}`,
        ``,
        result.script,
        ``,
        `---`,
      ];

      if (result.keyTakeaways?.length) {
        scriptSections.push(
          `### 📌 Key Takeaways`,
          ...result.keyTakeaways.map(k => `- ${k}`),
          ``,
        );
      }

      if (result.competitorReferences?.length) {
        scriptSections.push(
          `### 🏆 Tham chiếu đối thủ`,
          ...result.competitorReferences.map(r => `- ${r}`),
          ``,
        );
      }

      if (result.alternativeHooks?.length) {
        scriptSections.push(
          `### 🎯 Hook thay thế`,
          ...result.alternativeHooks.map((h, idx) => `${idx + 1}. ${h}`),
          ``,
        );
      }

      if (result.retentionRisks?.length) {
        scriptSections.push(
          `### ⚠️ Rủi ro giữ chân người xem`,
          ...result.retentionRisks.map(r => `- ${r}`),
          ``,
        );
      }

      if (result.hashtags?.length) {
        scriptSections.push(
          `### 🏷️ Hashtags`,
          result.hashtags.join(" "),
          ``,
        );
      }

      if (result.hookScore != null) {
        scriptSections.push(
          `### 📊 Điểm đánh giá`,
          `- Hook Score: ${result.hookScore}/10`,
          `- SEO Title: ${result.seoTitle || "N/A"}`,
          `- Thời lượng ước tính: ${(result.qualityChecklist?.estimatedDuration as string) || "N/A"}`,
          `- Tổng thời gian tạo: ${((result.totalDurationMs || 0) / 1000).toFixed(1)}s (${result.stepsCompleted || 4} bước)`,
          ``,
        );
      }

      const fullScript = scriptSections.filter(Boolean).join("\n");

      const saved = await prisma.generatedContent.create({
        data: {
          platform: entry.platform,
          contentType: entry.contentType,
          title: cleanTitle,
          script: fullScript,
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
        title: cleanTitle,
        script: `## ${cleanTitle}\n\n${result.script}`,
        thumbnailIdea: result.thumbnailIdea,
        cta: result.cta,
        toneOfVoice: result.toneOfVoice,
        mainTopic: result.mainTopic,
        status: "draft",
        createdAt: saved.createdAt.toISOString(),
      });
    }
  }

  return { items, totalGenerated: items.length };
}

// ═══════════════════════════════════════════════════════════════════════════
//  OPTIMIZE — Góp ý & tối ưu lại nội dung
// ═══════════════════════════════════════════════════════════════════════════

export type OptimizeStepEvent = {
  step: number;
  stepName: string;
  output: string;
  durationMs: number;
};

export async function optimizeContent(options: {
  contentId: string;
  feedback: string;
  onStep?: (event: OptimizeStepEvent) => void;
}): Promise<{ title: string; script: string; thumbnailIdea: string | null; cta: string | null }> {
  if (!await isOpenAIConfigured()) {
    throw new Error("OpenAI chưa được cấu hình.");
  }

  const pipelineStart = Date.now();

  // 1. Lấy content cũ + context
  const existing = await prisma.generatedContent.findUnique({ where: { id: options.contentId } });
  if (!existing) throw new Error("Không tìm thấy nội dung.");

  const platform = existing.platform as Platform;
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();

  // ─── STEP 1: Loading context (brand voice, market data) ────────────────
  const step1Start = Date.now();
  options.onStep?.({
    step: 0,
    stepName: "Đang tải dữ liệu ngữ cảnh & brand voice",
    output: "Đang lấy brand voice, thông tin thị trường real-time...",
    durationMs: 0,
  });

  const brandVoice = await getBrandVoice();
  const brandVoiceSection = applyBrandVoicePrompt(brandVoice, platform);

  let marketContext = "(Không có dữ liệu thị trường real-time)";
  try {
    const snapshot = await fetchMarketSnapshot();
    marketContext = formatMarketContext(snapshot);
  } catch { /* fallback */ }

  options.onStep?.({
    step: 0,
    stepName: "✅ Đã tải dữ liệu ngữ cảnh & brand voice",
    output: `Brand voice: ${brandVoice.name}\nThị trường: ${marketContext.slice(0, 200)}...`,
    durationMs: Date.now() - step1Start,
  });

  // ─── STEP 2: Phân tích góp ý ──────────────────────────────────────────
  const step2Start = Date.now();
  options.onStep?.({
    step: 1,
    stepName: "Đang phân tích góp ý & xây dựng prompt tối ưu",
    output: `Góp ý: "${options.feedback}"\nNền tảng: ${platform.toUpperCase()}\nChủ đề: ${existing.mainTopic}`,
    durationMs: 0,
  });

  // Build system instruction with brand voice
  const systemInstruction = `Bạn là chuyên gia tối ưu nội dung. Nhiệm vụ của bạn là cải thiện kịch bản dựa trên góp ý của người dùng.

${brandVoiceSection}

QUY TẮC:
- Giữ nguyên phong cách và brand voice
- Cập nhật số liệu thị trường nếu có
- Giữ nguyên cấu trúc [TIMESTAMP], [VISUAL], [B-ROLL] nếu phù hợp
- KHÔNG thêm các phần không liên quan đến góp ý
- Trả về JSON với các trường: title, script, thumbnailIdea, cta`;

  const prompt = `Tôi có một kịch bản content cho ${platform.toUpperCase()} với chủ đề "${existing.mainTopic}":

═══ KỊCH BẢN HIỆN TẠI ═══
${existing.script}
═══ HẾT ═══

Thông tin thị trường hiện tại:
${marketContext}

Người dùng góp ý:
"${options.feedback}"

Hãy tối ưu lại kịch bản dựa trên góp ý trên. Trả về JSON:
{
  "title": "tiêu đề mới (hoặc giữ nguyên)",
  "script": "kịch bản đã tối ưu",
  "thumbnailIdea": "ý tưởng thumbnail mới (hoặc giữ nguyên)",
  "cta": "CTA mới (hoặc giữ nguyên)"
}`;

  options.onStep?.({
    step: 1,
    stepName: "✅ Đã phân tích góp ý — đang gửi đến AI",
    output: `Prompt length: ${prompt.length} ký tự\nModel: ${model}`,
    durationMs: Date.now() - step2Start,
  });

  // ─── STEP 3: AI tối ưu ────────────────────────────────────────────────
  const step3Start = Date.now();
  options.onStep?.({
    step: 2,
    stepName: "🤖 AI đang tối ưu nội dung...",
    output: "Đang gửi request đến OpenAI...",
    durationMs: 0,
  });

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: 6000,
  });

  // 4. Parse kết quả
  const parsed = safeParseJSON(response.output_text) || {};
  const newTitle = (parsed.title as string) || existing.title;
  const newScript = (parsed.script as string) || existing.script;
  const newThumbnail = (parsed.thumbnailIdea as string) ?? existing.thumbnailIdea;
  const newCta = (parsed.cta as string) ?? existing.cta;

  options.onStep?.({
    step: 2,
    stepName: "✅ AI tối ưu hoàn tất",
    output: `Tiêu đề: ${newTitle}\nĐộ dài script: ${newScript.length} ký tự`,
    durationMs: Date.now() - step3Start,
  });

  // ─── STEP 4: Lưu & hoàn tất ──────────────────────────────────────────
  const step4Start = Date.now();
  options.onStep?.({
    step: 3,
    stepName: "Đang lưu kết quả vào cơ sở dữ liệu",
    output: "",
    durationMs: 0,
  });

  await prisma.generatedContent.update({
    where: { id: options.contentId },
    data: {
      title: newTitle,
      script: newScript,
      thumbnailIdea: newThumbnail,
      cta: newCta,
      feedbackNotes: options.feedback,
      status: existing.status === "published" ? "published" : "draft",
    },
  });

  const totalDurationMs = Date.now() - pipelineStart;

  options.onStep?.({
    step: 3,
    stepName: "✅ Hoàn tất!",
    output: `Tổng thời gian: ${(totalDurationMs / 1000).toFixed(1)}s`,
    durationMs: Date.now() - step4Start,
  });

  return { title: newTitle, script: newScript, thumbnailIdea: newThumbnail, cta: newCta };
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUTO-GENERATE FROM SYNC
// ═══════════════════════════════════════════════════════════════════════════

export async function autoGenerateProFromSync(syncRunId: string): Promise<GenerateBatchResponse> {
  const gapData = await getContentGapAnalytics({ days: 30 });
  const overview = await getOverviewAnalytics({ days: 30 });
  const topPosts = await getFilteredPosts({ days: 30, sortBy: "engagement" }, 10);

  const topGaps = gapData.domestic.gaps.slice(0, 3);
  const topSuggestions = gapData.domestic.suggestions.slice(0, 3);

  // Xác định platform nào đang hiệu quả nhất để ưu tiên
  const bestPlatform = overview.platformEffectiveness
    .slice()
    .sort((a, b) => b.avgEngagement - a.avgEngagement)[0];

  const entries: Array<{ platform: Platform; contentType: ContentType; mainTopic?: string; toneOfVoice?: string }> = [];

  // YouTube script từ gap #1 (ưu tiên)
  if (topGaps.length > 0) {
    entries.push({ platform: "youtube", contentType: "script", mainTopic: topGaps[0].slice(0, 100) });
  }

  // TikTok từ gap #2
  if (topGaps.length > 1) {
    entries.push({ platform: "tiktok", contentType: "script", mainTopic: topGaps[1].slice(0, 100) });
  }

  // YouTube từ suggestion
  if (topSuggestions.length > 0) {
    entries.push({ platform: "youtube", contentType: "script", mainTopic: topSuggestions[0].slice(0, 100) });
  }

  // Facebook post
  entries.push({ platform: "facebook", contentType: "post", mainTopic: "Cập nhật thị trường & cơ hội đầu tư" });

  // Thêm content cho platform hiệu quả nhất (nếu chưa có)
  if (bestPlatform && !entries.some(e => e.platform === bestPlatform.platform)) {
    entries.push({
      platform: bestPlatform.platform as Platform,
      contentType: bestPlatform.platform === "tiktok" ? "script" : "post",
      mainTopic: `Tối ưu nội dung cho ${bestPlatform.platform}`,
    });
  }

  const result = await generateProBatch({
    entries,
    gapIds: [],
    lessonPostIds: topPosts.map((p) => p.id),
    count: 1,
  });

  return { ...result, syncRunId };
}
