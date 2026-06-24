/**
 * Validate Facebook session cookies bằng Playwright headless check.
 * Chấp nhận cả Playwright storageState format và flat cookies array (EditThisCookie).
 */

import { chromium } from "playwright";
import { getSettingWithFallback } from "@/lib/settings";

const FB_BASE_URL_FALLBACK = "https://www.facebook.com";

let _fbBaseUrl: string | null = null;

async function getFbBaseUrl(): Promise<string> {
  if (_fbBaseUrl) return _fbBaseUrl;
  _fbBaseUrl = await getSettingWithFallback("facebookBaseUrl", FB_BASE_URL_FALLBACK);
  return _fbBaseUrl;
}

export type SessionValidation = {
  ok: boolean;
  message: string;
};

export type NormalizedStorageState = {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Lax" | "Strict" | "None";
  }[];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

export function normalizeStorageState(input: unknown): NormalizedStorageState {
  // Case 1: Đã là Playwright storageState format
  if (input && typeof input === "object" && "cookies" in input && "origins" in input) {
    return input as NormalizedStorageState;
  }

  // Case 2: Có cookies nhưng thiếu origins
  if (input && typeof input === "object" && "cookies" in input && !("origins" in input)) {
    const raw = input as { cookies: Record<string, unknown>[] };
    const cookies = raw.cookies.map((c) => ({
      name: String(c.name ?? ""),
      value: String(c.value ?? ""),
      domain: String(c.domain ?? ""),
      path: String(c.path ?? "/"),
      expires: typeof c.expires === "number" ? c.expires : -1,
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: normalizeSameSite(c.sameSite as string | null),
    }));
    return { cookies, origins: [] };
  }

  // Case 3: Flat array of cookies (EditThisCookie / Cookie-Editor)
  if (Array.isArray(input)) {
    const cookies = input.map((c: Record<string, unknown>) => ({
      name: String(c.name ?? ""),
      value: String(c.value ?? ""),
      domain: String(c.domain ?? ""),
      path: String(c.path ?? "/"),
      expires:
        typeof c.expirationDate === "number"
          ? c.expirationDate
          : ((c.expires as number) ?? -1),
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
      sameSite: normalizeSameSite(c.sameSite as string | null),
    }));
    return { cookies, origins: [] };
  }

  throw new Error("Không nhận dạng được định dạng cookies");
}

function normalizeSameSite(sameSite: string | null): "Lax" | "Strict" | "None" {
  if (!sameSite || sameSite === "no_restriction") return "None";
  if (sameSite === "lax") return "Lax";
  if (sameSite === "strict") return "Strict";
  return "None";
}

export async function validateFacebookSession(
  sessionJson: string,
): Promise<SessionValidation> {
  let browser;
  try {
    const parsed = JSON.parse(sessionJson);

    // Normalize to Playwright storageState format
    let storageState: NormalizedStorageState;
    try {
      storageState = normalizeStorageState(parsed);
    } catch {
      return {
        ok: false,
        message:
          "❌ Không nhận dạng được định dạng cookies. Vui lòng export theo hướng dẫn.",
      };
    }

    if (!storageState.cookies || storageState.cookies.length === 0) {
      return {
        ok: false,
        message: "❌ Không tìm thấy cookies nào trong dữ liệu",
      };
    }

    // Launch headless check
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
    });

    const context = await browser.newContext({ storageState });
    const page = await context.newPage();

    const fbBaseUrl = await getFbBaseUrl();
    await page.goto(fbBaseUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForTimeout(3000);

    // Check if logged in via c_user cookie (Node.js context)
    const cookies = await context.cookies(fbBaseUrl);
    const hasCUser = cookies.some((c) => c.name === "c_user" && Boolean(c.value));

    // Check page for login indicators (browser context)
    const pageLoggedIn = await page.evaluate(() => {
      const hasLoginForm = !!document.querySelector(
        'input[name="email"], input#email',
      );
      const url = window.location.href;
      const isOnLoginPage =
        url.includes("/login") ||
        url.includes("checkpoint") ||
        url.includes("logout");
      const hasHomeElements = !!document.querySelector(
        '[aria-label="Your profile"], [aria-label="Trang cá nhân của bạn"], [aria-label="Home"], [aria-label="Trang chủ"]',
      );
      return hasHomeElements && !isOnLoginPage && !hasLoginForm;
    });

    await context.close();

    // Kết hợp cả hai checks: c_user cookie (ưu tiên) + page elements
    const isLoggedIn = hasCUser || pageLoggedIn;

    if (isLoggedIn) {
      return {
        ok: true,
        message: `✅ Session Facebook hợp lệ (${storageState.cookies.length} cookies) — có thể crawl dữ liệu`,
      };
    }

    return {
      ok: false,
      message:
        "❌ Session hết hạn hoặc không hợp lệ — vui lòng export lại từ browser",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `❌ Lỗi validate: ${msg}` };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
