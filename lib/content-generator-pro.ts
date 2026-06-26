/**
 * PRO Content Generator Engine — Version 4.0 (Enterprise)
 *
 * 5-Step Specialized Agent Pipeline:
 *   Step 1: DEEP RESEARCH     — Web search + Smart DB context (lean, topic-focused)
 *   Step 2: ANGLE BLUEPRINT   — Unique angle + thesis statement (minimal input)
 *   Step 3: SCENE OUTLINE     — Scene-by-scene detailed structure (blueprint only)
 *   Step 4: SCRIPT WRITER     — Word-for-word full script (scenes only, no raw data)
 *   Step 5: QA AGENT          — Objective quality assessment (separate from writer)
 *
 * Key improvements over v3:
 *   - Mỗi step chỉ nhận data CẦN THIẾT — loại bỏ context dump
 *   - Smart Context Selector: top-5 posts liên quan thay vì 10-20 posts raw
 *   - Multi-provider Web Search: tìm kiếm thông tin mới nhất (Tavily/SerpAPI)
 *   - Context Cache: tránh rebuild DB queries cho mỗi step
 *   - User-configurable token budget & niche (từ DB settings)
 *   - Backward-compatible: giữ nguyên exported types và function signatures
 */

import { prisma } from "@/lib/prisma";
import { getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from "@/lib/openai";
import { getFilteredPosts, getContentGapAnalytics, getOverviewAnalytics } from "@/lib/analytics";
import { getBrandVoice, applyBrandVoicePrompt } from "@/lib/brandVoice";
import type {
  Platform,
  ContentType,
  GenerateBatchInput,
  GenerateContentResponse,
  GenerateBatchResponse,
  GenerationOutputMode,
} from "@/lib/types";
import { fetchMarketSnapshot, formatMarketContext } from "@/lib/marketData";
import type { MarketSnapshot } from "@/lib/marketData";
import { getConfig } from "@/lib/config";
import { getCachedProContext, getCachedMarketData, setSessionStep, getSessionOutputs } from "@/lib/contextCache";
import {
  // selectTopPosts and compressPostForPrompt are used INTERNALLY by
  // buildLeanResearchContext — they are NOT dead code, just encapsulated
  // inside contextSelector.ts. Data flow: competitorPosts → selectTopPosts
  // (relevance rank) → compressPostForPrompt (token compression) → leanContext.
  buildLeanResearchContext,
  extractMarketHighlights,
} from "@/lib/contextSelector";
import {
  enrichWithWebResearch,
  getContentGenTokenBudget,
  allocateTokenBudget,
} from "@/lib/webResearch";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPE EXPORTS (backward compatible)
// ═══════════════════════════════════════════════════════════════════════════

export type StepResult = {
  step: 1 | 2 | 3 | 4 | 5;
  stepName: string;
  output: string;
  prompt: string;
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
  blueprint?: string;
  stepsCompleted?: number;
  totalDurationMs?: number;
  tokenUsage?: Record<string, number>;
};

export type StepInput = {
  step: 1 | 2 | 3 | 4 | 5;
  platform: Platform;
  outputMode?: GenerationOutputMode;
  mainTopic: string;
  marketContext?: string;
  marketSnapshot?: MarketSnapshot;
  sessionId?: string; // Dùng cho manual mode — cache step outputs
  niche?: string; // Lĩnh vực nội dung (vd: "tài chính")
  // Context from previous steps (manual mode fallback nếu không có sessionId)
  researchBrief?: string;
  blueprintRaw?: string;
  blueprintJSON?: Record<string, unknown>;
  sceneOutlineRaw?: string;
  sceneOutlineJSON?: Record<string, unknown>;
  fullScript?: string;
  // Backward compat (v3)
  outlineRaw?: string;
  outlineJSON?: Record<string, unknown>;
  // Prompt override (user-edited in manual mode)
  overriddenSystemInstruction?: string;
  overriddenUserPrompt?: string;
  /**
   * Preview-only mode — build prompt text but do NOT call the AI model.
   * Used by "Load Prompt" in Manual mode so users can inspect/edit the
   * prompt before actually running the step (zero token spend).
   * When true, the returned `output` is always an empty string.
   */
  previewOnly?: boolean;
};

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeParseJSON(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== "string") return null;

  // 1. Direct parse (fastest — works when model obeys instructions)
  const trimmed = text.trim().replace(/^\uFEFF/, ""); // strip BOM
  try { return JSON.parse(trimmed); } catch { /* continue */ }

  // 2. Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  // 3. Any ```json block anywhere in text
  const anyFence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (anyFence) {
    try { return JSON.parse(anyFence[1].trim()); } catch { /* continue */ }
  }

  // 4. Find the FIRST { and LAST } — extract the outermost JSON object
  //    This handles cases where the model adds prose before/after the JSON
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch { /* continue */ }
    // 4b. Try to fix truncated JSON by appending closing braces/brackets
    const fixAttempts = [`${candidate}]}`, `${candidate}}`];
    for (const fix of fixAttempts) {
      try { return JSON.parse(fix); } catch { /* continue */ }
    }
  }

  // 5. Find JSON array as fallback (for scenes array at top level)
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1);
    try {
      const arr = JSON.parse(candidate);
      if (Array.isArray(arr)) return { scenes: arr };
    } catch { /* continue */ }
  }

  return null;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return n.toLocaleString("vi-VN");
}
function fmtPct(rate: number | null | undefined): string {
  if (rate == null || isNaN(rate)) return "N/A";
  return `${(rate * 100).toFixed(2)}%`;
}

