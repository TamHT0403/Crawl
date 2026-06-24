/**
 * In-memory sliding window rate limiter.
 *
 * Dùng cho Next.js Edge Middleware — mỗi instance có bộ nhớ riêng.
 * Với multi-instance deployment, cần thay bằng Redis/store dùng chung.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 300_000);
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Kiểm tra rate limit cho một key (IP, session, teamId, ...).
 *
 * @param key   định danh (VD: IP address, teamId)
 * @param limit max requests trong window
 * @param windowMs  kích thước window (ms), mặc định 60s
 */
export function checkRateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  // Hết window → tạo mới
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count += 1;

  // Trả về sớm nếu còn quota để tránh tính toán không cần thiết
  if (entry.count <= limit) {
    return { allowed: true, limit, remaining: limit - entry.count, resetAt: entry.resetAt };
  }

  return { allowed: false, limit, remaining: 0, resetAt: entry.resetAt };
}

/** Extract client IP từ request headers */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}
