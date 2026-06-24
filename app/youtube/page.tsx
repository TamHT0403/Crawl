import { PlatformTrackerView } from "@/components/PlatformTrackerView";
import { parseAnalyticsFilters } from "@/lib/analytics";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function YouTubePage({ searchParams }: PageProps) {
  const filters = parseAnalyticsFilters((await searchParams) ?? {});
  return (
    <PlatformTrackerView
      platform="youtube"
      filters={filters}
      title="YouTube Tracker"
      subtitle="Theo dõi video theo đối thủ, tách video ngắn và video phân tích dài, phân tích khoảng trống nội dung trong nước và học cấu trúc nội dung tạo lan tỏa từ kênh nước ngoài."
    />
  );
}
