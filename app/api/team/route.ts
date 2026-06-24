import { NextResponse } from "next/server";
import { createTeam, listTeams, getTeam, addMember, listMembers, updateMemberRole, removeMember, createApiKey, listApiKeys, deleteApiKey } from "@/lib/team";
import type { TeamRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/team — List teams
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action");

  if (action === "members" && id) {
    const members = await listMembers(id);
    return NextResponse.json({ members });
  }

  if (action === "apikeys" && id) {
    const keys = await listApiKeys(id);
    return NextResponse.json({ keys });
  }

  if (id) {
    const team = await getTeam(id);
    return team ? NextResponse.json(team) : NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const teams = await listTeams();
  return NextResponse.json({ teams });
}

/**
 * POST /api/team — Create team, add member, create API key
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // ─── Create Team ──────────────────────────────────────────────
  if (action === "create" || !action) {
    const name = (body.name || body.teamName) as string;
    const slug = (body.slug || body.teamSlug) as string;
    if (!name || !slug) {
      return NextResponse.json({ error: "name và slug là bắt buộc." }, { status: 400 });
    }
    try {
      const team = await createTeam(name, slug);
      return NextResponse.json(team);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
    }
  }

  // ─── Add Member ───────────────────────────────────────────────
  if (action === "add-member") {
    const teamId = body.teamId as string;
    const email = body.email as string;
    const name = body.name as string | undefined;
    const role = (body.role as TeamRole) ?? "editor";
    if (!teamId || !email) {
      return NextResponse.json({ error: "teamId và email là bắt buộc." }, { status: 400 });
    }
    const member = await addMember(teamId, email, name, role);
    return NextResponse.json(member);
  }

  // ─── Update Member Role ───────────────────────────────────────
  if (action === "update-role") {
    const memberId = body.memberId as string;
    const role = body.role as TeamRole;
    if (!memberId || !role) {
      return NextResponse.json({ error: "memberId và role là bắt buộc." }, { status: 400 });
    }
    const member = await updateMemberRole(memberId, role);
    return NextResponse.json(member);
  }

  // ─── Remove Member ────────────────────────────────────────────
  if (action === "remove-member") {
    const memberId = body.memberId as string;
    const teamId = body.teamId as string;
    if (!memberId || !teamId) {
      return NextResponse.json({ error: "memberId và teamId là bắt buộc." }, { status: 400 });
    }
    await removeMember(memberId, teamId);
    return NextResponse.json({ ok: true });
  }

  // ─── Create API Key ───────────────────────────────────────────
  if (action === "create-apikey") {
    const teamId = body.teamId as string;
    const label = body.label as string;
    const scopes = (body.scopes as string) ?? "read";
    const expiresInDays = body.expiresInDays as number | undefined;
    if (!teamId || !label) {
      return NextResponse.json({ error: "teamId và label là bắt buộc." }, { status: 400 });
    }
    const key = await createApiKey(teamId, label, scopes, expiresInDays);
    return NextResponse.json({ ...key, warning: "⚠️ Lưu key này ngay! Không thể xem lại sau." });
  }

  // ─── Delete API Key ───────────────────────────────────────────
  if (action === "delete-apikey") {
    const id = body.id as string;
    const teamId = body.teamId as string;
    if (!id || !teamId) {
      return NextResponse.json({ error: "id và teamId là bắt buộc." }, { status: 400 });
    }
    await deleteApiKey(id, teamId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
