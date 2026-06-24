import { NextResponse } from "next/server";
import { filtersFromUrl } from "@/lib/apiFilters";
import { generateReport, reportToMarkdown } from "@/lib/reports";

export async function GET(request: Request) {
  const filters = filtersFromUrl(request.url);
  const report = await generateReport(filters);
  return NextResponse.json({
    ...report,
    markdown: reportToMarkdown(report)
  });
}
