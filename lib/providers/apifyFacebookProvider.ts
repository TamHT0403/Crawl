/**
 * Apify Facebook Provider
 *
 * Sử dụng Apify Actor để crawl Facebook posts/pages.
 * Actor ID được configure từ UI — không cần sửa code khi đổi actor.
 *
 * Các actor phổ biến từ Apify Store:
 *  - "apify/facebook-posts-scraper"   — crawl posts của page/group
 *  - "apify/facebook-pages-scraper"   — crawl info + posts của pages
 *  - "apify/facebook-search-scraper"  — tìm kiếm theo keyword
 *
 * Input schema chuẩn của apify/facebook-posts-scraper:
 *   { startUrls: [{ url }], resultsLimit, ... }
 *
 * Input schema chuẩn của apify/facebook-pages-scraper:
 *   { startUrls: [{ url }], maxPosts, ... }
 */

import { ApifyClient, type ApifyRunOptions } from "@/lib/providers/apifyClient";
import type { ApifyProviderConfig } from "@/lib/types";
import type { RawPostInput } from "@/lib/types";

// ─── Apify Facebook response shapes (union of common actor outputs) ────────

interface ApifyFacebookPost {
  // --- facebook-groups-scraper (2chN8UQcH1CfxLRNE) ---
  facebookUrl?: string;      // post URL
  text?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  attachments?: Array<{ imageUrl?: string; videoUrl?: string; link?: string }>;
  user?: Record<string, unknown>;

  // --- facebook-posts-scraper (KoJrdxJCTtpon81KY) ---
  postUrl?: string;
  url?: string;
  message?: string;
  likes?: number;
  reactions?: number;
  reactionsCount?: number;
  comments?: number;
  shares?: number;
  media?: Array<{ url?: string; thumbnail?: string }>;
  images?: string[];

  // --- chung: timestamp fields ---
  time?: string;
  date?: string;
  timestamp?: string | number;
  postedAt?: string;
  postedAtDate?: string;
  createdAt?: string;
  createdTime?: string;
  publishedAt?: string;
  created_date?: string;
  posted_time?: string;

  // --- facebook-pages-scraper ---
  pageName?: string;
  pageUsername?: string;
}

// ─── Provider ──────────────────────────────────────────────────────────────

