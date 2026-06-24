import { parseAnalyticsFilters } from "@/lib/analytics";

export function filtersFromUrl(url: string) {
  const searchParams = new URL(url).searchParams;
  return parseAnalyticsFilters(Object.fromEntries(searchParams.entries()));
}
