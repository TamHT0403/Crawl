import { PlatformTrackerView } from "@/components/PlatformTrackerView";
import { parseAnalyticsFilters } from "@/lib/analytics";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function FacebookPage({ searchParams }: PageProps) {
  const filters = parseAnalyticsFilters((await searchParams) ?? {});
  return (
    <PlatformTrackerView
      platform="facebook"
      filters={filters}
      title="Facebook Tracker"
      subtitle="Phân tích fanpage trong nước: số bài, tỷ lệ tương tác bình quân, nhóm CTA/ưu đãi, bài bán khóa học/room/webinar và khoảng trống nội dung cho fanpage Kolia."
    />
  );
}
