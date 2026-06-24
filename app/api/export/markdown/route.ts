import { filtersFromUrl } from "@/lib/apiFilters";
import { generateReport, reportToMarkdown } from "@/lib/reports";

export async function GET(request: Request) {
  const filters = filtersFromUrl(request.url);
  const report = await generateReport(filters);
  return new Response(reportToMarkdown(report), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=kolia-competitor-report.md"
    }
  });
}
