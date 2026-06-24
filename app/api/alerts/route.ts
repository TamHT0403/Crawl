import { NextResponse } from "next/server";
import { createAlert, listAlerts, deleteAlert } from "@/lib/alerts";
import type { AlertChannel, AlertEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/alerts?teamId=xxx
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId là bắt buộc" }, { status: 400 });
  const alerts = await listAlerts(teamId);
  return NextResponse.json({ alerts });
}

/**
 * POST /api/alerts — Create or delete alert
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  if (action === "create") {
    const teamId = body.teamId as string;
    const channel = body.channel as AlertChannel;
    const config = body.config as Record<string, string>;
    const events = body.events as AlertEvent[];
    if (!teamId || !channel || !config || !events?.length) {
      return NextResponse.json({ error: "teamId, channel, config, events là bắt buộc." }, { status: 400 });
    }
    const alert = await createAlert(teamId, channel, config, events);
    return NextResponse.json(alert);
  }

  if (action === "delete") {
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: "id là bắt buộc." }, { status: 400 });
    await deleteAlert(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
