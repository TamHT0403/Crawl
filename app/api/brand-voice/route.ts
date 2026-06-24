import { NextResponse } from "next/server";
import { getBrandVoice, saveBrandVoice, learnBrandVoice } from "@/lib/brandVoice";
import type { BrandVoiceProfile } from "@/lib/brandVoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Request-scoped cache ──────────────────────────────────────────────────

let cachedResponse: { profile: BrandVoiceProfile; timestamp: number } | null = null;
const CACHE_TTL = 60_000; // 60 giây

/**
 * GET /api/brand-voice
 */
export async function GET() {
  // Return cached response if fresh
  if (cachedResponse && Date.now() - cachedResponse.timestamp < CACHE_TTL) {
    return NextResponse.json(cachedResponse.profile);
  }

  const profile = await getBrandVoice();
  cachedResponse = { profile, timestamp: Date.now() };
  return NextResponse.json(profile);
}

/**
 * POST /api/brand-voice
 * Action: "save" | "learn" | "reset"
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (body.action as string) || "save";

  try {
    if (action === "save") {
      const profile = body.profile as BrandVoiceProfile;
      if (!profile) {
        return NextResponse.json({ error: "profile là bắt buộc." }, { status: 400 });
      }
      await saveBrandVoice(profile);
      cachedResponse = null; // invalidate cache
      return NextResponse.json({ ok: true });
    }

    if (action === "learn") {
      const postIds = body.postIds as string[];
      if (!postIds?.length) {
        return NextResponse.json({ error: "postIds là bắt buộc (mảng ID)." }, { status: 400 });
      }
      const profile = await learnBrandVoice(postIds);
      cachedResponse = { profile, timestamp: Date.now() }; // update cache
      return NextResponse.json(profile);
    }

    if (action === "reset") {
      await saveBrandVoice({
        id: "kolia-default",
        name: "Kolia Phan",
        description: "Chuyên gia tài chính trung lập, tập trung giáo dục nhà đầu tư cá nhân",
        traits: ["chuyên gia", "trung lập", "giáo dục", "minh bạch", "dễ hiểu"],
        avoid: [
          "Không đưa khuyến nghị mua/bán cá nhân",
          "Không FOMO hoặc gây hoảng loạn",
          "Không hứa hẹn lợi nhuận",
        ],
        samplePosts: [],
        toneRules: [
          { platform: "youtube", rules: ["Mở bằng luận điểm", "Trình bày dữ liệu", "Kết bằng lưu ý rủi ro"] },
          { platform: "tiktok", rules: ["Hook 3s", "Giải thích đơn giản", "CTA theo dõi"] },
          { platform: "facebook", rules: ["Góc nhìn khác biệt", "Không bán hàng", "CTA cộng đồng"] },
        ],
        createdAt: new Date().toISOString(),
      });
      cachedResponse = null; // invalidate cache
      return NextResponse.json({ ok: true, message: "Đã reset về brand voice mặc định." });
    }

    return NextResponse.json({ error: "Unknown action. Chấp nhận: save, learn, reset" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
