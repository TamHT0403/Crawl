import { answerQuestion } from "@/lib/nlQuery";
import { type NLQueryRequest } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/query
 * Intelligent Vietnamese Q&A for crawled data.
 * Returns plain JSON: { answer, confidence, suggestedActions, data, _meta }
 */
export async function POST(request: Request) {
  let body: NLQueryRequest;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Request body phải là JSON hợp lệ." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const question = body.question?.trim();
  if (!question) {
    return new Response(JSON.stringify({ error: "Vui lòng nhập câu hỏi." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (question.length > 500) {
    return new Response(JSON.stringify({ error: "Câu hỏi quá dài. Tối đa 500 ký tự." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await answerQuestion(question);

    return new Response(
      JSON.stringify({
        answer: result.answer,
        confidence: result.confidence,
        suggestedActions: result.suggestedActions ?? [],
        data: result.data,
        _meta: (result as any)._meta,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[api/query] Error:", error);
    return new Response(
      JSON.stringify({
        error: "Lỗi xử lý câu hỏi.",
        answer: "❌ Đã xảy ra lỗi khi xử lý câu hỏi. Vui lòng thử lại.",
        confidence: "low",
        suggestedActions: [],
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

