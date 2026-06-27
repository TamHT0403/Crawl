import { NextRequest, NextResponse } from "next/server";
import { checkAiQuota, clearQuotaCache } from "@/lib/aiQuota";
import { getActiveProvider } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/verify?provider=openai
 *
 * Kiểm tra API key + hạn mức của provider.
 * Kết quả được cache 5 phút bởi lib/aiQuota.
 *
 * Query params:
 *   provider  - (optional) Mặc định dùng provider đang active.
 *   refresh   - (optional) "true" để force refresh cache.
 */
export async function GET(req: NextRequest) {
  let provider = req.nextUrl.searchParams.get("provider");
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  if (!provider) {
    provider = await getActiveProvider();
  }

  if (refresh) {
    clearQuotaCache(provider);
  }

  try {
    const status = await checkAiQuota(provider);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        provider,
        valid: false,
        quotaAvailable: false,
        remaining: null,
        used: null,
        total: null,
        unit: null,
        exhausted: true,
        error: `Lỗi kiểm tra: ${err.message}`,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ai/verify
 * Body: { provider: "openai", refresh?: boolean }
 * Same as GET but with body.
 */
export async function POST(req: NextRequest) {
  let provider: string | null = null;
  let refresh = false;

  try {
    const body = await req.json();
    provider = body.provider || null;
    refresh = body.refresh === true;
  } catch {
    // ignore
  }

  if (!provider) {
    provider = await getActiveProvider();
  }

  if (refresh) {
    clearQuotaCache(provider);
  }

  try {
    const status = await checkAiQuota(provider);
    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json(
      {
        provider,
        valid: false,
        quotaAvailable: false,
        remaining: null,
        used: null,
        total: null,
        unit: null,
        exhausted: true,
        error: `Lỗi kiểm tra: ${err.message}`,
        checkedAt: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
