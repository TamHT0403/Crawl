import { NextResponse } from "next/server";
import { APIError } from "openai";
import { getActiveProvider, getProviderList, getAIModel, isAIConfigured, callAI } from "@/lib/openai";

export const runtime = "nodejs";

type RequestBody = {
  prompt?: string;
};

export async function GET() {
  const provider = await getActiveProvider();
  return NextResponse.json({
    configured: await isAIConfigured(),
    provider,
    providerList: getProviderList(),
    model: await getAIModel(),
    endpoint: "/api/openai/test",
    method: "POST"
  });
}

export async function POST(request: Request) {
  if (!(await isAIConfigured())) {
    return NextResponse.json(
      {
        error: "API Key chưa được cấu hình.",
        setup: "Vào Settings → Config để thêm API Key cho provider đang chọn."
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
    return NextResponse.json({ error: "Vui lòng nhập prompt để kiểm tra AI API." }, { status: 400 });
  }

  if (prompt.length > 4000) {
    return NextResponse.json({ error: "Prompt quá dài. Vui lòng giữ dưới 4.000 ký tự cho trang test này." }, { status: 400 });
  }

  try {
    const provider = await getActiveProvider();
    const model = await getAIModel();
    const outputText = await callAI(
      [
        { role: "system", content: "Bạn là chuyên gia phân tích nội dung tài chính cho Kolia Phan. Trả lời bằng tiếng Việt có dấu, rõ ràng, trung lập, không đưa ra khuyến nghị đầu tư cá nhân." },
        { role: "user", content: prompt },
      ],
      { maxTokens: 700, model }
    );

    return NextResponse.json({
      ok: true,
      provider,
      model,
      outputText,
    });
  } catch (error: any) {
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

    const message = error instanceof Error ? error.message : "AI API request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
