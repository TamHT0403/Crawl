/**
 * Multi-Tenant & Team Management
 *
 * Hỗ trợ nhiều team, phân quyền member, audit log.
 */

import { prisma } from "@/lib/prisma";
import type { TeamRole, TeamMemberData } from "@/lib/types";

// ─── Team CRUD ─────────────────────────────────────────────────────────────

export async function createTeam(name: string, slug: string): Promise<{ id: string; name: string; slug: string }> {
  const existing = await prisma.team.findUnique({ where: { slug } });
  if (existing) {
    throw new Error(`Team slug "${slug}" đã tồn tại.`);
  }

  return prisma.team.create({
    data: { name, slug },
    select: { id: true, name: true, slug: true },
  });
}

export async function getTeam(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function listTeams() {
  return prisma.team.findMany({
    include: {
      members: { where: { isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Member Management ─────────────────────────────────────────────────────

export async function addMember(
  teamId: string,
  email: string,
  name: string | undefined,
  role: TeamRole
): Promise<TeamMemberData> {
  const member = await prisma.teamMember.create({
    data: { teamId, email, name, role },
  });

  await createAuditLog(teamId, "member.invite", "team", teamId, { email, role });

  return { id: member.id, email: member.email, name: member.name ?? undefined, role: member.role as TeamRole, isActive: member.isActive };
}

export async function updateMemberRole(memberId: string, role: TeamRole): Promise<TeamMemberData> {
  const member = await prisma.teamMember.update({
    where: { id: memberId },
    data: { role },
  });
  return { id: member.id, email: member.email, name: member.name ?? undefined, role: member.role as TeamRole, isActive: member.isActive };
}

export async function removeMember(memberId: string, teamId: string): Promise<void> {
  const member = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!member) throw new Error("Member not found");

  await prisma.teamMember.update({
    where: { id: memberId },
    data: { isActive: false },
  });

  await createAuditLog(teamId, "member.remove", "team", teamId, { email: member.email });
}

export async function listMembers(teamId: string): Promise<TeamMemberData[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({
    id: m.id,
    email: m.email,
    name: m.name ?? undefined,
    role: m.role as TeamRole,
    isActive: m.isActive,
  }));
}

// ─── Audit Log ─────────────────────────────────────────────────────────────

export async function createAuditLog(
  teamId: string | null,
  action: string,
  entity: string | null,
  entityId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      teamId,
      action,
      entity,
      entityId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  }).catch((err) => console.warn("[audit] Failed to log:", err));
}

export async function getAuditLogs(
  teamId?: string,
  action?: string,
  limit = 50
): Promise<Array<{ id: string; action: string; entity: string | null; entityId: string | null; metadata: Record<string, unknown> | null; createdAt: Date }>> {
  const where: Record<string, unknown> = {};
  if (teamId) where.teamId = teamId;
  if (action) where.action = action;

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  }).then((logs) =>
    logs.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }))
  );
}

// ─── API Key Management ────────────────────────────────────────────────────

import crypto from "crypto";

export async function createApiKey(
  teamId: string,
  label: string,
  scopes = "read",
  expiresInDays?: number
): Promise<{ id: string; label: string; key: string; keyPreview: string; scopes: string }> {
  const rawKey = `sk-${crypto.randomBytes(24).toString("hex")}`;
  const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");

  const apiKey = await prisma.apiKey.create({
    data: {
      teamId,
      label,
      key: hashedKey,
      scopes,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    },
  });

  await createAuditLog(teamId, "apikey.create", "apikey", apiKey.id, { label, scopes });

  return {
    id: apiKey.id,
    label: apiKey.label,
    key: rawKey, // Only returned once!
    keyPreview: rawKey.slice(0, 12) + "...",
    scopes: apiKey.scopes,
  };
}

export async function validateApiKey(rawKey: string): Promise<{ valid: boolean; teamId?: string; scopes?: string }> {
  const hashedKey = crypto.createHash("sha256").update(rawKey).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({ where: { key: hashedKey } });

  if (!apiKey || !apiKey.isActive) return { valid: false };
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return { valid: false };

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return { valid: true, teamId: apiKey.teamId, scopes: apiKey.scopes };
}

export async function listApiKeys(teamId: string) {
  const keys = await prisma.apiKey.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
  });
  return keys.map((k) => ({
    id: k.id,
    label: k.label,
    keyPreview: k.key.slice(0, 8) + "...",
    scopes: k.scopes,
    isActive: k.isActive,
    lastUsedAt: k.lastUsedAt?.toISOString(),
    expiresAt: k.expiresAt?.toISOString(),
    createdAt: k.createdAt.toISOString(),
  }));
}

export async function deleteApiKey(id: string, teamId: string): Promise<void> {
  await prisma.apiKey.delete({ where: { id } });
  await createAuditLog(teamId, "apikey.delete", "apikey", id, {});
}