export class ApifyFacebookProvider {
  /**
   * Fetch posts của một Facebook page/group/profile qua Apify.
   *
   * @param channelUrl  URL của Facebook page/group cần crawl
   * @param config      Apify provider config (token, actorId, maxItems, ...)
   * @param options     Override options (startDate, endDate, onLog)
   */
  async fetchPosts(
    channelUrl: string,
    config: ApifyProviderConfig,
    options: {
      startDate?: string;
      endDate?: string;
      maxItems?: number;
      onLog?: (message: string) => void;
    } = {}
  ): Promise<RawPostInput[]> {
    const log = options.onLog ?? ((msg: string) => console.log(`[apify-facebook] ${msg}`));
    const maxItems = options.maxItems ?? config.maxItems ?? 50;

    // Tự động detect group/profile từ URL + chọn actor tương ứng
    const isGroup = channelUrl.includes('/groups/');
    const actorId = isGroup ? (config.groupActorId || config.actorId) : config.actorId;
    if (!actorId) {
      log(`⚠️ Chưa cấu hình Actor ID cho Facebook (${isGroup ? 'group' : 'profile'})`);
      return [];
    }

    const isGroupsScraper = actorId.includes('facebook-groups-scraper');
    log(`🌐 Apify Facebook: actor="${actorId}", url=${channelUrl}, type=${isGroup ? 'group' : 'profile'}, maxItems=${maxItems}`);

    const client = new ApifyClient(config.apiToken);

    // Build input theo actor
    const input: Record<string, unknown> = {};

    if (isGroupsScraper) {
      // apify/facebook-groups-scraper: yêu cầu cả startUrls (required) lẫn groupUrls
      input.startUrls = [{ url: channelUrl }];
      input.groupUrls = [channelUrl];
      input.resultsLimit = maxItems;
    } else {
      // Các actor khác (posts-scraper, pages-scraper...): dùng startUrls
      input.startUrls = [{ url: channelUrl }];
      input.resultsLimit = maxItems;
      input.maxPosts = maxItems;
      input.maxPostsPerPage = maxItems;
    }

    // Thêm date filter nếu có (một số actor hỗ trợ)
    if (options.startDate) input.startDate = options.startDate;
    if (options.endDate) input.endDate = options.endDate;

    const runOptions: ApifyRunOptions = {
      maxItems,
      timeoutSecs: config.timeoutSecs ?? 120,
      memoryMbytes: config.memoryMbytes ?? 1024,
    };

    const rawItems = await client.runActor<ApifyFacebookPost>(actorId, input, runOptions);
    log(`📦 Apify Facebook: nhận được ${rawItems.length} items raw`);

    // Kiểm tra lỗi từ Apify actor
    if (rawItems.length > 0) {
      const firstItem = rawItems[0] as Record<string, unknown>;
      if (firstItem.error || firstItem.errorDescription) {
        const errorCode = firstItem.error;
        const errorDesc = firstItem.errorDescription || '(no description)';
        // Log đầy đủ error object để debug
        console.error(`[apify-facebook] ❌ Actor error:`, JSON.stringify(firstItem, null, 2));
        log(`❌ Apify Facebook actor error: [${errorCode}] ${errorDesc}`);
        return [];
      }
    }

    // ─── Map → RawPostInput ──────────────────────────────────
    const posts: RawPostInput[] = [];
    for (const item of rawItems) {
      try {
        const mapped = mapApifyFacebookItem(item, channelUrl);
        if (mapped) posts.push(mapped);
        else {
          // Bỏ qua log verbose cho item lỗi — đã log ở trên
        }
      } catch (err) {
        console.warn("[apify-facebook] Skip item due to mapping error:", err);
      }
    }

    // Date filter (server-side) nếu actor không hỗ trợ filter
    const filtered = filterByDateRange(posts, options.startDate, options.endDate);
    log(`✅ Apify Facebook: ${filtered.length}/${posts.length} posts sau khi lọc ngày`);

    return filtered;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mapApifyFacebookItem(
  item: ApifyFacebookPost,
  fallbackUrl: string
): RawPostInput | null {
  // URL: ưu tiên url (permalink) > postUrl > facebookUrl (group URL)
  const url = item.url || item.postUrl || item.facebookUrl || fallbackUrl;
  const text = item.text || item.message || "";

  // Timestamp: facebook-groups-scraper dùng time (ISO string)
  const timestamp = (item as Record<string, unknown>).time
    || (item as Record<string, unknown>).date
    || (item as Record<string, unknown>).timestamp
    || (item as Record<string, unknown>).timestamp
    || (item as Record<string, unknown>).postedAt
    || (item as Record<string, unknown>).postedAtDate
    || (item as Record<string, unknown>).createdAt
    || (item as Record<string, unknown>).createdTime
    || (item as Record<string, unknown>).publishedAt
    || (item as Record<string, unknown>).created_date
    || (item as Record<string, unknown>).posted_time;

  if (!timestamp) return null;

  const publishedAt = parseTimestamp(timestamp as string | number);
  if (!publishedAt || isNaN(publishedAt.getTime())) return null;

  // Interactions: facebook-groups-scraper dùng likesCount/commentsCount/sharesCount
  const likes = item.likesCount ?? item.likes ?? item.reactions ?? item.reactionsCount ?? 0;
  const comments = item.commentsCount ?? item.comments ?? 0;
  const shares = item.sharesCount ?? item.shares ?? 0;

  // Images: facebook-groups-scraper dùng attachments[].thumbnail
  const images: string[] = [];
  if (item.attachments) {
    for (const a of item.attachments) {
      const att = a as Record<string, unknown>;
      if (att.thumbnail) images.push(att.thumbnail as string);
    }
  }
  if (images.length === 0) {
    images.push(...(item.images ?? item.media?.map((m) => m.url || m.thumbnail || "").filter(Boolean) ?? []));
  }

  const format =
    images.length > 1 ? "carousel"
    : images.length === 1 ? "image_post"
    : "text_post";

  return {
    platform: "facebook",
    postUrl: url,
    title: text.slice(0, 200) || `Facebook post`,
    caption: text,
    publishedAt,
    thumbnailUrl: images[0] || undefined,
    views: 0,
    likes,
    comments,
    shares,
    format,
  };
}

function parseTimestamp(value: string | number): Date {
  if (typeof value === "number") {
    // Unix timestamp (seconds)
    return new Date(value * 1000);
  }
  // ISO string hoặc human-readable
  return new Date(value);
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
export const apifyFacebookProvider = new ApifyFacebookProvider();
