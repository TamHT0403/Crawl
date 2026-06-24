import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/status?jobId={id}
 * Trả về trạng thái của một sync job đang chạy.
 * Dùng cho GlobalSyncStatus component poll realtime.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId parameter" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobStatus = (global as any).syncJobs?.[jobId];

  if (!jobStatus) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  return NextResponse.json(jobStatus);
}
