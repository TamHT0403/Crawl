/**
 * Validate TikTok session by making a real headless check.
 * Accepts both Playwright storageState format AND flat cookies array (EditThisCookie).
 */

import { getSettingWithFallback } from "@/lib/settings";

const TT_BASE_URL_FALLBACK = "https://www.tiktok.com";

let _ttBaseUrl: string | null = null;

async function getTtBaseUrl(): Promise<string> {
  if (_ttBaseUrl) return _ttBaseUrl;
  _ttBaseUrl = await getSettingWithFallback("tiktokBaseUrl", TT_BASE_URL_FALLBACK);
  return _ttBaseUrl;
}

export type SessionValidation = {
  ok: boolean;
  message: string;
};

/**
 * Chuyển đổi cookies từ EditThisCookie format (flat array) sang Playwright storageState format.
 * Nếu input đã là storageState format, giữ nguyên.
 */
export type NormalizedStorageState = {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Lax' | 'Strict' | 'None';
  }[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

export function normalizeStorageState(input: unknown): NormalizedStorageState {
  // Case 1: Đã là Playwright storageState format (đủ cả cookies + origins)
  if (input && typeof input === 'object' && 'cookies' in input && 'origins' in input) {
    return input as NormalizedStorageState;
  }

  // Case 2: Có cookies nhưng thiếu origins → map lại cookies đúng kiểu
  if (input && typeof input === 'object' && 'cookies' in input && !('origins' in input)) {
    const raw = input as { cookies: Record<string, unknown>[] };
    const cookies = raw.cookies.map((c) => ({
      name: String(c.name ?? ''),
      value: String(c.value ?? ''),
      domain: String(c.domain ?? ''),
      path: String(c.path ?? '/'),
      expires: typeof c.expires === 'number' ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: normalizeSameSite(c.sameSite as string | null),
    }));
    return { cookies, origins: [] };
  }

  // Case 3: Flat array of cookies (EditThisCookie / Cookie-Editor)
  if (Array.isArray(input)) {
    const cookies = input.map((c: Record<string, unknown>) => ({
      name: String(c.name ?? ''),
      value: String(c.value ?? ''),
      domain: String(c.domain ?? ''),
      path: String(c.path ?? '/'),
      expires: typeof c.expirationDate === 'number' ? c.expirationDate : ((c.expires as number) ?? -1),
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: normalizeSameSite(c.sameSite as string | null),
    }));
    return { cookies, origins: [] };
  }

  throw new Error('Không nhận dạng được định dạng cookies');
}

function normalizeSameSite(sameSite: string | null): 'Lax' | 'Strict' | 'None' {
  if (!sameSite || sameSite === 'no_restriction') return 'None';
  if (sameSite === 'lax') return 'Lax';
  if (sameSite === 'strict') return 'Strict';
  return 'None';
}

export async function validateTikTokSession(sessionJson: string): Promise<SessionValidation> {
  let browser;
  try {
    const parsed = JSON.parse(sessionJson);

    // Normalize to Playwright storageState format
    let storageState: NormalizedStorageState;
    try {
      storageState = normalizeStorageState(parsed);
    } catch {
      return { ok: false, message: "❌ Không nhận dạng được định dạng cookies. Vui lòng export theo hướng dẫn." };
    }

    if (!storageState.cookies || storageState.cookies.length === 0) {
      return { ok: false, message: "❌ Không tìm thấy cookies nào trong dữ liệu" };
    }

    // Launch a quick headless check
    const { launch } = await import("cloakbrowser");
    browser = await launch({
      headless: true,
      args: ["--no-sandbox"]
    });

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const ttBaseUrl = await getTtBaseUrl();
    await page.goto(ttBaseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000
    });
    await page.waitForTimeout(3000);

    const isLoggedIn = await page.evaluate(() => {
      const hasAvatar = !!document.querySelector(
        '[data-e2e="user-avatar"], [class*="Avatar"], [class*="avatar"]'
      );
      const noLoginBtn = !document.querySelector('[data-e2e="top-login-button"]');
      const hasFeed = document.querySelectorAll(
        '[class*="DivItemContainer"], [data-e2e="recommend-list"] > div'
      ).length > 0;
      return hasAvatar || (noLoginBtn && hasFeed) || !window.location.href.includes("/login");
    });

    await context.close();

    if (isLoggedIn) {
      return { ok: true, message: `✅ Session hợp lệ (${storageState.cookies.length} cookies) — có thể crawl TikTok` };
    }
    return { ok: false, message: "❌ Session hết hạn hoặc không hợp lệ — vui lòng export lại từ browser" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `❌ Lỗi validate: ${msg}` };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}
