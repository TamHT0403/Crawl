import { filtersFromUrl } from "@/lib/apiFilters";
import { generateReport } from "@/lib/reports";

export async function GET(request: Request) {
  const filters = filtersFromUrl(request.url);
  const report = await generateReport(filters);
  return new Response(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=kolia-competitor-report.json"
    }
  });
}
