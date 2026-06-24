import { NextResponse } from "next/server";
import { handleCallback } from "@/lib/youtubePublish";

export const runtime = "nodejs";

/**
 * GET /api/youtube/auth/callback?code=...
 * OAuth2 callback từ Google
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL("/settings?youtube=error&reason=" + error, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?youtube=error&reason=no_code", request.url)
    );
  }

  try {
    const result = await handleCallback(code);

    // Redirect back to settings with success
    const redirectUrl = new URL("/settings", request.url);
    redirectUrl.searchParams.set("youtube", "connected");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    const redirectUrl = new URL("/settings", request.url);
    redirectUrl.searchParams.set("youtube", "error");
    redirectUrl.searchParams.set("reason", err instanceof Error ? err.message : "unknown");
    return NextResponse.redirect(redirectUrl.toString());
  }
}
