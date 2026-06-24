import { NextResponse } from "next/server";
import { filtersFromUrl } from "@/lib/apiFilters";
import { createGoogleDocsReport, getGoogleStatus } from "@/lib/googleDocs";
import { generateReport } from "@/lib/reports";

export async function POST(request: Request) {
  const status = await getGoogleStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        error: "Thiếu cấu hình Google OAuth.",
        missingEnv: status.missingEnv,
        setup:
          "Hãy tạo OAuth Client dạng Web application, enable Google Docs API và Drive API, rồi cấu hình GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI."
      },
      { status: 400 }
    );
  }

  if (!status.connected) {
    return NextResponse.json(
      {
        error: "Google Drive chưa được kết nối.",
        authUrl: status.authUrl
      },
      { status: 401 }
    );
  }

  const filters = filtersFromUrl(request.url);
  const report = await generateReport(filters);
  const document = await createGoogleDocsReport(report);
  return NextResponse.json({ ok: true, document });
}
