import { NextResponse } from "next/server";
import { filtersFromUrl } from "@/lib/apiFilters";
import { getPlatformAnalytics } from "@/lib/analytics";
import type { Platform } from "@/lib/types";

type RouteContext = {
  params: Promise<{ platform: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { platform } = await context.params;
  const filters = filtersFromUrl(request.url);
  if (!["youtube", "tiktok", "facebook"].includes(platform)) {
    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
  }
  const analytics = await getPlatformAnalytics(platform as Platform, filters);
  return NextResponse.json(analytics);
}
