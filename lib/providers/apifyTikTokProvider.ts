/**
 * Apify TikTok Provider
 *
 * Sử dụng Apify Actor để crawl TikTok videos/profiles.
 * Actor ID được configure từ UI — không cần sửa code khi đổi actor.
 *
 * Các actor phổ biến từ Apify Store:
 *  - "clockworks/tiktok-scraper"                    — versatile, hỗ trợ profiles + hashtags
 *  - "clockworks/free-tiktok-scraper"               — free tier của clockworks
 *  - "santamaria-automations/tiktok-profile-scraper" — chuyên về profiles
 *
 * Input schema chuẩn của clockworks/tiktok-scraper:
 *   { profiles: ["@username" | "url"], resultsPerPage, ... }
 */

import { ApifyClient, type ApifyRunOptions } from "@/lib/providers/apifyClient";
import type { ApifyProviderConfig } from "@/lib/types";
import type { RawPostInput } from "@/lib/types";

// ─── Apify TikTok response shapes (union of common actor outputs) ──────────

interface ApifyTikTokVideo {
  // clockworks/tiktok-scraper output fields
  id?: string;
  webVideoUrl?: string;
  videoUrl?: string;
  url?: string;
  text?: string;
  description?: string;
  desc?: string;
  createTime?: number;
  createTimeISO?: string;
  authorMeta?: { name?: string; nickName?: string; id?: string };
  musicMeta?: { musicName?: string };
  diggCount?: number;
  likeCount?: number;
  playCount?: number;
  viewCount?: number;
  shareCount?: number;
  commentCount?: number;
  covers?: { default?: string; dynamic?: string; origin?: string };
  coverUrl?: string;
  thumbnailUrl?: string;
  hashtags?: Array<{ name?: string }>;
  // Một số actor khác dùng camelCase khác
  stats?: {
    diggCount?: number;
    playCount?: number;
    commentCount?: number;
    shareCount?: number;
  };
}

// ─── Provider ──────────────────────────────────────────────────────────────

export class ApifyTikTokProvider {
  /**
   * Fetch videos của một TikTok profile/channel qua Apify.
   *
   * @param channelUrl  URL hoặc username TikTok cần crawl
   * @param config      Apify provider config (token, actorId, maxItems, ...)
   * @param options     Override options (startDate, endDate, onLog)
   */
  async fetchVideos(
    channelUrl: string,
    config: ApifyProviderConfig,
    options: {
      startDate?: string;
      endDate?: string;
      maxItems?: number;
      onLog?: (message: string) => void;
    } = {}
  ): Promise<RawPostInput[]> {
    const log = options.onLog ?? ((msg: string) => console.log(`[apify-tiktok] ${msg}`));
    const maxItems = options.maxItems ?? config.maxItems ?? 50;

    log(`🌐 Apify TikTok: actor="${config.actorId}", url=${channelUrl}, maxItems=${maxItems}`);

    const client = new ApifyClient(config.apiToken);

    // Normalize: đảm bảo URL hoặc @username đều hợp lệ
    const profileInput = normalizeProfile(channelUrl);

    // Build input — tương thích với clockworks/tiktok-scraper và các fork phổ biến
    const input: Record<string, unknown> = {
      profiles: [profileInput],
      profilesInput: [profileInput],
      startUrls: [{ url: channelUrl }],
      resultsPerPage: maxItems,
      maxProfilesPerQuery: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadSubtitles: false,
    };

    // Date filter cho một số actor có hỗ trợ
    if (options.startDate) input.dateFrom = options.startDate;
    if (options.endDate) input.dateTo = options.endDate;

    const runOptions: ApifyRunOptions = {
      maxItems,
      timeoutSecs: config.timeoutSecs ?? 120,
      memoryMbytes: config.memoryMbytes ?? 1024,
    };

    const rawItems = await client.runActor<ApifyTikTokVideo>(config.actorId, input, runOptions);
    log(`📦 Apify TikTok: nhận được ${rawItems.length} items raw`);

    // ─── Map → RawPostInput ──────────────────────────────────
    const posts: RawPostInput[] = [];
    for (const item of rawItems) {
      try {
        const mapped = mapApifyTikTokItem(item);
        if (mapped) posts.push(mapped);
      } catch (err) {
        console.warn("[apify-tiktok] Skip item due to mapping error:", err);
      }
    }

    // Date filter (server-side) nếu actor không hỗ trợ filter
    const filtered = filterByDateRange(posts, options.startDate, options.endDate);
    log(`✅ Apify TikTok: ${filtered.length}/${posts.length} videos sau khi lọc ngày`);

    return filtered;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function normalizeProfile(input: string): string {
  // Trả về URL nếu đã là URL đầy đủ
  if (input.startsWith("http")) return input;
  // Thêm @ nếu chưa có (cho username)
  if (!input.startsWith("@")) return `@${input}`;
  return input;
}

function mapApifyTikTokItem(item: ApifyTikTokVideo): RawPostInput | null {
  const url = item.webVideoUrl || item.videoUrl || item.url;
  if (!url) return null;

  const description = item.text || item.description || item.desc || "";

  // Timestamp
  let publishedAt: Date;
  if (item.createTimeISO) {
    publishedAt = new Date(item.createTimeISO);
  } else if (typeof item.createTime === "number") {
    publishedAt = new Date(item.createTime * 1000);
  } else {
    return null; // Không có timestamp → bỏ qua
  }

  if (isNaN(publishedAt.getTime())) return null;

  // Stats — hỗ trợ cả flat fields và nested stats object
  const likes = item.diggCount ?? item.likeCount ?? item.stats?.diggCount ?? 0;
  const views = item.playCount ?? item.viewCount ?? item.stats?.playCount ?? 0;
  const comments = item.commentCount ?? item.stats?.commentCount ?? 0;
  const shares = item.shareCount ?? item.stats?.shareCount ?? 0;

  // Cover/thumbnail
  const thumbnailUrl =
    item.covers?.default ||
    item.covers?.origin ||
    item.coverUrl ||
    item.thumbnailUrl ||
    undefined;

  return {
    platform: "tiktok",
    postUrl: url,
    title: description.slice(0, 200) || "TikTok video",
    caption: description,
    publishedAt,
    thumbnailUrl,
    views,
    likes,
    comments,
    shares,
    format: "short_video",
  };
}

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
export const apifyTikTokProvider = new ApifyTikTokProvider();
