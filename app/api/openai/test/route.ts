import { NextResponse } from "next/server";
import { APIError } from "openai";
import { getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from "@/lib/openai";

export const runtime = "nodejs";

type RequestBody = {
  prompt?: string;
};

export async function GET() {
  return NextResponse.json({
    configured: await isOpenAIConfigured(),
    model: await getOpenAIModel(),
    endpoint: "/api/openai/test",
    method: "POST"
  });
}

export async function POST(request: Request) {
  if (!isOpenAIConfigured()) {
    return NextResponse.json(
      {
        error: "OPENAI_API_KEY chưa được cấu hình.",
        setup: "Thêm OPENAI_API_KEY vào file .env, sau đó restart dev server."
      },
      { status: 400 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Vui lòng nhập prompt để kiểm tra OpenAI API." }, { status: 400 });
  }

  if (prompt.length > 4000) {
    return NextResponse.json({ error: "Prompt quá dài. Vui lòng giữ dưới 4.000 ký tự cho trang test này." }, { status: 400 });
  }

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();
    const response = await client.responses.create({
      model,
      input: prompt,
      instructions:
        "Bạn là chuyên gia phân tích nội dung tài chính cho Kolia Phan. Trả lời bằng tiếng Việt có dấu, rõ ràng, trung lập, không đưa ra khuyến nghị đầu tư cá nhân.",
      max_output_tokens: 700
    });

    return NextResponse.json({
      ok: true,
      model,
      responseId: response.id,
      outputText: response.output_text,
      usage: response.usage ?? null
    });
  } catch (error) {
    if (error instanceof APIError) {
      return NextResponse.json(
        {
          error: error.message,
          status: error.status,
          code: error.code,
          type: error.type,
          requestId: error.requestID
        },
        { status: error.status ?? 500 }
      );
    }

    const message = error instanceof Error ? error.message : "OpenAI API request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
