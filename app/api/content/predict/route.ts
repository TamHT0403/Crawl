import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { predictPerformance } from "@/lib/predictor";

export const runtime = "nodejs";

/**
 * POST /api/content/predict
 * Dự đoán hiệu suất cho một content đã tạo
 */
export async function POST(request: Request) {
  let body: { contentId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!body.contentId) {
    return NextResponse.json({ error: "contentId là bắt buộc." }, { status: 400 });
  }

  const content = await prisma.generatedContent.findUnique({
    where: { id: body.contentId },
  });

  if (!content) {
    return NextResponse.json({ error: "Content không tồn tại." }, { status: 404 });
  }

  const score = await predictPerformance({
    platform: content.platform as "youtube" | "tiktok" | "facebook",
    title: content.title,
    script: content.script,
    mainTopic: content.mainTopic,
    toneOfVoice: content.toneOfVoice,
    contentType: content.contentType,
  });

  // Save predicted scores to DB
  await prisma.generatedContent.update({
    where: { id: content.id },
    data: {
      predictedViews: score.predictedViews,
      predictedEngagement: score.predictedEngagement,
    },
  });

  return NextResponse.json(score);
}
