import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/nlQuery";
import type { NLQueryRequest } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/query
 * Hỏi đáp thông minh bằng tiếng Việt về dữ liệu crawl
 *
 * Body: { "question": "Đối thủ nào đang có content về vàng hiệu quả?" }
 */
export async function POST(request: Request) {
  let body: NLQueryRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "Vui lòng nhập câu hỏi." }, { status: 400 });
  }

  if (body.question.length > 500) {
    return NextResponse.json({ error: "Câu hỏi quá dài. Tối đa 500 ký tự." }, { status: 400 });
  }

  try {
    const result = await answerQuestion(body.question.trim());
    return NextResponse.json(result);
  } catch (error) {
    console.error("[nlquery] Error:", error);
    return NextResponse.json(
      {
        answer: "❌ Lỗi xử lý: " + (error instanceof Error ? error.message : "Unknown"),
        confidence: "low" as const,
      },
      { status: 500 }
    );
  }
}
