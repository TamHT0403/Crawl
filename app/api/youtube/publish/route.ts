import { NextResponse } from "next/server";
import { publishToYouTube } from "@/lib/youtubePublish";
import { getYouTubeStatus } from "@/lib/youtubePublish";
import type { YouTubePublishInput } from "@/lib/types";

export const runtime = "nodejs";

/**
 * GET /api/youtube/publish
 * Kiểm tra trạng thái kết nối YouTube
 */
export async function GET() {
  const status = await getYouTubeStatus();
  return NextResponse.json(status);
}

/**
 * POST /api/youtube/publish
 * Đăng content lên YouTube
 */
export async function POST(request: Request) {
  let body: YouTubePublishInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!body.contentId || !body.title) {
    return NextResponse.json({ error: "contentId và title là bắt buộc." }, { status: 400 });
  }

  try {
    // Sanitize description: YouTube không cho phép ký tự điều khiển, max 5000 ký tự
    const sanitizedDesc = (body.description ?? "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "") // xoá control chars
      .replace(/\r\n/g, "\n") // normalize newlines
      .replace(/\r/g, "\n")
      .slice(0, 5000); // YouTube description limit

    const result = await publishToYouTube({
      contentId: body.contentId,
      title: body.title.slice(0, 100),
      description: sanitizedDesc,
      privacyStatus: body.privacyStatus ?? "unlisted",
      scheduledAt: body.scheduledAt,
    });

    return NextResponse.json({
      ok: true,
      videoId: result.videoId,
      url: result.url,
      script: (result as any).script ?? "",
      title: (result as any).title ?? "",
      message: `✅ Script đã copy! Dán vào YouTube Studio khi upload.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đăng lên YouTube.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
