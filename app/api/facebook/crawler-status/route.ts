import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/facebook/crawler-status
 * Proxy to social-crawler service /status endpoint.
 * Returns current crawl state: idle | running | unreachable, along with target & elapsed.
 *
 * Note: Facebook và TikTok share cùng social-crawler service nên /status
 * là chung cho cả hai platform.
 */
export async function GET() {
  const socialCrawlerUrl = process.env.SOCIAL_CRAWLER_URL || "https://social-crawler.public.rke.crawl.tmtco.org";

  try {
    const res = await fetch(`${socialCrawlerUrl}/status`, {
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
