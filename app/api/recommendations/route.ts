import { NextResponse } from "next/server";
import { generateRecommendations } from "@/lib/recommender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recommendations?days=30
 * Trả về danh sách đề xuất chiến lược nội dung
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number(searchParams.get("days") ?? 30)));

  try {
    const report = await generateRecommendations(days);
    return NextResponse.json(report);
  } catch (error) {
    console.error("[recommendations] Error:", error);
    return NextResponse.json(
      { error: "Không thể tạo đề xuất: " + (error instanceof Error ? error.message : "Unknown") },
      { status: 500 }
    );
  }
}
