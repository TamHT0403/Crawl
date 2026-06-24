/**
 * Public API Middleware & Handler
 *
 * Xác thực API key, rate limiting, và public endpoints cho Zapier/webhook integration.
 */

import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/team";

// ─── API Key Middleware ─────────────────────────────────────────────────────

export type AuthenticatedRequest = {
  teamId: string;
  scopes: string;
};

/**
 * Xác thực request từ public API key.
 * Key được gửi qua header `Authorization: Bearer sk-...`
 */
export async function authenticateRequest(
  request: Request,
  requiredScope: "read" | "write" | "admin" = "read"
): Promise<{ authenticated: false; response: NextResponse } | { authenticated: true; context: AuthenticatedRequest }> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Missing or invalid Authorization header. Use: Bearer sk-..." },
        { status: 401 }
      ),
    };
  }

  const apiKey = authHeader.slice(7);
  const result = await validateApiKey(apiKey);

  if (!result.valid) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Invalid or expired API key." },
        { status: 401 }
      ),
    };
  }

  // Check scope
  const scopeRank: Record<string, number> = { read: 0, write: 1, admin: 2 };
  if ((scopeRank[result.scopes ?? "read"] ?? 0) < (scopeRank[requiredScope] ?? 0)) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: `Insufficient permissions. Required: ${requiredScope}, have: ${result.scopes}` },
        { status: 403 }
      ),
    };
  }

  return {
    authenticated: true,
    context: { teamId: result.teamId!, scopes: result.scopes! },
  };
}

// ─── Rate Limiter (in-memory, per key) ─────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  teamId: string,
  maxRequests = 100,
  windowMs = 60_000 // 1 phút
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(teamId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(teamId, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

// ─── Public API Response Helpers ──────────────────────────────────────────

export function apiSuccess(data: unknown, meta?: Record<string, unknown>) {
  return NextResponse.json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// ─── Sync alert integration ────────────────────────────────────────────────

/**
 * Gọi sau mỗi sync run để gửi thông báo
 */
export async function notifySyncComplete(
  teamId: string | null,
  result: { createdPosts: number; updatedPosts: number; competitors: number; elapsed: string }
): Promise<void> {
  const { sendAlert } = await import("@/lib/alerts");

  const title = result.createdPosts > 0
    ? "✅ Đồng bộ hoàn tất"
    : "🔄 Đồng bộ — không có bài mới";

  const message = [
    `📊 **Kết quả đồng bộ:**`,
    `- Bài mới: ${result.createdPosts}`,
    `- Bài cập nhật: ${result.updatedPosts}`,
    `- Đối thủ: ${result.competitors}`,
    `- Thời gian: ${result.elapsed}`,
  ].join("\n");

  await sendAlert(teamId, result.createdPosts > 0 ? "sync.completed" : "sync.completed", title, message, result);
}

export async function notifyContentGenerated(
  teamId: string | null,
  count: number
): Promise<void> {
  const { sendAlert } = await import("@/lib/alerts");
  await sendAlert(
    teamId,
    "content.generated",
    `🤖 Đã tạo ${count} nội dung mới`,
    `AI vừa tạo ${count} kịch bản YouTube/TikTok/Facebook từ dữ liệu crawl. Vào Content Library để duyệt.`,
    { count }
  );
}
