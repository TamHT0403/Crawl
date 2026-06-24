import { NextResponse } from "next/server";
import { getAllConfigs, setConfig, deleteConfig, CONFIG_REGISTRY } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/config
 * Trả về tất cả configs (value ẩn **** cho secrets)
 */
function maskSecret(val: string): string {
  if (!val) return "••••••••••••";
  // Nếu là URL — che hostname, giữ lại scheme + path mờ
  try {
    const url = new URL(val);
    const host = url.hostname;
    const maskedHost =
      host.length > 10
        ? host.slice(0, 3) + "•••••••" + host.slice(-3)
        : "••••••••••••";
    return `${url.protocol}//${maskedHost}${url.pathname.length > 3 ? url.pathname.slice(0, 2) + "••" : ""}`;
  } catch {
    // Chuỗi thường — giữ 3 ký tự đầu + 3 cuối
    if (val.length <= 10) return "••••••••••••";
    return val.slice(0, 3) + "•••••••••" + val.slice(-3);
  }
}

export async function GET() {
  const configs = await getAllConfigs();
  const registry = CONFIG_REGISTRY;

  const result = registry.map((meta) => {
    const entry = configs[meta.key];
    const displayValue = entry?.value
      ? meta.isSecret
        ? maskSecret(entry.value)
        : entry.value
      : null;

    return {
      key: meta.key,
      label: meta.label,
      description: meta.description,
      category: meta.category,
      encrypted: meta.encrypted,
      isSecret: meta.isSecret,
      value: displayValue,
      hasValue: entry?.source !== "unset",
      source: entry?.source ?? "unset",
      placeholder: meta.placeholder && meta.isSecret ? maskSecret(meta.placeholder) : (meta.placeholder ?? null),
    };
  });

  return NextResponse.json({ configs: result });
}

/**
 * POST /api/config
 * Action: "save" | "delete"
 */
export async function POST(request: Request) {
  let body: { action?: string; key?: string; value?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action || "save";
  const key = body.key;

  if (!key) {
    return NextResponse.json({ error: "key là bắt buộc." }, { status: 400 });
  }

  const meta = CONFIG_REGISTRY.find((c) => c.key === key);
  if (!meta) {
    return NextResponse.json({ error: `Unknown config key: ${key}` }, { status: 400 });
  }

  try {
    if (action === "save") {
      if (body.value === undefined) {
        return NextResponse.json({ error: "value là bắt buộc." }, { status: 400 });
      }
      await setConfig(key, body.value);
      return NextResponse.json({ ok: true, key, message: `✅ Đã lưu ${meta.label}` });
    }

    if (action === "delete") {
      await deleteConfig(key);
      return NextResponse.json({ ok: true, key, message: `✅ Đã xoá ${meta.label}, sẽ dùng env fallback nếu có.` });
    }

    return NextResponse.json({ error: "Unknown action. Chấp nhận: save, delete" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
