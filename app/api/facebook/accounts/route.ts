import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { validateFacebookSession, normalizeStorageState } from "@/lib/facebook/validate";
import type { SessionValidation } from "@/lib/facebook/validate";

export async function GET() {
  const accounts = await prisma.facebookAccount.findMany({
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
    return NextResponse.json({
      error: "Session data không phải JSON hợp lệ hoặc không đúng định dạng cookies"
    }, { status: 400 });
  }

  // Validate session với Facebook
  const validation = await validateFacebookSession(normalizedJson);

  // Mã hoá trước khi lưu
  const encrypted = encrypt(normalizedJson);

  // Nếu set làm default, bỏ default các account khác
  if (isDefault) {
    await prisma.facebookAccount.updateMany({
      where: { isDefault: true },
      data: { isDefault: false }
    });
  }

  const account = await prisma.facebookAccount.create({
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