function resolveOutputMode(platform: Platform, outputMode?: GenerationOutputMode): GenerationOutputMode {
  if (outputMode) return outputMode;
  return platform === "facebook" ? "post" : "video";
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLATFORM STRUCTURES (kept for reference in Step 3 Outline)
// ═══════════════════════════════════════════════════════════════════════════

const PLATFORM_SCENE_GUIDE: Record<Platform, string> = {
  youtube: `YOUTUBE VIDEO (12-18 min) — Scene structure:
[HOOK] 00:00-01:30 — Mở bằng câu hỏi/tuyên bố gây tranh luận + thesis
[CONTEXT] 01:30-04:00 — Data vĩ mô + So sánh YoY/MoM
[FRAMEWORK] 04:00-08:00 — 3-5 bước phân tích với logic rõ ràng
[EVIDENCE] 08:00-12:00 — Case study + số liệu kiểm chứng
[SCENARIOS] 12:00-15:00 — Kịch bản lạc quan/trung tính/tiêu cực
[CTA] 15:00-18:00 — Tổng kết + disclaimer + call-to-action`,

  tiktok: `TIKTOK VIDEO (45-60s) — Scene structure:
[HOOK] 0-3s — Câu mở cụ thể gây tò mò (con số sốc hoặc câu hỏi)
[PROBLEM] 3-12s — Đặt bối cảnh + tại sao quan trọng
[CORE] 12-35s — 1 ý duy nhất, giải thích đơn giản + 1-2 số liệu
[PROOF] 35-50s — Case ngắn hoặc so sánh
[CTA] 50-60s — Disclaimer + theo dõi`,

  facebook: `FACEBOOK POST — Paragraph structure:
[HEADLINE] — Tiêu đề < 80 ký tự, chứa luận điểm + số liệu
[HOOK_PARA] — Mở bài: vấn đề + tại sao quan trọng ngay hôm nay
[ANALYSIS_1] — Phân tích + data point chính
[ANALYSIS_2] — Góc nhìn khác biệt / phản biện
[CONCLUSION] — Kết luận + lưu ý rủi ro
[CTA] — Câu hỏi tương tác + hashtags`,
};

const PLATFORM_FORMAT_DESC: Record<Platform, string> = {
  youtube: "YouTube video dài (12-18 phút), kịch bản word-for-word với timestamps và B-roll cues",
  tiktok: "TikTok video ngắn (45-60 giây), kịch bản súc tích từng câu từng chữ",
  facebook: "Facebook post chuyên sâu (3-5 đoạn), bài viết sẵn sàng đăng",
};

const PLATFORM_SYSTEM_INSTRUCTIONS: Record<Platform, string> = {
  youtube: `Bạn là chuyên gia scriptwriter cho kênh nội dung chuyên sâu.

NGUYÊN TẮC VÀNG:
1. LUẬN ĐIỂM RÕ RÀNG — 1 thesis duy nhất xuyên suốt toàn video
2. DỮ LIỆU KIỂM CHỨNG — Mọi nhận định phải có số liệu cụ thể
3. TRUNG LẬP — Trình bày nhiều kịch bản, không thiên vị
4. GIÁO DỤC — Người xem học được framework để tự phân tích
5. WORD-FOR-WORD — Viết lời thoại thực tế, KHÔNG viết ghi chú ý tưởng`,

  tiktok: `Bạn là chuyên gia content TikTok với phong cách nhanh, gọn, có chất lượng.

NGUYÊN TẮC:
1. 3 giây đầu quyết định — Hook phải CỰC KỲ cụ thể
2. 1 video = 1 ý duy nhất — Không nhồi nhét
3. Viết từng câu để đọc thành tiếng — Natural flow
4. WORD-FOR-WORD — Mỗi câu đều sẵn sàng để đọc trước camera`,

  facebook: `Bạn là chuyên gia content Facebook với phong cách chuyên gia sâu sắc, dễ chia sẻ.

NGUYÊN TẮC:
1. HEADLINE gây chú ý trong 2 giây
2. Viết bài hoàn chỉnh sẵn sàng đăng — không phải ghi chú
3. Mỗi đoạn 2-4 câu với câu chuyển mạch rõ ràng
4. Dữ liệu kiểm chứng — số liệu cụ thể`,
};

// ═══════════════════════════════════════════════════════════════════════════
//  PRO CONTEXT BUILDER (v4 — cached, lean)
// ═══════════════════════════════════════════════════════════════════════════

async function buildProContext(platform: Platform, days = 30) {
  const cacheKey = `${platform}-${days}`;

  return getCachedProContext(cacheKey, async () => {
    const [competitorPosts, gapData, overview, brandVoice] = await Promise.all([
      getFilteredPosts({ platform, days, sortBy: "engagement" }, 20),
      getContentGapAnalytics({ days }),
      getOverviewAnalytics({ days }),
      getBrandVoice(),
    ]);

    const platformStats = overview.platformEffectiveness.find((p) => p.platform === platform);
    const platformSummary = platformStats
      ? `${platform.toUpperCase()}: ${platformStats.postCount} bài | Eng TB: ${platformStats.avgEngagement.toFixed(2)}% | Quyết định: ${platformStats.decision}`
      : "Chưa có đủ dữ liệu";

    const gaps = gapData.domestic.gaps ?? [];
    const suggestions = gapData.domestic.suggestions ?? [];
    const viralPatterns = gapData.foreign.viralPatterns ?? [];
    const shortFormFormulas = (gapData.foreign.shortForm ?? []).slice(0, 3).map(
      (f: { title?: string; formula?: string; competitor?: string; vietnamized?: string }) =>
        `"${f.title || f.formula}": ${f.formula || ""} — ${f.competitor || "N/A"} → ${f.vietnamized || "N/A"}`
    );
    const longFormFormulas = (gapData.foreign.longForm ?? []).slice(0, 3).map(
      (f: { title?: string; formula?: string; competitor?: string; vietnamized?: string }) =>
        `"${f.title || f.formula}": ${f.formula || ""} — ${f.competitor || "N/A"} → ${f.vietnamized || "N/A"}`
    );

    const brandVoiceSection = applyBrandVoicePrompt(brandVoice, platform);

    return {
      competitorPosts,
      platformSummary,
      gaps,
      suggestions,
      viralPatterns,
      shortFormFormulas,
      longFormFormulas,
      brandVoice,
      brandVoiceSection,
      gapData,
    };
  });
}

// Export for backward compat
export { buildProContext };

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 1: DEEP RESEARCH AGENT
// ═══════════════════════════════════════════════════════════════════════════

async function stepDeepResearch(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  mainTopic: string,
  niche: string,
  leanContext: string,
  webContext: string,
  maxTokens: number,
): Promise<{ prompt: string; output: string }> {
  const systemInstruction = `Bạn là Research Analyst chuyên phân tích content cho lĩnh vực ${niche}.

NHIỆM VỤ DUY NHẤT: Đọc dữ liệu cung cấp và viết RESEARCH BRIEF ngắn gọn, actionable.

QUY TẮC NGHIÊM NGẶT:
- Viết tối đa 5 sections, mỗi section tối đa 3 bullet points
- Mỗi bullet PHẢI có con số/dẫn chứng cụ thể từ data (không nói chung chung)
- Tập trung vào ${platform.toUpperCase()} — bỏ qua thông tin không liên quan
- Kết thúc bằng "GÓC NHÌN ĐỀ XUẤT" — 1-2 câu định hướng độc đáo cho chủ đề

KHÔNG ĐƯỢC:
- Viết essay dài dòng
- Lặp lại data đã có trong input
- Đưa ra nhận định không có bằng chứng`;

  const webSection = webContext
    ? `\n${webContext}\n`
    : "\n(Web search: không có dữ liệu — chỉ dùng DB context)\n";

  const prompt = `CHỦ ĐỀ PHÂN TÍCH: "${mainTopic}"
NỀN TẢNG: ${platform.toUpperCase()}
LĨNH VỰC: ${niche}
${webSection}
${leanContext}

─────────────────────────────────────
YÊU CẦU RESEARCH BRIEF (tối đa 500 từ):

## 1. TOP VIRAL PATTERNS (3 patterns đang thắng)
## 2. HOOK INSIGHTS (loại hook hiệu quả nhất + ví dụ cụ thể)
## 3. CONTENT GAPS (2-3 cơ hội chưa ai khai thác)
## 4. DATA POINTS quan trọng nhất từ thị trường
## 5. GÓC NHÌN ĐỀ XUẤT cho chủ đề "${mainTopic}"`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: maxTokens,
  });

  return {
    prompt: `🧠 System Instruction:\n${systemInstruction}\n\n📝 User Prompt:\n${prompt}`,
    output: response.output_text,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 2: ANGLE & BLUEPRINT ARCHITECT
// ═══════════════════════════════════════════════════════════════════════════

async function stepAngleBlueprint(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  outputMode: GenerationOutputMode,
  mainTopic: string,
  niche: string,
  researchBrief: string,
  brandVoiceSummary: string,
  maxTokens: number,
): Promise<{ raw: string; parsed: Record<string, unknown>; prompt: string }> {
  const systemInstruction = `Bạn là Creative Strategist — chuyên tìm GÓC NHÌN ĐỘC ĐÁO cho content ${niche}.

NHIỆM VỤ: Dựa trên research brief, chọn 1 angle duy nhất + xây dựng blueprint ngắn gọn.

QUY TẮC:
- Title phải giật tít, dưới 70 ký tự, có con số hoặc luận điểm cụ thể
- Hook phải viết WORD-FOR-WORD (câu thật sự nói trước camera/gõ đầu bài)
- Emotional arc phải rõ: bắt đầu ở đâu, kết thúc ở đâu về mặt cảm xúc
- Trả về JSON hợp lệ, KHÔNG có markdown code block`;

  const prompt = `CHỦ ĐỀ: "${mainTopic}"
NỀN TẢNG: ${platform.toUpperCase()} — ${outputMode.toUpperCase()}
LĨNH VỰC: ${niche}
BRAND VOICE: ${brandVoiceSummary}

RESEARCH BRIEF (từ Step 1):
${researchBrief}

YÊU CẦU: Trả về JSON:
{
  "title": "Tiêu đề chính (<70 ký tự, có luận điểm + số liệu nếu có)",
  "titleVariants": ["Biến thể A/B 1", "Biến thể A/B 2", "Biến thể A/B 3"],
  "angle": "Góc nhìn độc đáo trong 1 câu — tại sao content này khác tất cả đối thủ",
  "thesis": "Luận điểm chính của toàn bộ content trong 1 câu rõ ràng",
  "uniqueHook": "Câu hook word-for-word — câu thật sự đọc đầu tiên (không chung chung)",
  "thumbnailIdea": "Mô tả thumbnail: layout, màu sắc, text overlay, biểu cảm (YouTube) hoặc cover idea (Facebook)",
  "targetAudience": "Ai là người xem lý tưởng? Họ đang lo lắng gì?",
  "emotionalArc": "Bắt đầu: [cảm xúc] → Giữa: [cảm xúc] → Kết thúc: [cảm xúc]",
  "keyMessage": "1 takeaway duy nhất người xem phải nhớ sau khi xem xong"
}`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: maxTokens,
  });

  const raw = response.output_text;
  const parsed = safeParseJSON(raw) ?? {};
  return { raw, parsed, prompt: `🧠 System Instruction:\n${systemInstruction}\n\n📝 User Prompt:\n${prompt}` };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 3: SCENE-BY-SCENE OUTLINE
