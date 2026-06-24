import { PlatformTrackerView } from "@/components/PlatformTrackerView";
import { parseAnalyticsFilters } from "@/lib/analytics";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function TikTokPage({ searchParams }: PageProps) {
  const filters = parseAnalyticsFilters((await searchParams) ?? {});
  return (
    <PlatformTrackerView
      platform="tiktok"
      filters={filters}
      title="TikTok Tracker"
      subtitle="Tập trung đối thủ trong nước, hook ngắn, topic vàng/crypto, mini case study và gợi ý tuyến TikTok phù hợp với Kolia."
    />
  );
}
