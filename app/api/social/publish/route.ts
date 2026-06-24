import { NextResponse } from "next/server";
import { publishToFacebook, publishToTikTok } from "@/lib/socialPublish";
import type { SocialPublishInput } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/social/publish
 * Đăng content lên Facebook hoặc TikTok
 *
 * Body:
 * {
 *   "contentId": "...",
 *   "platform": "facebook" | "tiktok",
 *   "title": "...",
 *   "description": "...",
 *   "privacyStatus": "public" | "private",
 *   "scheduledAt": "2026-07-01T08:00:00Z" (optional)
 * }
 */
export async function POST(request: Request) {
  let body: SocialPublishInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!body.contentId || !body.platform || !body.title) {
    return NextResponse.json(
      { error: "contentId, platform và title là bắt buộc." },
      { status: 400 }
    );
  }

  if (!["facebook", "tiktok"].includes(body.platform)) {
    return NextResponse.json(
      { error: "platform phải là 'facebook' hoặc 'tiktok'." },
      { status: 400 }
    );
  }

  try {
    const result = body.platform === "facebook"
      ? await publishToFacebook(body)
      : await publishToTikTok(body);

    return NextResponse.json(result, result.ok ? { status: 200 } : { status: 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish failed.";
    return NextResponse.json({ ok: false, platform: body.platform, message }, { status: 500 });
  }
}
