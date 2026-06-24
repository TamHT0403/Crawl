import { NextResponse } from "next/server";
import { simulateABTest } from "@/lib/abTest";
import type { ABTestInput } from "@/lib/abTest";

export const runtime = "nodejs";

/**
 * POST /api/ab-test
 * So sánh A/B content và dự đoán kết quả
 *
 * Body:
 * {
 *   "platform": "youtube",
 *   "versionA": { "title": "..." },
 *   "versionB": { "title": "..." },
 *   "context": "Bối cảnh thị trường hiện tại..."
 * }
 */
export async function POST(request: Request) {
  let body: ABTestInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.platform || !body.versionA?.title || !body.versionB?.title) {
    return NextResponse.json(
      { error: "platform, versionA.title, versionB.title là bắt buộc." },
      { status: 400 }
    );
  }

  try {
    const result = await simulateABTest(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AB test failed" },
      { status: 500 }
    );
  }
}
