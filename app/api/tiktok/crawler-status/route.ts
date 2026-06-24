import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/crawler-status
 * Proxy to social-crawler service /status endpoint.
 * Returns current crawl state: idle | running, along with target & elapsed.
 */
export async function GET() {
  const tiktokApiUrl = process.env.SOCIAL_CRAWLER_URL || "https://social-crawler.public.rke.crawl.tmtco.org";

  try {
    const res = await fetch(`${tiktokApiUrl}/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { state: "unknown", error: `Service returned ${res.status}` },
        { status: 200 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ state: "unreachable", error: "Service unreachable" }, { status: 200 });
  }
}
