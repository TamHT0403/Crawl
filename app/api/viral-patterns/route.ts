import { NextResponse } from "next/server";
import { detectViralPatterns } from "@/lib/viralPatterns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/viral-patterns?days=90
 * Lưu ý: detectViralPatterns đã có module-level cache 2 phút
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(7, Number(searchParams.get("days") ?? 90)));

  try {
    const result = await detectViralPatterns(days);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[viral-patterns] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
