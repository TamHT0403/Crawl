import { NextResponse } from "next/server";
import { CONFIG_REGISTRY, getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/config/health/alert
 * Kiểm tra sức khoẻ config và gửi alert nếu phát hiện vấn đề.
 * Có thể gọi thủ công từ UI hoặc qua cron job (Vercel Cron).
 *
 * Body (optional):
 * { "teamId": "..." }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const teamId: string | null = body.teamId ?? null;

    // Đọc threshold từ config
    const warningDays = parseInt((await getConfig("health_warning_days")) ?? "30", 10);
    const expireDays = parseInt((await getConfig("health_expire_days")) ?? "90", 10);

    // Lấy tất cả settings với updatedAt
    const dbRows = await prisma.setting.findMany({
      where: { key: { startsWith: "config_" } },
      select: { key: true, updatedAt: true },
    });

    const now = Date.now();
    const issues: Array<{ key: string; label: string; severity: string; days: number; text: string }> = [];

    for (const meta of CONFIG_REGISTRY) {
      const dbRow = dbRows.find((r) => r.key === `config_${meta.key}`);
      const envVal = meta.envFallback ? process.env[meta.envFallback]?.trim() : undefined;
      const hasValue = Boolean(dbRow || envVal);

      if (!hasValue) {
        issues.push({
          key: meta.key,
          label: meta.label,
          severity: "missing",
          days: 0,
          text: `⚠️ **${meta.label}** chưa được cấu hình`,
        });
        continue;
      }

      if (!meta.isSecret || !dbRow) continue;

      const daysSinceUpdate = Math.floor(
        (now - new Date(dbRow.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceUpdate > expireDays) {
        issues.push({
          key: meta.key,
          label: meta.label,
          severity: "expired",
          days: daysSinceUpdate,
          text: `❌ **${meta.label}** — ${daysSinceUpdate} ngày không cập nhật (ngưỡng: ${expireDays} ngày). Token có thể đã hết hạn!`,
        });
      } else if (daysSinceUpdate > warningDays) {
        issues.push({
          key: meta.key,
          label: meta.label,
          severity: "warning",
          days: daysSinceUpdate,
          text: `⚠️ **${meta.label}** — ${daysSinceUpdate} ngày chưa cập nhật (ngưỡng: ${warningDays} ngày).`,
        });
      }
    }

    // Gửi alert nếu có vấn đề
    if (issues.length > 0) {
      try {
        const { sendAlert } = await import("@/lib/alerts");

        // Gộp tất cả issues vào 1 message
        const title = issues.some(i => i.severity === "expired" || i.severity === "missing")
          ? "🔴 Cảnh báo: Cấu hình hệ thống có vấn đề"
          : "🟡 Kiểm tra: Một số token sắp hết hạn";

        const message = issues.map(i => i.text).join("\n\n");

        await sendAlert(teamId, "performance.alert", title, message, {
          issueCount: issues.length,
          expired: issues.filter(i => i.severity === "expired").length,
          warning: issues.filter(i => i.severity === "warning").length,
          missing: issues.filter(i => i.severity === "missing").length,
        });
      } catch {
        // sendAlert không throw — fail silently
      }
    }

    return NextResponse.json({
      checked: CONFIG_REGISTRY.length,
      issuesFound: issues.length,
      issues,
      alerted: issues.length > 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Health check failed" },
      { status: 500 }
    );
  }
}
