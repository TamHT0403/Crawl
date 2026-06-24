/**
 * Global API Rate Limiting Middleware
 *
 * Áp dụng sliding window rate limit cho tất cả API routes.
 * Bỏ qua các endpoint poll tần suất cao (crawler-status, webhooks).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Các API được phép poll tần suất cao — không áp dụng rate limit
const SKIP_PATHS = [
  '/api/tiktok/crawler-status',
  '/api/facebook/crawler-status',
  '/api/sync/status',
  '/api/webhooks',
  '/api/health',
];

// Rate limit config theo nhóm route
const ROUTE_LIMITS: Array<{ pattern: RegExp; limit: number; windowMs: number }> = [
  // Sync & crawl — tần suất thấp, tốn tài nguyên
  { pattern: /^\/api\/sync/, limit: 10, windowMs: 60_000 },
  { pattern: /^\/api\/crawl/, limit: 10, windowMs: 60_000 },
  // Settings — vừa phải
  { pattern: /^\/api\/settings/, limit: 30, windowMs: 60_000 },
  // AI/Generation — tốn token, hạn chế
  { pattern: /^\/api\/generate/, limit: 20, windowMs: 60_000 },
  { pattern: /^\/api\/openai/, limit: 20, windowMs: 60_000 },
  // Public API
  { pattern: /^\/api\/v1/, limit: 100, windowMs: 60_000 },
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Chỉ áp dụng cho API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Bỏ qua các path được phép poll
  if (SKIP_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Xác định limit dựa trên route
  let limit = 60;
  let windowMs = 60_000;
  for (const route of ROUTE_LIMITS) {
    if (route.pattern.test(pathname)) {
      limit = route.limit;
      windowMs = route.windowMs;
      break;
    }
  }

  // Rate limit check
  const clientIp = getClientIp(request);
  const result = checkRateLimit(`api:${clientIp}`, limit, windowMs);

  // Nếu bị từ chối → 429
  if (!result.allowed) {
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'Too many requests. Vui lòng đợi và thử lại sau.',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetAt),
          'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  // Cho phép + gắn headers
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(result.resetAt));

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
