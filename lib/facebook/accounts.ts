/**
 * Utility lấy Facebook account mặc định từ database.
 * Dùng trong crawler để load session cookies.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type FacebookAccountSession = {
  id: string;
  label: string;
  sessionData: string; // JSON đã giải mã (Playwright storageState)
};

/**
 * Lấy account Facebook mặc định (isDefault=true).
 * Nếu không có default, lấy account valid gần nhất.
 * Trả về null nếu không có account nào.
 */
export async function getDefaultFacebookAccount(): Promise<FacebookAccountSession | null> {
  const account = await prisma.facebookAccount.findFirst({
    where: { isDefault: true, isValid: true },
    orderBy: { updatedAt: "desc" }
  });

  if (!account) {
    // Fallback: lấy account valid bất kỳ
    const fallback = await prisma.facebookAccount.findFirst({
      where: { isValid: true },
      orderBy: { updatedAt: "desc" }
    });
    if (!fallback) return null;
    try {
      return { id: fallback.id, label: fallback.label, sessionData: decrypt(fallback.sessionData) };
    } catch {
      return null;
    }
  }

  try {
    return { id: account.id, label: account.label, sessionData: decrypt(account.sessionData) };
  } catch {
    return null;
  }
}
