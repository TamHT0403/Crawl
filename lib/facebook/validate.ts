/**
 * Validate Facebook session cookies bằng HTTP request (không cần Playwright browser).
 * Chấp nhận cả Playwright storageState format và flat cookies array (EditThisCookie).
 */

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

/**
 * Gọi HTTP request đến Facebook Home để kiểm tra cookies có hiệu lực không.
 * Không cần Playwright browser — nhẹ, nhanh, chạy được trên mọi môi trường.
 */
async function checkSessionViaHttp(
  cookies: { name: string; value: string; domain: string }[],
): Promise<{ ok: boolean; userId?: string; userName?: string }> {
  // Build cookie string từ Facebook cookies (chỉ lấy .facebook.com domain)
  const fbCookies = cookies.filter(c =>
    c.domain.includes('facebook.com') || c.domain.includes('.facebook.com')
  );
  const cookieStr = fbCookies.map(c => `${c.name}=${c.value}`).join('; ');

  const res = await fetch('https://www.facebook.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Cookie': cookieStr,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    redirect: 'manual', // Không tự follow redirect — kiểm tra response location
  });

  const status = res.status;
  const location = res.headers.get('location') || '';
  const body = await res.text();
  const bodyLower = body.toLowerCase();

  // Nếu redirect đến login → cookies hết hạn
  if (status >= 300 && status < 400 && location.includes('login')) {
    return { ok: false };
  }

  // Nếu response có login form → cookies hết hạn
  if (bodyLower.includes('input name="email"') || bodyLower.includes('input id="email"') || bodyLower.includes('login_form')) {
    return { ok: false };
  }

  // Thành công: thử lấy user_id từ response
  const userIdMatch = body.match(/"userID"\s*:\s*"(\d+)"/) || body.match(/"USER_ID"\s*:\s*"(\d+)"/);
  const userNameMatch = body.match(/"name"\s*:\s*"([^"]+)"/);

  return {
    ok: true,
    userId: userIdMatch?.[1],
    userName: userNameMatch?.[1],
  };
}

export async function validateFacebookSession(
  sessionJson: string,
): Promise<SessionValidation> {
  try {
    const parsed = JSON.parse(sessionJson);

    // Normalize to Playwright storageState format
    let storageState: NormalizedStorageState;
    try {
      storageState = normalizeStorageState(parsed);
    } catch {
      return {
        ok: false,
        message: "❌ Không nhận dạng được định dạng cookies. Vui lòng export theo hướng dẫn.",
      };
    }

    if (!storageState.cookies || storageState.cookies.length === 0) {
      return {
        ok: false,
        message: "❌ Không tìm thấy cookies nào trong dữ liệu",
      };
    }

    // Kiểm tra cookies quan trọng: c_user + xs là tối thiểu
    const cookieNames = storageState.cookies.map(c => c.name);
    const hasCUser = cookieNames.includes("c_user");
    const hasXs = cookieNames.includes("xs");

    if (!hasCUser || !hasXs) {
      return {
        ok: false,
        message: `❌ Thiếu cookies cần thiết (c_user=${hasCUser}, xs=${hasXs}). Vui lòng export lại cookies.`,
      };
    }

    // Kiểm tra thực tế bằng HTTP request đến Facebook
    const result = await checkSessionViaHttp(storageState.cookies);

    if (result.ok) {
      const userInfo = result.userId ? ` (uid: ${result.userId}${result.userName ? `, ${result.userName}` : ''})` : '';
      return {
        ok: true,
        message: `✅ Session Facebook hợp lệ — ${storageState.cookies.length} cookies${userInfo}`,
      };
    }

    return {
      ok: false,
      message: "❌ Cookies đã hết hạn — vui lòng export lại cookies mới từ browser",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `❌ Lỗi validate: ${msg}` };
  }
}
