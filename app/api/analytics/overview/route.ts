import { NextResponse } from "next/server";
import { filtersFromUrl } from "@/lib/apiFilters";
import { getOverviewAnalytics } from "@/lib/analytics";

export async function GET(request: Request) {
  const filters = filtersFromUrl(request.url);
  const analytics = await getOverviewAnalytics(filters);
  return NextResponse.json(analytics);
}
