import { NextResponse } from "next/server";
import { createWebhook, listWebhooks, deleteWebhook } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks?teamId=xxx
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId là bắt buộc" }, { status: 400 });
  const webhooks = await listWebhooks(teamId);
  return NextResponse.json({ webhooks });
}

/**
 * POST /api/webhooks — Create or delete webhook
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  if (action === "create") {
    const teamId = body.teamId as string;
    const url = body.url as string;
    const events = body.events as string[];
    if (!teamId || !url || !events?.length) {
      return NextResponse.json({ error: "teamId, url, events là bắt buộc." }, { status: 400 });
    }
    const webhook = await createWebhook(teamId, url, events);
    return NextResponse.json(webhook);
  }

  if (action === "delete") {
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: "id là bắt buộc." }, { status: 400 });
    await deleteWebhook(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
