import { DashboardOverview } from "@/components/DashboardOverview";
import { parseAnalyticsFilters } from "@/lib/analytics";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: PageProps) {
  const filters = parseAnalyticsFilters((await searchParams) ?? {});
  return <DashboardOverview filters={filters} />;
}
