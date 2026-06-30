/**
 * Social Crawler TikTok Provider
 *
 * Sử dụng third-party service social-crawler để crawl TikTok videos/profiles.
 * Endpoint: https://social-crawler.public.rke.crawl.tmtco.org
 *
 * API: POST /crawl/tiktok
 * Body: { target: string, period?: string, cookies?: any, start_date?: string, end_date?: string }
 * Response: SSE stream với các event: log, progress, done, error
 *
 * Service này xử lý hoàn toàn việc crawl, giải mã, chống chặn —
 * không cần browser local, không lo bị block IP.
 */

import { DEFAULT_SOCIAL_CRAWLER_CONFIG, type SocialCrawlerProviderConfig } from "@/lib/types";
import type { RawPostInput } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────

interface TikTokAuthor {
  unique_id: string;
  nickname: string;
  avatar: string;
}

interface TikTokVideoStats {
  collectCount?: number;
  commentCount?: number;
  diggCount?: number;
  playCount?: number;
  shareCount?: number;
}

interface TikTokVideo {
  id: string;
  url: string;
  desc: string;
  create_time: number;
  create_time_formatted?: string;
  author?: TikTokAuthor;
  music?: { title?: string; author?: string };
  stats?: TikTokVideoStats;
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

export class SocialCrawlerTikTokProvider {
  /**
   * Fetch videos của một TikTok profile qua social-crawler service.
   * API trả về SSE stream → parse events → lấy videos từ event "done".
   *
   * @param channelUrl  URL hoặc username TikTok cần crawl
   * @param config      Social crawler provider config (apiUrl, maxItems, ...)
   * @param options     Override options (startDate, endDate, onLog, cookies)
   */
  async fetchVideos(
    channelUrl: string,
    config: SocialCrawlerProviderConfig,
    options: {
      startDate?: string;
      endDate?: string;
      maxItems?: number;
      onLog?: (message: string, data?: Record<string, unknown>) => void;
      cookies?: Record<string, unknown>[] | null;
    } = {}
  ): Promise<RawPostInput[]> {
    const log = options.onLog ?? ((msg: string) => console.log(`[social-crawler-tiktok] ${msg}`));
    const maxItems = options.maxItems ?? config.maxItems ?? 50;

    const apiUrl = normalizeApiUrl(config.apiUrl);
    if (!apiUrl) {
      log(`❌ Social Crawler TikTok: API URL không hợp lệ (${config.apiUrl})`);
      return [];
    }
    const endpoint = `${apiUrl}/crawl/tiktok`;
    log(`🌐 Social Crawler TikTok: endpoint=${endpoint}`);

    log(`🌐 Social Crawler TikTok: url=${channelUrl}, maxItems=${maxItems}`);

    // Build period string từ date range
    let period = "30 days";
    if (options.startDate) {
      const start = new Date(options.startDate).getTime();
      const diffDays = Math.ceil((Date.now() - start) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) period = `${diffDays} days`;
    }

    // Build request body theo đúng format của social-crawler service
    const body: Record<string, unknown> = {
      target: channelUrl,
      targets: [channelUrl],
      period,
      max_items: maxItems,
      maxItems,
    };

    if (options.cookies) body.cookies = options.cookies;
    if (options.startDate) body.start_date = new Date(options.startDate).toISOString();
    if (options.endDate) body.end_date = new Date(options.endDate).toISOString();

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
        log(`❌ Social Crawler API error (${res.status}): ${errText}`);
        return [];
      }

      const reader = res.body?.getReader();
      if (!reader) {
        log(`❌ Không thể đọc stream từ social-crawler service`);
        return [];
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalVideos: TikTokVideo[] = [];

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
                  max_pages: data.max_pages,
                } : undefined);
              }
            } else if (eventType === "done") {
              finalVideos = data.videos || [];
            } else if (eventType === "error") {
              const errMsg: string = data.message || "Lỗi crawler từ service";
              log(`❌ ${errMsg}`);
              return [];
            }
          } catch (e) {
            console.error("[social-crawler-tiktok] Error parsing SSE chunk:", e);
          }
        }
      }

      if (!finalVideos || finalVideos.length === 0) {
        log(`⚠️ Social Crawler TikTok: Không có video nào được trả về`);
        return [];
      }

      log(`📦 Social Crawler TikTok: nhận được ${finalVideos.length} videos`);

      // ─── Map → RawPostInput ──────────────────────────────────
      const posts: RawPostInput[] = finalVideos.map((video) => {
        const authorId = video.author?.unique_id || "unknown";
        const postUrl = video.url || (video.id
          ? `https://www.tiktok.com/@${authorId}/video/${video.id}`
          : "");

        return {
          platform: "tiktok" as const,
          postUrl,
          title: video.desc ? video.desc.slice(0, 200) : `TikTok video by ${video.author?.nickname || "unknown"}`,
          caption: video.desc || "",
          publishedAt: new Date(video.create_time * 1000),
          thumbnailUrl: video.author?.avatar || undefined,
          views: video.stats?.playCount ?? 0,
          likes: video.stats?.diggCount ?? 0,
          comments: video.stats?.commentCount ?? 0,
          shares: video.stats?.shareCount ?? 0,
          format: "short_video",
        };
      });

      // Date filter (server-side) đề phòng service không filter đúng
      const filtered = filterByDateRange(posts, options.startDate, options.endDate);
      log(`✅ Social Crawler TikTok: ${filtered.length}/${posts.length} videos sau khi lọc ngày`);

      return filtered;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if ((error as Error).name === "AbortError") {
        log(`⏱️ Social Crawler TikTok timeout sau ${config.timeoutSecs ?? 120}s`);
      } else {
        log(`❌ Social Crawler TikTok error: ${errMsg}`);
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
export const socialCrawlerTikTokProvider = new SocialCrawlerTikTokProvider();
