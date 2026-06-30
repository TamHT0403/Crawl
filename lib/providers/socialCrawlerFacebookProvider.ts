/**
 * Social Crawler Facebook Provider
 *
 * Sử dụng third-party service social-crawler để crawl Facebook posts.
 * Endpoint: https://social-crawler.public.rke.crawl.tmtco.org
 *
 * API: POST /crawl/facebook
 * Body: {
 *   targets: string[],
 *   cookies?: any,
 *   facebookMaxPosts?: number,
 *   start_date?: string,
 *   end_date?: string,
 *   stop_urls?: string[],
 *   ...scrollConfig
 * }
 * Response: SSE stream với các event: log, progress, done, error
 *
 * Service này xử lý hoàn toàn việc crawl qua GraphQL interception —
 * không cần browser local, không lo bị block IP.
 */

import { DEFAULT_SOCIAL_CRAWLER_CONFIG, type SocialCrawlerProviderConfig } from "@/lib/types";
import type { RawPostInput } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────

interface FacebookPost {
  platform: string;
  postUrl: string;
  caption: string;
  imageUrl: string | null;
  images?: string[];
  videos?: string[];
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  authorName?: string;
  authorId?: string;
}

interface FacebookDoneEvent {
  type: "done";
  target?: string;
  count: number;
  videos: FacebookPost[];
}

