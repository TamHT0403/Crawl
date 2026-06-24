import { startBackgroundSync } from "@/lib/sync";
import type { Platform, SyncFilters } from "@/lib/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const syncFilters: SyncFilters | undefined =
    body.platforms || body.startDate || body.endDate || body.competitorIds || body.facebookMaxPosts
      ? {
          platforms: body.platforms ?? [],
          startDate: body.startDate ?? undefined,
          endDate: body.endDate ?? undefined,
          competitorIds: body.competitorIds ?? [],
          facebookMaxPosts: body.facebookMaxPosts ?? undefined,
        }
      : undefined;

  const jobId = crypto.randomUUID();
  // Start background sync (async, returns immediately)
  startBackgroundSync(jobId, body.platform as Platform | undefined, syncFilters, body.teamId as string | undefined);

  return NextResponse.json({ jobId });
}
