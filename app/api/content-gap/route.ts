import { NextResponse } from "next/server";
import { getContentGapAnalytics } from "@/lib/analytics";
import type { Platform, SourceType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Module-level cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 120_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(365, Math.max(7, Number(searchParams.get("days") ?? 90)));
  const platform = (searchParams.get("platform") ?? undefined) as Platform | "all" | undefined;
  const source = (searchParams.get("source") ?? undefined) as SourceType | "all" | undefined;
  const cacheKey = `days=${days}&platform=${platform ?? ""}&source=${source ?? ""}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const gap = await getContentGapAnalytics({ days, platform, source });
    cache.set(cacheKey, { data: gap, timestamp: Date.now() });
    return NextResponse.json(gap);
  } catch (error) {
    console.error("[content-gap] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
