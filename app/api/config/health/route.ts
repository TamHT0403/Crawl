import { NextResponse } from "next/server";
import { CONFIG_REGISTRY, getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConfigHealthItem = {
  key: string;
  label: string;
  category: string;
  encrypted: boolean;
  isSecret: boolean;
  hasValue: boolean;
  source: "db" | "env" | "unset";
  updatedAt: string | null;
  daysSinceUpdate: number | null;
  status: "healthy" | "warning" | "missing" | "expired";
  statusText: string;
};

type HealthSummary = {
  total: number;
  configured: number;
  missing: number;
  stale: number;
  healthScore: number; // 0-100
};

export async function GET() {
  // Lấy threshold từ config (có thể người dùng tuỳ chỉnh)
  const configWarningDays = parseInt((await getConfig("health_warning_days")) ?? "30", 10);
  const configExpireDays = parseInt((await getConfig("health_expire_days")) ?? "90", 10);

  // Lấy tất cả setting rows với updatedAt
  const dbRows = await prisma.setting.findMany({
    where: { key: { startsWith: "config_" } },
    select: { key: true, updatedAt: true },
  });

  const dbUpdatedMap = new Map<string, string>();
  for (const row of dbRows) {
    const configKey = row.key.replace("config_", "");
    dbUpdatedMap.set(configKey, row.updatedAt.toISOString());
  }

  const now = Date.now();
  let configured = 0;
  let missing = 0;
  let stale = 0;

  const items: ConfigHealthItem[] = CONFIG_REGISTRY.map((meta) => {
    const updatedAt = dbUpdatedMap.get(meta.key) ?? null;
    const daysSinceUpdate = updatedAt
      ? Math.floor((now - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Kiểm tra source
    const dbRow = dbRows.find((r) => r.key === `config_${meta.key}`);
    const envVal = meta.envFallback ? process.env[meta.envFallback]?.trim() : undefined;
    const hasValue = Boolean(dbRow || envVal);
    const source: "db" | "env" | "unset" = dbRow ? "db" : envVal ? "env" : "unset";

    // Xác định status dùng threshold từ config
    let status: ConfigHealthItem["status"];
    let statusText: string;

    if (!hasValue) {
      status = "missing";
      statusText = "Chưa cấu hình";
      missing++;
    } else if (meta.isSecret && daysSinceUpdate !== null && daysSinceUpdate > configExpireDays) {
      status = "expired";
      statusText = `Không cập nhật ${daysSinceUpdate} ngày — có thể đã hết hạn (ngưỡng: ${configExpireDays} ngày)`;
      stale++;
    } else if (meta.isSecret && daysSinceUpdate !== null && daysSinceUpdate > configWarningDays) {
      status = "warning";
      statusText = `${daysSinceUpdate} ngày chưa cập nhật (ngưỡng: ${configWarningDays} ngày)`;
      stale++;
    } else if (source === "db") {
      status = "healthy";
      statusText = daysSinceUpdate !== null ? `Đã cập nhật ${daysSinceUpdate} ngày trước` : "Sẵn sàng";
      configured++;
    } else {
      status = "healthy";
      statusText = "Từ biến môi trường";
      configured++;
    }

    return {
      key: meta.key,
      label: meta.label,
      category: meta.category,
      encrypted: meta.encrypted,
      isSecret: meta.isSecret,
      hasValue,
      source,
      updatedAt,
      daysSinceUpdate,
      status,
      statusText,
    };
  });

  const total = items.length;
  const healthScore = total > 0
    ? Math.round(((configured - stale * 0.5) / total) * 100)
    : 0;

  const summary: HealthSummary = {
    total,
    configured,
    missing,
    stale,
    healthScore: Math.max(0, healthScore),
  };

  return NextResponse.json({ summary, items });
}
