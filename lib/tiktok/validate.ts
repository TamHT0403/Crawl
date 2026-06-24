/**
 * Validate TikTok session cookies bằng HTTP request (không cần CloakBrowser/Playwright).
 * Chấp nhận cả Playwright storageState format và flat cookies array (EditThisCookie).
 */

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
  if (input && typeof input === 'object' && 'cookies' in input && 'origins' in input) {
    return input as NormalizedStorageState;
  }

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

/**
 * Gọi HTTP request đến TikTok Home để kiểm tra cookies có hiệu lực không.
 * TikTok serve SSR nên response HTML có thể check được login state.
 */
async function checkSessionViaHttp(
  cookies: { name: string; value: string; domain: string }[],
): Promise<{ ok: boolean; userName?: string }> {
  const ttCookies = cookies.filter(c =>
    c.domain.includes('tiktok.com') || c.domain.includes('.tiktok.com')
  );
  const cookieStr = ttCookies.map(c => `${c.name}=${c.value}`).join('; ');

  const res = await fetch('https://www.tiktok.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Cookie': cookieStr,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    redirect: 'manual',
  });

  const status = res.status;
  const location = res.headers.get('location') || '';
  const body = await res.text();
  const bodyLower = body.toLowerCase();

  // Redirect đến login → session hết hạn
  if (status >= 300 && status < 400 && (location.includes('login') || location.includes('passport'))) {
    return { ok: false };
  }

  // Có login form → chưa đăng nhập
  if (bodyLower.includes('top-login-button') || bodyLower.includes('loginContainer') || bodyLower.includes('login-form')) {
    return { ok: false };
  }

  // Thành công: thử lấy username từ SSR data
  const nameMatch = body.match(/"uniqueId"\s*:\s*"([^"]+)"/) || body.match(/"displayName"\s*:\s*"([^"]+)"/);

  return {
    ok: true,
    userName: nameMatch?.[1],
  };
}

export async function validateTikTokSession(sessionJson: string): Promise<SessionValidation> {
  try {
    const parsed = JSON.parse(sessionJson);

    let storageState: NormalizedStorageState;
    try {
      storageState = normalizeStorageState(parsed);
    } catch {
      return { ok: false, message: "❌ Không nhận dạng được định dạng cookies. Vui lòng export theo hướng dẫn." };
    }

    if (!storageState.cookies || storageState.cookies.length === 0) {
      return { ok: false, message: "❌ Không tìm thấy cookies nào trong dữ liệu" };
    }

    // Kiểm tra cookies quan trọng
    const cookieNames = storageState.cookies.map(c => c.name);
    const hasSessionId = cookieNames.includes("sessionid");

    if (!hasSessionId) {
      return { ok: false, message: "❌ Thiếu cookie sessionid — vui lòng export lại cookies." };
    }

    // Kiểm tra thực tế bằng HTTP request đến TikTok
    const result = await checkSessionViaHttp(storageState.cookies);

    if (result.ok) {
      const userInfo = result.userName ? ` (@${result.userName})` : '';
      return { ok: true, message: `✅ Session TikTok hợp lệ — ${storageState.cookies.length} cookies${userInfo}` };
    }

    return { ok: false, message: "❌ Cookies đã hết hạn — vui lòng export lại cookies mới từ browser" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `❌ Lỗi validate: ${msg}` };
  }
}
