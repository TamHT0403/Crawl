import { NextResponse } from "next/server";
import { getPlatformProviderConfig, updatePlatformProviderConfig } from "@/lib/settings";
import type { CrawlProvider } from "@/lib/types";

// ─── Mask sensitive fields ─────────────────────────────────────────────────

function maskSecret(val: string): string {
  if (!val) return "";
  try {
    const url = new URL(val);
    const host = url.hostname;
    const maskedHost =
      host.length > 10
        ? host.slice(0, 3) + "•••••••" + host.slice(-3)
        : "••••••••••••";
    return `${url.protocol}//${maskedHost}${url.pathname.length > 3 ? url.pathname.slice(0, 2) + "••" : ""}`;
  } catch {
    if (val.length <= 10) return "••••••••••••";
    return val.slice(0, 3) + "•••••••••" + val.slice(-3);
  }
}

/** Loại bỏ các field đã bị che (chứa "•••") — giữ nguyên giá trị gốc từ DB */
function stripMaskedFields<T extends Record<string, unknown>>(incoming: T | undefined, current: T): T {
  if (!incoming) return current;
  const result = { ...current };
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    const val = incoming[key];
    if (typeof val === "string" && val.includes("•••")) {
      // Giữ nguyên giá trị cũ từ DB
      continue;
    }
    result[key] = val;
  }
  return result;
}

function maskProviderConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...config };
  if (masked.apify && typeof masked.apify === "object") {
    const apify = { ...(masked.apify as Record<string, unknown>) };
    if (typeof apify.apiToken === "string" && apify.apiToken) {
      apify.apiToken = maskSecret(apify.apiToken);
    }
    masked.apify = apify;
  }
  if (masked.socialCrawler && typeof masked.socialCrawler === "object") {
    const sc = { ...(masked.socialCrawler as Record<string, unknown>) };
    if (typeof sc.apiUrl === "string" && sc.apiUrl) {
      sc.apiUrl = maskSecret(sc.apiUrl);
    }
    if (typeof sc.apiKey === "string" && sc.apiKey) {
      sc.apiKey = maskSecret(sc.apiKey);
    }
    masked.socialCrawler = sc;
  }
  return masked;
}

/**
 * GET /api/settings/providers
 * Trả về provider config của tất cả platform (facebook, tiktok).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");

  const [facebook, tiktok] = await Promise.all([
    getPlatformProviderConfig("facebook"),
    getPlatformProviderConfig("tiktok"),
  ]);

  const maskedFacebook = maskProviderConfig(facebook as unknown as Record<string, unknown>);
  const maskedTiktok = maskProviderConfig(tiktok as unknown as Record<string, unknown>);

  if (platform) {
    if (platform === "facebook") {
      return NextResponse.json({ facebook: maskedFacebook });
    }
    if (platform === "tiktok") {
      return NextResponse.json({ tiktok: maskedTiktok });
    }
    return NextResponse.json({ error: "platform phải là 'facebook' hoặc 'tiktok'" }, { status: 400 });
  }

  return NextResponse.json({
    facebook: maskedFacebook,
    tiktok: maskedTiktok,
  });
}

/**
 * PUT /api/settings/providers
 * Cập nhật provider config cho một hoặc nhiều platform.
 *
 * Body:
 * {
 *   platform: "facebook" | "tiktok",
 *   activeProvider: "playwright" | "apify" | "social-crawler",
 *   playwright?: { browserEngine, headless, scrollDelayMin, scrollDelayMax },
 *   apify?: { apiToken, actorId, maxItems, timeoutSecs, memoryMbytes },
 *   socialCrawler?: { apiUrl, apiKey, maxItems, timeoutSecs }
 * }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json() as {
      platform: "facebook" | "tiktok";
      activeProvider?: CrawlProvider;
      playwright?: Record<string, unknown>;
      apify?: Record<string, unknown>;
      socialCrawler?: Record<string, unknown>;
    };

    if (!body.platform || !["facebook", "tiktok"].includes(body.platform)) {
      return NextResponse.json(
        { error: "platform phải là 'facebook' hoặc 'tiktok'" },
        { status: 400 }
      );
    }

    // Nếu UI gửi lên giá trị đã che ("•••") → giữ nguyên giá trị gốc từ DB
    const current = await getPlatformProviderConfig(body.platform);
    const cleanApify = stripMaskedFields(
      body.apify as Record<string, unknown> | undefined,
      current.apify as unknown as Record<string, unknown>
    ) as typeof current.apify | undefined;
    const cleanSocialCrawler = stripMaskedFields(
      body.socialCrawler as Record<string, unknown> | undefined,
      current.socialCrawler as unknown as Record<string, unknown>
    ) as typeof current.socialCrawler | undefined;

    const updated = await updatePlatformProviderConfig(body.platform, {
      activeProvider: body.activeProvider,
      playwright: body.playwright as Parameters<typeof updatePlatformProviderConfig>[1]["playwright"],
      apify: cleanApify,
      socialCrawler: cleanSocialCrawler,
    });

    return NextResponse.json({ platform: body.platform, config: maskProviderConfig(updated as unknown as Record<string, unknown>) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