function normalizeApiUrl(apiUrl: string): string | null {
  const value = apiUrl.trim();
  if (!value || value.includes("•••")) {
    return DEFAULT_SOCIAL_CRAWLER_CONFIG.apiUrl;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

// ─── Provider ──────────────────────────────────────────────────────────────

export class SocialCrawlerFacebookProvider {
  /**
   * Fetch posts của một Facebook Group/Page qua social-crawler service.
   * API trả về SSE stream → parse events → lấy posts từ event "done".
   *
   * @param targetUrl  URL Facebook Group/Page cần crawl
   * @param config     Social crawler provider config (apiUrl, maxItems, scroll config, ...)
   * @param options    Override options (startDate, endDate, onLog, cookies, stopUrls)
   */
  async fetchPosts(
    targetUrl: string,
    config: SocialCrawlerProviderConfig,
    options: {
      startDate?: string;
      endDate?: string;
      maxItems?: number;
      onLog?: (message: string, data?: Record<string, unknown>) => void;
      cookies?: Record<string, unknown>[] | null;
      stopUrls?: string[];
    } = {}
  ): Promise<RawPostInput[]> {
    const log = options.onLog ?? ((msg: string) => console.log(`[social-crawler-facebook] ${msg}`));
    const maxItems = options.maxItems ?? config.facebookMaxPosts ?? config.maxItems ?? 50;

    const apiUrl = normalizeApiUrl(config.apiUrl);
    if (!apiUrl) {
      log(`❌ Social Crawler Facebook: API URL không hợp lệ (${config.apiUrl})`);
      return [];
    }
    const endpoint = `${apiUrl}/crawl/facebook`;

    log(`🌐 Social Crawler Facebook: url=${targetUrl}, maxItems=${maxItems}`);

    // Build request body theo đúng format của social-crawler service
    // Gồm tất cả các params mà POST /crawl/facebook hỗ trợ
    const body: Record<string, unknown> = {
      targets: [targetUrl],
      facebookMaxPosts: maxItems,
    };

    if (options.cookies) body.cookies = options.cookies;
    if (options.startDate) body.start_date = new Date(options.startDate).toISOString();
    if (options.endDate) body.end_date = new Date(options.endDate).toISOString();
    if (options.stopUrls && options.stopUrls.length > 0) body.stop_urls = options.stopUrls;

    // ── Scroll / Anti-ban config ────────────────────────────────────
    // Chỉ gửi các field có giá trị (không undefined)
    const scrollFields: [string, keyof SocialCrawlerProviderConfig][] = [
      ["scroll_delay_min", "scrollDelayMin"],
      ["scroll_delay_max", "scrollDelayMax"],
      ["scroll_steps_min", "scrollStepsMin"],
      ["scroll_steps_max", "scrollStepsMax"],
      ["scroll_inter_step_delay_min", "interStepDelayMin"],
      ["scroll_inter_step_delay_max", "interStepDelayMax"],
      ["max_scrolls", "maxScrolls"],
      ["stale_limit", "staleLimit"],
      ["human_scroll_chance", "humanScrollChance"],
      ["human_scroll_up_chance", "humanScrollUpChance"],
    ];
    for (const [apiKey, configKey] of scrollFields) {
      const val = config[configKey];
      if (val !== undefined && val !== null) {
        body[apiKey] = val;
      }
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), (config.timeoutSecs ?? 120) * 1000);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        log(`❌ Social Crawler Facebook API error (${res.status}): ${errText}`);
        return [];
      }

      const reader = res.body?.getReader();
      if (!reader) {
        log(`❌ Không thể đọc stream từ social-crawler service`);
        return [];
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalPosts: FacebookPost[] = [];

      // ─── Parse SSE stream ──────────────────────────────────────
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;

          const matchEvent = block.match(/^event:\s*(.+)$/m);
          const matchData = block.match(/^data:\s*(.+)$/m);

          if (!matchData) continue;

          try {
            const eventType = matchEvent ? matchEvent[1].trim() : "log";
            const data = JSON.parse(matchData[1].trim());

            if (eventType === "log" || eventType === "progress") {
              if (data.message) {
                log(data.message, eventType === "progress" ? {
                  type: "progress",
                  page: data.page,
                  collected: data.collected,
                  max_pages: data.max_pages,
                } : undefined);
              }
            } else if (eventType === "done") {
              finalPosts = (data as FacebookDoneEvent).videos || [];
            } else if (eventType === "error") {
              const errMsg: string = data.message || "Lỗi crawler từ service";
              log(`❌ ${errMsg}`);
              return [];
            }
          } catch (e) {
            console.error("[social-crawler-facebook] Error parsing SSE chunk:", e);
          }
        }
      }

      if (!finalPosts || finalPosts.length === 0) {
        log(`⚠️ Social Crawler Facebook: Không có post nào được trả về`);
        return [];
      }

      log(`📦 Social Crawler Facebook: nhận được ${finalPosts.length} posts`);

      // ─── Map → RawPostInput ──────────────────────────────────
      const posts: RawPostInput[] = finalPosts.map((post) => ({
        platform: "facebook" as const,
        postUrl: post.postUrl || targetUrl,
        title: post.caption
          ? post.caption.slice(0, 200)
          : `Facebook post by ${post.authorName || "unknown"}`,
        caption: post.caption || "",
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : new Date(),
        thumbnailUrl: post.imageUrl || undefined,
        views: post.views ?? 0,
        likes: post.likes ?? 0,
        comments: post.comments ?? 0,
        shares: post.shares ?? 0,
        format:
          (post.images?.length ?? 0) > 1
            ? "carousel"
            : post.imageUrl
              ? "image_post"
              : "text_post",
      }));

      log(`✅ Social Crawler Facebook: Trả về toàn bộ ${posts.length} posts đã lọc từ BE`);

      return posts;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if ((error as Error).name === "AbortError") {
        log(`⏱️ Social Crawler Facebook timeout sau ${config.timeoutSecs ?? 120}s`);
      } else {
        log(`❌ Social Crawler Facebook error: ${errMsg}`);
      }
      return [];
    }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function filterByDateRange(
  posts: RawPostInput[],
  startDate?: string,
  endDate?: string
): RawPostInput[] {
  if (!startDate && !endDate) return posts;

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (end) end.setHours(23, 59, 59, 999);

  return posts.filter((p) => {
    if (start && p.publishedAt < start) return false;
    if (end && p.publishedAt > end) return false;
    return true;
  });
}

// Singleton
export const socialCrawlerFacebookProvider = new SocialCrawlerFacebookProvider();
