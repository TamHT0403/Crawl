import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/openai";
import { generateBatch, autoGenerateFromSync } from "@/lib/content-generator";
import type { GenerateBatchInput } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/content/generate
 * Trả về trạng thái cấu hình
 */
export async function GET() {
  return NextResponse.json({
    configured: isOpenAIConfigured(),
    endpoint: "/api/content/generate",
    methods: ["POST"],
  });
}

/**
 * POST /api/content/generate
 * Body: GenerateBatchInput
 *
 * Ví dụ:
 * {
 *   "entries": [
 *     { "platform": "youtube", "contentType": "script", "mainTopic": "Phân tích vàng tuần này" },
 *     { "platform": "tiktok", "contentType": "script", "mainTopic": "60s hiểu CPI" },
 *     { "platform": "facebook", "contentType": "post" }
 *   ],
 *   "marketContext": "Bối cảnh: Fed giữ lãi suất, vàng tăng...",
 *   "count": 2
 * }
 */
export async function POST(request: Request) {
  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY chưa được cấu hình.",
        setup: "Thêm OPENAI_API_KEY vào file .env, sau đó restart dev server.",
      },
      { status: 400 }
    );
  }

  const body = await request.json() as { syncRunId?: string; teamId?: string } & GenerateBatchInput;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  try {
    // Nếu có syncRunId → tự động generate từ dữ liệu sync
    if (body.syncRunId) {
      const result = await autoGenerateFromSync(body.syncRunId);
      return NextResponse.json(result);
    }

    // Batch generation theo input
    if (!body.entries || body.entries.length === 0) {
      return NextResponse.json(
        { error: "entries là bắt buộc. Ví dụ: { entries: [{ platform: 'youtube', contentType: 'script' }] }" },
        { status: 400 }
      );
    }

    const result = await generateBatch(body);

    // Gửi notification nếu có teamId
    if (body.teamId && result.totalGenerated > 0) {
      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(body.teamId as string, "content.generated", "🤖 Content được tạo",
          `AI vừa tạo **${result.totalGenerated}** nội dung mới theo yêu cầu.\nVào Content Library để duyệt.`);
      } catch { /* silent */ }
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content generation failed.";
    console.error("[content-generate] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
