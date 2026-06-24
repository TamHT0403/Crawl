import { NextResponse } from "next/server";
import { getYouTubeStatus } from "@/lib/youtubePublish";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * GET /api/youtube/auth
 * Trả về trạng thái kết nối YouTube
 */
export async function GET() {
  try {
    const status = await getYouTubeStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({
      configured: Boolean(process.env.GOOGLE_CLIENT_ID),
      connected: false,
      authUrl: "",
      channels: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * DELETE /api/youtube/auth
 * Ngắt kết nối YouTube (xoá tokens)
 */
export async function DELETE() {
  try {
    await prisma.setting.deleteMany({
      where: { key: { in: ["youtube_tokens", "googleOAuthTokens"] } },
    });
    return NextResponse.json({ ok: true, message: "✅ Đã ngắt kết nối YouTube." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect" },
      { status: 500 }
    );
  }
}