// ═══════════════════════════════════════════════════════════════════════════

async function stepSceneOutline(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  outputMode: GenerationOutputMode,
  mainTopic: string,
  blueprint: Record<string, unknown>,
  marketHighlights: string[],
  maxTokens: number,
): Promise<{ raw: string; parsed: Record<string, unknown>; prompt: string }> {
  const sceneGuide = PLATFORM_SCENE_GUIDE[platform];

  const systemInstruction = `Bạn là Content Architect — chuyên thiết kế cấu trúc nội dung chi tiết từng cảnh.

NHIỆM VỤ: Dựa trên blueprint, tạo outline từng cảnh/đoạn CHI TIẾT để writer có thể viết ngay.

QUY TẮC TUYỆT ĐỐI:
- Mỗi scene phải có keyMessage CỤ THỂ (1 câu rõ ràng, không chung chung)
- dataPoint phải là số liệu thật từ market data được cung cấp (KHÔNG bịa số)
- visualCue phải đủ cụ thể để editor/đạo diễn hiểu ngay cần làm gì
- CHỈ TRẢ VỀ JSON THUẦN — KHÔNG có \`\`\`json, KHÔNG có markdown, KHÔNG có text giải thích
- Bắt đầu output bằng ký tự { và kết thúc bằng }`;

  const blueprintStr = JSON.stringify(blueprint, null, 2);
  const marketStr = marketHighlights.join("\n");

  const prompt = `CHỦ ĐỀ: "${mainTopic}"
NỀN TẢNG: ${platform.toUpperCase()} — ${outputMode.toUpperCase()}

BLUEPRINT (từ Step 2):
${blueprintStr}

DỮ LIỆU THỊ TRƯỜNG REAL-TIME (dùng cho dataPoint):
${marketStr}

CẤU TRÚC NỀN TẢNG CẦN TUÂN THEO:
${sceneGuide}

YÊU CẦU: Trả về JSON với mảng scenes:
{
  "scenes": [
    {
      "id": "hook",
      "timestamp": "00:00-01:30",
      "sceneName": "Tên cảnh",
      "keyMessage": "Ý chính của cảnh này trong 1 câu cụ thể",
      "speakingPoints": ["Điểm cần nói 1", "Điểm cần nói 2"],
      "dataPoint": "Số liệu cụ thể từ market data để dùng trong cảnh này",
      "visualCue": "Editor cần hiển thị gì (chart, text overlay, B-roll...)",
      "transitionTo": "Câu/ý nối sang cảnh tiếp theo"
    }
  ],
  "retentionCheckpoints": ["Tại 2 phút: ...", "Tại 7 phút: ..."],
  "estimatedDuration": "15:30"
}`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: maxTokens,
  });

  const raw = response.output_text;
  // Aggressive JSON extraction: strip any leading/trailing text outside {}
  const parsed = safeParseJSON(raw) ?? {};

  // Log a warning when parsing failed so we can debug
  if (!parsed.scenes) {
    console.warn("[stepSceneOutline] JSON parse produced no scenes. Raw output preview:", raw.slice(0, 300));
  }

  return { raw, parsed, prompt: `🧠 System Instruction:\n${systemInstruction}\n\n📝 User Prompt:\n${prompt}` };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 4: WORD-FOR-WORD SCRIPT WRITER
