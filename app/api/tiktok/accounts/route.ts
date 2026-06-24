import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { validateTikTokSession, normalizeStorageState } from "@/lib/tiktok/validate";
import type { SessionValidation } from "@/lib/tiktok/validate";

export async function GET() {
  const accounts = await prisma.tikTokAccount.findMany({
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      label: true,
      isDefault: true,
      isValid: true,
      lastValidated: true,
      createdAt: true,
      updatedAt: true
      // KHÔNG trả sessionData về client
    }
  });

  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { label, sessionData, isDefault } = body;

  if (!label?.trim()) {
    return NextResponse.json({ error: "Vui lòng nhập tên gợi nhớ cho account" }, { status: 400 });
  }
  if (!sessionData?.trim()) {
    return NextResponse.json({ error: "Vui lòng dán session/cookies JSON" }, { status: 400 });
  }

  // Parse & normalize: chấp nhận cả EditThisCookie array và Playwright storageState
  let normalizedJson: string;
  try {
    const parsed = JSON.parse(sessionData);
    const normalized = normalizeStorageState(parsed);
    normalizedJson = JSON.stringify(normalized);
  } catch {
    return NextResponse.json({ error: "Session data không phải JSON hợp lệ hoặc không đúng định dạng cookies" }, { status: 400 });
  }

  // Validate session with TikTok
  const validation = await validateTikTokSession(normalizedJson);

  // Mã hoá trước khi lưu (lưu dạng storageState đã chuẩn hoá)
  const encrypted = encrypt(normalizedJson);

  // Nếu set làm default, bỏ default các account khác
  if (isDefault) {
    await prisma.tikTokAccount.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
  }

  const account = await prisma.tikTokAccount.create({
    data: {
      label: label.trim(),
      sessionData: encrypted,
      isDefault: isDefault ?? false,
      isValid: validation.ok,
      lastValidated: validation.ok ? new Date() : undefined
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

  return NextResponse.json({ account, validation: validation.message }, { status: 201 });
}

// validateTikTokSession moved to lib/tiktok/validate.ts
