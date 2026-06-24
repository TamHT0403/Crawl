import { NextResponse } from "next/server";
import { filtersFromUrl } from "@/lib/apiFilters";
import { getFilteredPosts } from "@/lib/analytics";

export async function GET(request: Request) {
  const filters = filtersFromUrl(request.url);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  const posts = await getFilteredPosts(filters, limit);
  return NextResponse.json({ posts });
}
