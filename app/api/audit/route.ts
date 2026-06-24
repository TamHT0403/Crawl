import { NextResponse } from "next/server";
import { getAuditLogs } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit?teamId=xxx&action=yyy&limit=50
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));

  const logs = await getAuditLogs(teamId, action, limit);
  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
    })),
    total: logs.length,
  });
}
