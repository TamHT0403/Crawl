import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { validateTikTokSession, normalizeStorageState } from "@/lib/tiktok/validate";
import type { SessionValidation } from "@/lib/tiktok/validate";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { label, sessionData, isDefault } = body;

  const existing = await prisma.tikTokAccount.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Account không tồn tại" }, { status: 404 });
  }

  // Nếu có session mới → normalize + validate + mã hoá lại
  let encrypted = existing.sessionData;
  let validation: SessionValidation | null = null;

  if (sessionData?.trim()) {
    let normalizedJson: string;
    try {
      const parsed = JSON.parse(sessionData);
      const normalized = normalizeStorageState(parsed);
      normalizedJson = JSON.stringify(normalized);
    } catch {
      return NextResponse.json({ error: "Session data không phải JSON hợp lệ hoặc không đúng định dạng cookies" }, { status: 400 });
    }

    validation = await validateTikTokSession(normalizedJson);
    encrypted = encrypt(normalizedJson);
  }

  // Nếu set làm default → bỏ default các account khác
  if (isDefault) {
    await prisma.tikTokAccount.updateMany({
      where: { id: { not: id }, isDefault: true },
      data: { isDefault: false }
    });
  }

  const updated = await prisma.tikTokAccount.update({
    where: { id },
    data: {
      ...(label?.trim() ? { label: label.trim() } : {}),
      ...(sessionData?.trim() ? {
        sessionData: encrypted,
        isValid: validation?.ok ?? existing.isValid,
        lastValidated: validation ? new Date() : existing.lastValidated
      } : {}),
      isDefault: isDefault ?? existing.isDefault
    },
    select: {
      id: true,
      label: true,
      isDefault: true,
      isValid: true,
      lastValidated: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    account: updated,
    ...(validation ? { validation: validation.message } : {})
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await prisma.tikTokAccount.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Account không tồn tại" }, { status: 404 });
  }

  await prisma.tikTokAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
