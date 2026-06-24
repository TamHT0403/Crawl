/**
 * Utility lấy TikTok account mặc định từ database.
 * Dùng trong crawler để load session.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type TikTokAccountSession = {
  id: string;
  label: string;
  sessionData: string; // JSON đã giải mã
};

/**
 * Lấy account TikTok mặc định (isDefault=true).
 * Nếu không có default, lấy account valid gần nhất.
 * Trả về null nếu không có account nào.
 */
export async function getDefaultTikTokAccount(): Promise<TikTokAccountSession | null> {
  const account = await prisma.tikTokAccount.findFirst({
    where: { isDefault: true, isValid: true },
    orderBy: { updatedAt: "desc" }
  });

  if (!account) {
    // Fallback: lấy account valid bất kỳ
    const fallback = await prisma.tikTokAccount.findFirst({
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