// ═══════════════════════════════════════════════════════════════════════════

async function stepScriptWriter(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  outputMode: GenerationOutputMode,
  mainTopic: string,
  blueprint: Record<string, unknown>,
  sceneOutline: Record<string, unknown>,
  brandVoiceSection: string,
  maxTokens: number,
  sceneOutlineRaw?: string, // Fallback: raw text from Step 3 when JSON parsing failed
): Promise<{ script: string; prompt: string }> {
  const isVideo = outputMode === "video";

  const writingRules = isVideo
    ? `QUY TẮC VIẾT KỊCH BẢN VIDEO (TUYỆT ĐỐI TUÂN THEO):
1. Viết TỪNG CÂU TỪNG CHỮ như đang nói thật trước camera — KHÔNG viết ý tưởng, KHÔNG bullet points
2. Thêm [TIMESTAMP: XX:XX] ở đầu mỗi scene
3. Thêm [VISUAL: mô tả] khi cần editor hiển thị gì
4. Thêm [B-ROLL: mô tả] cho footage bổ sung
5. Giọng văn tự nhiên như đang nói chuyện, KHÔNG đọc bài
6. Luôn kết thúc bằng disclaimer rủi ro + CTA rõ ràng
7. KHÔNG bịa số liệu — chỉ dùng data đã có trong scene outline`
    : `QUY TẮC VIẾT BÀI POST (TUYỆT ĐỐI TUÂN THEO):
1. Viết bài HOÀN CHỈNH sẵn sàng đăng — không phải ghi chú
2. Headline < 80 ký tự, chứa luận điểm + con số
3. Mỗi đoạn 2-4 câu, có câu chuyển mạch tự nhiên
4. Giọng văn mượt, không giáo điều, không quảng cáo
5. Kết thúc: kết luận + disclaimer + hashtags
6. KHÔNG bịa số liệu — chỉ dùng data đã có trong scene outline`;

  const systemInstruction = `${PLATFORM_SYSTEM_INSTRUCTIONS[platform]}

${writingRules}`;

  const blueprintStr = `Title: "${blueprint.title || ""}"
Angle: ${blueprint.angle || ""}
Thesis: ${blueprint.thesis || ""}
Hook: "${blueprint.uniqueHook || ""}"
Emotional Arc: ${blueprint.emotionalArc || ""}`;

  const scenesStr = (() => {
    const scenes = (sceneOutline.scenes as Array<Record<string, unknown>>) ?? [];
    if (scenes.length > 0) {
      // ✅ Normal path: structured scenes from JSON
      return scenes.map((s, i) =>
        `[Scene ${i + 1}: ${s.sceneName}]\n` +
        `- Thời gian: ${s.timestamp || ""}\n` +
        `- Ý chính: ${s.keyMessage || ""}\n` +
        `- Data point: ${s.dataPoint || "(không có)"}\n` +
        `- Visual: ${s.visualCue || ""}\n` +
        `- Transition: ${s.transitionTo || ""}\n` +
        `- Speaking points: ${Array.isArray(s.speakingPoints) ? (s.speakingPoints as string[]).join("; ") : ""}`
      ).join("\n\n");
    }
    // ⚠️ Fallback path: JSON parse failed, use raw text from Step 3
    if (sceneOutlineRaw && sceneOutlineRaw.trim().length > 50) {
      console.warn("[stepScriptWriter] Using raw scene outline fallback (JSON parse failed)");
      // Extract just the scenes array portion if possible
      const scenesMatch = sceneOutlineRaw.match(/"scenes"\s*:\s*(\[[\s\S]*?\](?=\s*[,}]))/);
      if (scenesMatch) {
        try {
          const rawScenes = JSON.parse(scenesMatch[1]) as Array<Record<string, unknown>>;
          return rawScenes.map((s, i) =>
            `[Scene ${i + 1}: ${s.sceneName}]\n` +
            `- Ý chính: ${s.keyMessage || ""}\n` +
            `- Data point: ${s.dataPoint || "(không có)"}\n` +
            `- Speaking points: ${Array.isArray(s.speakingPoints) ? (s.speakingPoints as string[]).join("; ") : ""}`
          ).join("\n\n");
        } catch { /* continue to raw fallback */ }
      }
      // Last resort: pass the raw text directly so writer has SOME structure
      return `[Raw Scene Outline từ Step 3 — dùng làm cơ sở viết kịch bản]:\n${sceneOutlineRaw.slice(0, 3000)}`;
    }
    return "(Không có scene outline — viết dựa trên blueprint và brand voice)"; 
  })();

  const prompt = `CHỦ ĐỀ: "${mainTopic}"
NỀN TẢNG: ${platform.toUpperCase()} — ${outputMode.toUpperCase()}

BLUEPRINT:
${blueprintStr}

${brandVoiceSection}

SCENES CHI TIẾT (từ Step 3):
${scenesStr}

BẮT ĐẦU VIẾT KỊCH BẢN HOÀN CHỈNH:`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: maxTokens,
  });

  return {
    script: response.output_text,
    prompt: `🧠 System Instruction:\n${systemInstruction}\n\n📝 User Prompt:\n${prompt}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP 5: QA AGENT (Objective Quality Assessment)
// ═══════════════════════════════════════════════════════════════════════════

const QA_JSON_TEMPLATE_VIDEO = `{
  "hookScore": 8.5,
  "hookStrength": "strong",
  "retentionRisks": ["Tại 3:00 — mô tả rủi ro cụ thể"],
  "alternativeHooks": ["Hook thay thế 1", "Hook thay thế 2", "Hook thay thế 3"],
  "seoTitle": "Tiêu đề SEO tối ưu (max 60 ký tự)",
  "seoDescription": "Mô tả SEO (max 160 ký tự)",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "qualityChecklist": {
    "hasDataPoints": true,
    "hasVisualCues": true,
    "hasRiskDisclaimer": true,
    "hasTimestamps": true,
    "hasBRollSuggestions": true,
    "hasStrongHeadline": true,
    "hasClearParagraphFlow": true,
    "hasActionableTakeaways": true,
    "estimatedDuration": "15:30",
    "readabilityLevel": "easy"
  },
  "keyTakeaways": ["Key 1", "Key 2", "Key 3"],
  "competitorReferences": ["Ref 1", "Ref 2"],
  "cta": "Call-to-action cụ thể",
  "titleVariants": []
}`;

const QA_JSON_TEMPLATE_POST = `{
  "hookScore": 8.5,
  "hookStrength": "strong",
  "retentionRisks": ["Mô tả điểm cụ thể trong bài có thể khiến người đọc dừng lại"],
  "alternativeHooks": ["Hook thay thế 1 (dựa trên con số cụ thể)", "Hook thay thế 2 (dựa trên case study)", "Hook thay thế 3 (dựa trên luận điểm tranh luận)"],
  "seoTitle": "Tiêu đề SEO tối ưu (max 60 ký tự)",
  "seoDescription": "Mô tả SEO (max 160 ký tự)",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "qualityChecklist": {
    "hasDataPoints": true,
    "hasRiskDisclaimer": true,
    "hasStrongHeadline": true,
    "hasClearParagraphFlow": true,
    "hasActionableTakeaways": true,
    "hasEngagingCTA": true,
    "readabilityLevel": "easy"
  },
  "keyTakeaways": ["Key 1", "Key 2", "Key 3"],
  "competitorReferences": ["Tên đối thủ liên quan"],
  "cta": "Câu hỏi tương tác cụ thể",
  "titleVariants": []
}`;

async function stepQAAgent(
  client: { responses: { create: (params: Record<string, unknown>) => Promise<{ output_text: string }> } },
  model: string,
  platform: Platform,
  outputMode: GenerationOutputMode,
  fullScript: string,
  blueprint: Record<string, unknown>,
  maxTokens: number,
): Promise<{ metrics: Record<string, unknown>; prompt: string }> {
  const isPost = outputMode === "post";
  const QA_JSON_TEMPLATE = isPost ? QA_JSON_TEMPLATE_POST : QA_JSON_TEMPLATE_VIDEO;

  const hookRubric = isPost
    ? `RUBRIC HOOK SCORE CHO FACEBOOK POST:
- 9-10: Câu đầu có con số cụ thể + luận điểm gây tranh luận ngay lập tức
- 7-8: Câu đầu đặt vấn đề rõ + khai thác tâm lý sợ thua lỗ/FOMO của nhà đầu tư
- 5-6: Câu đầu đặt câu hỏi nhưng chung chung, không có số liệu
- 3-4: Câu đầu giáo điều hoặc không gây được cảm xúc ngay
- 1-2: Câu đầu nhạt hoặc không liên quan đến nỗi đau của người đọc`
    : `RUBRIC HOOK SCORE CHO VIDEO:
- 9-10: 3 giây đầu có luận điểm tranh luận mạnh + con số cụ thể
- 7-8: Hook đặt vấn đề rõ, tạo tò mò, có dữ liệu
- 5-6: Hook đặt câu hỏi nhưng thiếu độ cụ thể hoặc số liệu
- 3-4: Hook bắt đầu bằng giới thiệu bản thân hoặc chủ đề chung
- 1-2: Hook mờ hoặc giọng văn báo cáo`;

  const systemInstruction = `Bạn là QA Editor độc lập — đánh giá chất lượng content một cách KHÁCH QUAN.

NHIỆM VỤ: Đọc kịch bản và đánh giá theo các tiêu chí sau.

${hookRubric}

QUY TẮC:
- Chấm điểm dựa trên THỰC TẾ script — không đánh giá cảm tính
- retentionRisks: chỉ liệt kê điểm CỤ THỂ trong script có thể khiến người đọc dừng lại
- alternativeHooks: viết 3 hook KHÁC hoàn toàn (không sửa hook cũ) — mỗi hook phải có con số hoặc luận điểm cụ thể
- CHỈ TRẢ VỀ JSON THUẦN — bắt đầu bằng { kết thúc bằng } — KHÔNG có text giải thích, KHÔNG có markdown`;

  const prompt = `NỀN TẢNG: ${platform.toUpperCase()} — ${outputMode.toUpperCase()}
TITLE: "${blueprint.title || ""}"
ANGLE: ${blueprint.angle || ""}

KỊCH BẢN CẦN ĐÁNH GIÁ:
${fullScript.slice(0, 4000)}${fullScript.length > 4000 ? "\n...[truncated]" : ""}

Trả về JSON (không có markdown):
${QA_JSON_TEMPLATE}`;

  const response = await client.responses.create({
    model,
    input: prompt,
    instructions: systemInstruction,
    max_output_tokens: maxTokens,
  });

  const metrics = safeParseJSON(response.output_text) ?? {};

  // Auto-compute hookScore nếu AI quên trả về
  if (metrics.hookScore == null) {
    const checklist = (metrics.qualityChecklist as Record<string, unknown>) ?? {};
    const positives = [
      checklist.hasDataPoints,
      checklist.hasRiskDisclaimer,
      checklist.hasStrongHeadline,
      checklist.hasClearParagraphFlow,
      checklist.hasActionableTakeaways,
    ].filter(Boolean).length;
    metrics.hookScore = Math.min(10, 5 + positives * 0.8);
  }

  return {
    metrics,
    prompt: `🧠 System Instruction:\n${systemInstruction}\n\n📝 User Prompt:\n${prompt}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTED HELPERS — for manual step execution
// ═══════════════════════════════════════════════════════════════════════════

export async function executeStep(
  input: StepInput,
): Promise<StepResult & { output: string; parsed?: Record<string, unknown> }> {
  if (!(await isOpenAIConfigured())) {
    throw new Error("OpenAI chưa được cấu hình. Vào Settings để thêm API key.");
  }

  // ─── Preview-only: use a no-op stub client that captures prompt
  // ─── without sending any request to the AI provider.
  let capturedPromptForPreview = "";
  const noopClient = {
    responses: {
      create: async (params: Record<string, unknown>): Promise<{ output_text: string }> => {
        // Record what the real prompt would have been (for debugging/display)
        capturedPromptForPreview = String(params.input ?? "");
        return { output_text: "" };
      },
    },
  };

  const client = input.previewOnly
    ? (noopClient as unknown as Awaited<ReturnType<typeof getOpenAIClient>>)
    : await getOpenAIClient();
  const model = await getOpenAIModel();
  const startTime = Date.now();
  const outputMode = resolveOutputMode(input.platform, input.outputMode);

  // ─── Get token budget ─────────────────────────────────────────────────
  const totalBudget = await getContentGenTokenBudget();
  const budget = allocateTokenBudget(totalBudget);

  // ─── Get niche from DB or input ────────────────────────────────────────
  const niche = input.niche || (await getConfig("content_gen_niche")) || "tài chính";

  // ─── Market data (cached) ──────────────────────────────────────────────
  let snapshot = input.marketSnapshot;
  if (!snapshot) {
    snapshot = await getCachedMarketData(() => fetchMarketSnapshot().catch(() => null)) ?? undefined;
  }
  const marketHighlights = extractMarketHighlights(snapshot ?? null);

  // ─── Context (cached DB) ───────────────────────────────────────────────
  const ctx = await buildProContext(input.platform);

  // ─── Resolve session outputs (manual mode) ─────────────────────────────
  const session = input.sessionId ? getSessionOutputs(input.sessionId) : null;

  let output = "";
  let parsed: Record<string, unknown> | undefined;
  let stepName = "";
  let prompt = "";

  switch (input.step) {
    case 1: {
      stepName = "Deep Research";

      // Build lean context
      const leanCtx = buildLeanResearchContext({
        platform: input.platform,
        topic: input.mainTopic,
        competitorPosts: ctx.competitorPosts as Parameters<typeof buildLeanResearchContext>[0]["competitorPosts"],
        platformSummary: ctx.platformSummary,
        gaps: ctx.gaps,
        suggestions: ctx.suggestions,
        viralPatterns: ctx.viralPatterns,
        shortFormFormulas: ctx.shortFormFormulas,
        longFormFormulas: ctx.longFormFormulas,
        marketHighlights,
      });

      // Web research enrichment
      const webEnrichment = await enrichWithWebResearch(input.mainTopic, niche);

      if (input.overriddenUserPrompt) {
        const sysInst = input.overriddenSystemInstruction ||
          `Bạn là Research Analyst chuyên phân tích content ${niche}. Viết research brief ngắn gọn với dữ liệu cụ thể.`;
        const resp = await client.responses.create({
          model, input: input.overriddenUserPrompt,
          instructions: sysInst, max_output_tokens: budget.step1,
        });
        output = resp.output_text;
        prompt = `🧠 System Instruction:\n${sysInst}\n\n📝 User Prompt (edited):\n${input.overriddenUserPrompt}`;
      } else {
        const result = await stepDeepResearch(
          client, model, input.platform, input.mainTopic, niche,
          leanCtx, webEnrichment.formattedWebContext, budget.step1,
        );
        output = result.output;
        prompt = result.prompt;
      }

      if (input.sessionId) {
        setSessionStep(input.sessionId, 1, output, undefined, {
          platform: input.platform, mainTopic: input.mainTopic, outputMode,
        });
      }
      break;
    }

    case 2: {
      stepName = "Angle & Blueprint";

      const researchBrief = input.researchBrief
        || session?.step1
        || "Chưa có research brief từ Step 1.";

      const brandVoiceSummary = `${ctx.brandVoice.name} — ${ctx.brandVoice.traits.slice(0, 2).join(", ")}`;

      if (input.overriddenUserPrompt) {
        const sysInst = input.overriddenSystemInstruction ||
          `Bạn là Creative Strategist. Chọn góc nhìn độc đáo và build blueprint. Trả về JSON.`;
        const resp = await client.responses.create({
          model, input: input.overriddenUserPrompt,
          instructions: sysInst, max_output_tokens: budget.step2,
        });
        output = resp.output_text;
        parsed = safeParseJSON(output) ?? {};
        prompt = `🧠 System Instruction:\n${sysInst}\n\n📝 User Prompt (edited):\n${input.overriddenUserPrompt}`;
      } else {
        const result = await stepAngleBlueprint(
          client, model, input.platform, outputMode, input.mainTopic, niche,
          researchBrief, brandVoiceSummary, budget.step2,
        );
        output = result.raw;
        parsed = result.parsed;
        prompt = result.prompt;
      }

      if (input.sessionId) setSessionStep(input.sessionId, 2, output, parsed);
      break;
    }

    case 3: {
      stepName = "Scene Outline";

      const blueprintJSON = input.blueprintJSON
        || (input.outlineJSON ?? null)  // backward compat
        || session?.step2Parsed
        || {};
      const blueprintRaw = input.blueprintRaw || (input.outlineRaw ?? "") || session?.step2 || "";

      const bp = Object.keys(blueprintJSON).length > 0 ? blueprintJSON : (safeParseJSON(blueprintRaw) ?? {});

      if (input.overriddenUserPrompt) {
        const sysInst = input.overriddenSystemInstruction ||
          `Bạn là Content Architect. Tạo scene outline chi tiết. Trả về JSON.`;
        const resp = await client.responses.create({
          model, input: input.overriddenUserPrompt,
          instructions: sysInst, max_output_tokens: budget.step3,
        });
        output = resp.output_text;
        parsed = safeParseJSON(output) ?? {};
        prompt = `🧠 System Instruction:\n${sysInst}\n\n📝 User Prompt (edited):\n${input.overriddenUserPrompt}`;
      } else {
        const result = await stepSceneOutline(
          client, model, input.platform, outputMode, input.mainTopic,
          bp, marketHighlights, budget.step3,
        );
        output = result.raw;
        parsed = result.parsed;
        prompt = result.prompt;
      }

      if (input.sessionId) setSessionStep(input.sessionId, 3, output, parsed);
      break;
    }

    case 4: {
      stepName = "Script Writer";

      const blueprintJSON = input.blueprintJSON
        || (input.outlineJSON ?? null)
        || session?.step2Parsed
        || {};
      const blueprintRaw = input.blueprintRaw || (input.outlineRaw ?? "") || session?.step2 || "";
      const bp = Object.keys(blueprintJSON).length > 0 ? blueprintJSON : (safeParseJSON(blueprintRaw) ?? {});

      const sceneOutlineJSON = input.sceneOutlineJSON || session?.step3Parsed || {};
      const sceneOutlineRaw = input.sceneOutlineRaw || session?.step3 || "";
      const scenes = Object.keys(sceneOutlineJSON).length > 0
        ? sceneOutlineJSON
        : (safeParseJSON(sceneOutlineRaw) ?? {});

      if (input.overriddenUserPrompt) {
        const sysInst = input.overriddenSystemInstruction || PLATFORM_SYSTEM_INSTRUCTIONS[input.platform];
        const resp = await client.responses.create({
          model, input: input.overriddenUserPrompt,
          instructions: sysInst, max_output_tokens: budget.step4,
        });
        output = resp.output_text;
        prompt = `🧠 System Instruction:\n${sysInst}\n\n📝 User Prompt (edited):\n${input.overriddenUserPrompt}`;
      } else {
        const result = await stepScriptWriter(
          client, model, input.platform, outputMode, input.mainTopic,
          bp, scenes, ctx.brandVoiceSection, budget.step4,
          sceneOutlineRaw, // ← raw fallback in case JSON parse failed
        );
        output = result.script;
        prompt = result.prompt;
      }

      if (input.sessionId) setSessionStep(input.sessionId, 4, output);
      break;
    }

    case 5: {
      stepName = "QA & Optimize";

      const fullScript = input.fullScript || session?.step4 || "";
      const blueprintJSON = input.blueprintJSON || session?.step2Parsed || {};

      if (input.overriddenUserPrompt) {
        const sysInst = input.overriddenSystemInstruction ||
          `Bạn là QA Editor độc lập. Đánh giá chất lượng script. Trả về JSON.`;
        const resp = await client.responses.create({
          model, input: input.overriddenUserPrompt,
          instructions: sysInst, max_output_tokens: budget.step5,
        });
        output = resp.output_text;
        parsed = safeParseJSON(output) ?? {};
        prompt = `🧠 System Instruction:\n${sysInst}\n\n📝 User Prompt (edited):\n${input.overriddenUserPrompt}`;
      } else {
        const result = await stepQAAgent(
          client, model, input.platform, outputMode,
          fullScript, blueprintJSON, budget.step5,
        );
        output = JSON.stringify(result.metrics);
        parsed = result.metrics;
        prompt = result.prompt;
      }

      if (input.sessionId) setSessionStep(input.sessionId, 5, output, parsed);
      break;
    }

    default:
      throw new Error(`Step không hợp lệ: ${(input as { step: number }).step}. Hỗ trợ: 1-5.`);
  }

  return {
    step: input.step,
    stepName,
    output,
    prompt,
    parsed,
    durationMs: Date.now() - startTime,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN PIPELINE: generateProContent() — 5-Step Engine
// ═══════════════════════════════════════════════════════════════════════════

export async function generateProContent(options: {
  platform: Platform;
  contentType: ContentType;
  outputMode?: GenerationOutputMode;
  mainTopic?: string;
  toneOfVoice?: string;
  marketContext?: string;
  marketSnapshot?: MarketSnapshot;
  niche?: string;
  onStepComplete?: (result: StepResult) => void;
}): Promise<ProGenerateResult> {
  if (!(await isOpenAIConfigured())) {
    throw new Error("OpenAI chưa được cấu hình. Vào Settings để thêm API key.");
  }

  const client = await getOpenAIClient();
  const model = await getOpenAIModel();
  const pipelineStart = Date.now();
  const outputMode = resolveOutputMode(options.platform, options.outputMode);
  const mainTopic = options.mainTopic || "Phân tích thị trường";
  const niche = options.niche || (await getConfig("content_gen_niche")) || "tài chính";

  // ─── Token budget ──────────────────────────────────────────────────────
  const totalBudget = await getContentGenTokenBudget();
  const budget = allocateTokenBudget(totalBudget);

  // ─── Market data (parallel fetch + cache) ─────────────────────────────
  let snapshot = options.marketSnapshot;
  if (!snapshot) {
    snapshot = await getCachedMarketData(() => fetchMarketSnapshot().catch(() => null)) ?? undefined;
  }
  const marketHighlights = extractMarketHighlights(snapshot ?? null);

  // ─── DB Context (cached) ───────────────────────────────────────────────
  const ctx = await buildProContext(options.platform);

  // ─── Web research (parallel với context build) ──────────────────────
  const webEnrichment = await enrichWithWebResearch(mainTopic, niche);

  // ─── STEP 1: DEEP RESEARCH ────────────────────────────────────────────
  const s1Start = Date.now();
  const leanCtx = buildLeanResearchContext({
    platform: options.platform,
    topic: mainTopic,
    competitorPosts: ctx.competitorPosts as Parameters<typeof buildLeanResearchContext>[0]["competitorPosts"],
    platformSummary: ctx.platformSummary,
    gaps: ctx.gaps,
    suggestions: ctx.suggestions,
    viralPatterns: ctx.viralPatterns,
    shortFormFormulas: ctx.shortFormFormulas,
    longFormFormulas: ctx.longFormFormulas,
    marketHighlights,
  });

  const step1 = await stepDeepResearch(
    client, model, options.platform, mainTopic, niche,
    leanCtx, webEnrichment.formattedWebContext, budget.step1,
  );
  const s1Dur = Date.now() - s1Start;
  const researchBrief = step1.output;

  options.onStepComplete?.({ step: 1, stepName: "Deep Research", output: researchBrief, prompt: step1.prompt, durationMs: s1Dur });

  // ─── STEP 2: ANGLE BLUEPRINT ───────────────────────────────────────────
  const s2Start = Date.now();
  const brandVoiceSummary = `${ctx.brandVoice.name} — ${ctx.brandVoice.traits.slice(0, 2).join(", ")}`;
  const step2 = await stepAngleBlueprint(
    client, model, options.platform, outputMode, mainTopic, niche,
    researchBrief, brandVoiceSummary, budget.step2,
  );
  const s2Dur = Date.now() - s2Start;
  const blueprint = step2.parsed;

  options.onStepComplete?.({ step: 2, stepName: "Angle & Blueprint", output: step2.raw, prompt: step2.prompt, durationMs: s2Dur });

  // ─── STEP 3: SCENE OUTLINE ─────────────────────────────────────────────
  const s3Start = Date.now();
  const step3 = await stepSceneOutline(
    client, model, options.platform, outputMode, mainTopic,
    blueprint, marketHighlights, budget.step3,
  );
  const s3Dur = Date.now() - s3Start;
  const sceneOutline = step3.parsed;

  options.onStepComplete?.({ step: 3, stepName: "Scene Outline", output: step3.raw, prompt: step3.prompt, durationMs: s3Dur });

  // ─── STEP 4: SCRIPT WRITER ─────────────────────────────────────────────
  const s4Start = Date.now();
  const step4 = await stepScriptWriter(
    client, model, options.platform, outputMode, mainTopic,
    blueprint, sceneOutline, ctx.brandVoiceSection, budget.step4,
    step3.raw, // ← pass raw as fallback in case JSON parsing failed
  );
  const s4Dur = Date.now() - s4Start;
  const fullScript = step4.script;

  options.onStepComplete?.({ step: 4, stepName: "Script Writer", output: fullScript, prompt: step4.prompt, durationMs: s4Dur });

  // ─── STEP 5: QA AGENT ─────────────────────────────────────────────────
  const s5Start = Date.now();
  const step5 = await stepQAAgent(
    client, model, options.platform, outputMode,
    fullScript, blueprint, budget.step5,
  );
  const s5Dur = Date.now() - s5Start;
  const metrics = step5.metrics;

  options.onStepComplete?.({ step: 5, stepName: "QA & Optimize", output: JSON.stringify(metrics), prompt: step5.prompt, durationMs: s5Dur });

  const totalDurationMs = Date.now() - pipelineStart;

  // ─── Assemble final result ─────────────────────────────────────────────
  const title = (blueprint.title as string)
    || (metrics.seoTitle as string)
    || mainTopic.slice(0, 80);

  // Merge titleVariants from blueprint + QA
  const titleVariants = [
    ...((blueprint.titleVariants as string[]) ?? []),
    ...((metrics.titleVariants as string[]) ?? []),
  ].filter(Boolean).slice(0, 5);

  return {
    title: title.slice(0, 100),
    script: fullScript,
    thumbnailIdea: (blueprint.thumbnailIdea as string) || undefined,
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
    titleVariants: titleVariants.length ? titleVariants : undefined,
    researchBrief,
    outline: step3.raw,
    blueprint: step2.raw,
    stepsCompleted: 5,
    totalDurationMs,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export async function generateProBatch(input: GenerateBatchInput): Promise<GenerateBatchResponse> {
  if (!(await isOpenAIConfigured())) throw new Error("OpenAI chưa được cấu hình.");

  const items: GenerateContentResponse[] = [];
  const count = input.count ?? 1;

  for (const entry of input.entries) {
    for (let i = 0; i < count; i++) {
      const result = await generateProContent({
        platform: entry.platform,
        contentType: entry.contentType,
        outputMode: entry.outputMode,
        mainTopic: entry.mainTopic,
        toneOfVoice: entry.toneOfVoice,
        marketContext: input.marketContext,
      });

      let rawTitle: string;
      if (typeof result.title === "object" && result.title !== null) {
        rawTitle = result.mainTopic || "";
      } else {
        rawTitle = String(result.title ?? "");
      }

      const cleanTitle = (rawTitle || result.mainTopic || "Phân tích thị trường")
        .replace(/^[{[]+/, "")
        .trim()
        .replace(new RegExp(`^(${escapeRegex(result.mainTopic?.split(" ")[0] || "")})\\s+\\1`, "i"), "$1 ")
        .trim() || result.mainTopic || "Phân tích thị trường";

      const scriptSections = [
        `# ${cleanTitle}`,
        ``,
        result.script,
        ``,
        `---`,
      ];
      if (result.keyTakeaways?.length) {
        scriptSections.push(`### 📌 Key Takeaways`, ...result.keyTakeaways.map((k) => `- ${k}`), ``);
      }
      if (result.alternativeHooks?.length) {
        scriptSections.push(`### 🎯 Hook thay thế`, ...result.alternativeHooks.map((h, idx) => `${idx + 1}. ${h}`), ``);
      }
      if (result.hashtags?.length) {
        scriptSections.push(`### 🏷️ Hashtags`, result.hashtags.join(" "), ``);
      }
      if (result.hookScore != null) {
        scriptSections.push(
          `### 📊 Điểm đánh giá`,
          `- Hook Score: ${result.hookScore}/10`,
          `- SEO Title: ${result.seoTitle || "N/A"}`,
          `- Tổng thời gian: ${((result.totalDurationMs || 0) / 1000).toFixed(1)}s (5 bước)`,
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
//  OPTIMIZE — Tối ưu lại nội dung theo góp ý
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
  if (!(await isOpenAIConfigured())) throw new Error("OpenAI chưa được cấu hình.");

  const pipelineStart = Date.now();
  const existing = await prisma.generatedContent.findUnique({ where: { id: options.contentId } });
  if (!existing) throw new Error("Không tìm thấy nội dung.");

  const platform = existing.platform as Platform;
  const client = await getOpenAIClient();
  const model = await getOpenAIModel();
  const niche = (await getConfig("content_gen_niche")) || "tài chính";

  const s1Start = Date.now();
  options.onStep?.({ step: 0, stepName: "Tải dữ liệu ngữ cảnh", output: "Loading brand voice & market data...", durationMs: 0 });

  const [brandVoice, snapshot] = await Promise.all([
    getBrandVoice(),
    getCachedMarketData(() => fetchMarketSnapshot().catch(() => null)),
  ]);
  const brandVoiceSection = applyBrandVoicePrompt(brandVoice, platform);
  const marketContext = snapshot ? formatMarketContext(snapshot) : "(Không có dữ liệu thị trường real-time)";

  options.onStep?.({ step: 0, stepName: "✅ Đã tải dữ liệu", output: `Brand: ${brandVoice.name}`, durationMs: Date.now() - s1Start });

  const systemInstruction = `Bạn là chuyên gia tối ưu nội dung ${niche}.
${brandVoiceSection}
QUY TẮC:
- Giữ nguyên phong cách và brand voice
- Cập nhật số liệu thị trường nếu có
- Giữ markers [TIMESTAMP], [VISUAL], [B-ROLL] nếu phù hợp
- Trả về JSON: { title, script, thumbnailIdea, cta }`;

  const prompt = `Platform: ${platform.toUpperCase()}, Chủ đề: "${existing.mainTopic}"

Thị trường hiện tại: ${marketContext.slice(0, 500)}

Kịch bản hiện tại:
${existing.script}

Góp ý: "${options.feedback}"

Tối ưu và trả về JSON:`;

  options.onStep?.({ step: 1, stepName: "AI đang tối ưu...", output: "", durationMs: 0 });
  const s3Start = Date.now();

  const totalBudget = await getContentGenTokenBudget();
  const response = await client.responses.create({
    model, input: prompt,
    instructions: systemInstruction,
    max_output_tokens: Math.min(Math.round(totalBudget * 0.5), 8000),
  });

  const optParsed = safeParseJSON(response.output_text) ?? {};
  const newTitle = (optParsed.title as string) || existing.title;
  const newScript = (optParsed.script as string) || existing.script;
  const newThumbnail = (optParsed.thumbnailIdea as string) ?? existing.thumbnailIdea;
  const newCta = (optParsed.cta as string) ?? existing.cta;

  options.onStep?.({ step: 1, stepName: "✅ AI hoàn tất", output: `Title: ${newTitle}`, durationMs: Date.now() - s3Start });

  await prisma.generatedContent.update({
    where: { id: options.contentId },
    data: {
      title: newTitle, script: newScript,
      thumbnailIdea: newThumbnail, cta: newCta,
      feedbackNotes: options.feedback,
      status: existing.status === "published" ? "published" : "draft",
    },
  });

  options.onStep?.({ step: 2, stepName: "✅ Hoàn tất!", output: `${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`, durationMs: 0 });

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

  const bestPlatform = overview.platformEffectiveness
    .slice()
    .sort((a, b) => b.avgEngagement - a.avgEngagement)[0];

  const entries: Array<{ platform: Platform; contentType: ContentType; mainTopic?: string; toneOfVoice?: string }> = [];

  if (topGaps.length > 0) entries.push({ platform: "youtube", contentType: "script", mainTopic: topGaps[0].slice(0, 100) });
  if (topGaps.length > 1) entries.push({ platform: "tiktok", contentType: "script", mainTopic: topGaps[1].slice(0, 100) });
  if (topSuggestions.length > 0) entries.push({ platform: "youtube", contentType: "script", mainTopic: topSuggestions[0].slice(0, 100) });
  entries.push({ platform: "facebook", contentType: "post", mainTopic: "Cập nhật thị trường & cơ hội đầu tư" });

  if (bestPlatform && !entries.some((e) => e.platform === bestPlatform.platform)) {
    entries.push({
      platform: bestPlatform.platform as Platform,
      contentType: bestPlatform.platform === "tiktok" ? "script" : "post",
      mainTopic: `Phân tích chuyên sâu ${bestPlatform.platform}`,
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
