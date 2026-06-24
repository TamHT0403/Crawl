import type { Competitor } from "@prisma/client";
import type { AdapterContext, CompetitorDataAdapter } from "@/lib/adapters/types";
import type { RawPostInput } from "@/lib/types";

// ─── Raw post shape from the new GraphQL crawler ───────────────────────────
interface CrawlerPost {
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

/**
 * FacebookAdapter — Multi-provider crawl dispatcher
 *
 * Chọn provider dựa vào facebookProvider.activeProvider trong settings:
 *  - "playwright"      → dùng Playwright/CloakBrowser local crawler
 *  - "apify"           → dùng Apify cloud Actor
 *  - "social-crawler"  → dùng third-party social-crawler API
 *
 * Thêm provider mới: chỉ cần thêm case mới vào switch bên dưới.
 */
export class FacebookAdapter implements CompetitorDataAdapter {
  async fetchLatestPosts(competitor: Competitor, context: AdapterContext) {
    const providerConfig = context.settings.facebookProvider;
    const provider = providerConfig?.activeProvider ?? "playwright";

    if (provider === "apify") {
      return this.fetchViaApify(competitor, context);
    }

    if (provider === "social-crawler") {
      return this.fetchViaSocialCrawler(competitor, context);
    }

    // Default: Playwright/CloakBrowser
    return this.fetchViaPlaywright(competitor, context);
  }

  // ─── Apify Provider ───────────────────────────────────────────────────────

  private async fetchViaApify(
    competitor: Competitor,
    context: AdapterContext
  ): Promise<RawPostInput[]> {
    const providerConfig = context.settings.facebookProvider;
    const apifyConfig = providerConfig?.apify;

    if (!apifyConfig?.apiToken || !apifyConfig?.actorId) {
      console.warn(
        `[facebook-adapter/apify] Apify token or actorId not configured for ${competitor.name} — skipping`
      );
      context.onLog?.(
        `⚠️ Apify chưa cấu hình (thiếu API Token hoặc Actor ID) cho ${competitor.name}`
      );
      return [];
    }

    try {
      const { apifyFacebookProvider } = await import("@/lib/providers/apifyFacebookProvider");

      const contextAny = context as Record<string, unknown>;
      const configuredMaxPosts =
        typeof contextAny.facebookMaxPosts === "number"
          ? contextAny.facebookMaxPosts
          : undefined;
      const hasDateRange = Boolean(context.startDate || context.endDate);
      const maxItems = configuredMaxPosts ?? apifyConfig.maxItems ?? (hasDateRange ? 200 : 50);

      context.onLog?.(
        `☁️ ${competitor.name}: Crawl via Apify actor "${apifyConfig.actorId}" (maxItems=${maxItems})`
      );

      const posts = await apifyFacebookProvider.fetchPosts(
        competitor.channelUrl,
        apifyConfig,
        {
          startDate: context.startDate,
          endDate: context.endDate,
          maxItems,
          onLog: context.onLog,
        }
      );

      if (posts.length > 0) {
        console.log(
          `[facebook-adapter/apify] ✅ ${competitor.name}: ${posts.length} posts via Apify`
        );
        return posts;
      }

      // Fallback: Apify không lấy được post → thử Playwright
      context.onLog?.(
        `⚠️ Apify không trả về post nào, thử fallback Playwright...`
      );
      console.warn(`[facebook-adapter/apify] 0 posts, falling back to Playwright for ${competitor.name}`);
      return await this.fetchViaPlaywright(competitor, context);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[facebook-adapter/apify] Crawl failed for ${competitor.name}:`, errMsg);

      // Fallback: Apify lỗi → thử Playwright
      context.onLog?.(
        `⚠️ Apify lỗi (${errMsg}), thử fallback Playwright...`
      );
      return await this.fetchViaPlaywright(competitor, context);
    }
  }

  // ─── Social Crawler Provider ─────────────────────────────────────────────

  private async fetchViaSocialCrawler(
    competitor: Competitor,
    context: AdapterContext
  ): Promise<RawPostInput[]> {
    const providerConfig = context.settings.facebookProvider;
    const scConfig = providerConfig?.socialCrawler;

    if (!scConfig?.apiUrl) {
      console.warn(
        `[facebook-adapter/social-crawler] API URL not configured for ${competitor.name} — skipping`
      );
      context.onLog?.(
        `⚠️ Social Crawler chưa cấu hình (thiếu API URL) cho ${competitor.name}`
      );
      return [];
    }

    try {
      const { socialCrawlerFacebookProvider } = await import(
        "@/lib/providers/socialCrawlerFacebookProvider"
      );
      const { getDefaultFacebookAccount } = await import("@/lib/facebook/accounts");

      const defaultAccount = await getDefaultFacebookAccount();
      const cookies = defaultAccount?.sessionData ? JSON.parse(defaultAccount.sessionData) : null;

      const maxItems = scConfig.maxItems ?? 50;

      context.onLog?.(
        `🌐 ${competitor.name}: Crawl via Social Crawler (maxItems=${maxItems})`
      );

      const posts = await socialCrawlerFacebookProvider.fetchPosts(
        competitor.channelUrl,
        scConfig,
        {
          startDate: context.startDate,
          endDate: context.endDate,
          maxItems,
          cookies,
          stopUrls: undefined, // Có thể thêm sau nếu cần truyền stopUrls từ context
          onLog: (message: string) => {
            context.onLog?.(message);
          },
        }
      );

      console.log(
        `[facebook-adapter/social-crawler] ✅ ${competitor.name}: ${posts.length} posts`
      );
      return posts;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[facebook-adapter/social-crawler] Crawl failed for ${competitor.name}:`, errMsg);
      context.onLog?.(
        `❌ Social Crawler crawl thất bại cho ${competitor.name}: ${errMsg}`
      );

      // ─── Gửi Telegram notification ───────────────────────────────
      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(context.teamId ?? null, "crawl.error",
          `❌ Lỗi crawl Facebook (Social Crawler) — ${competitor.name}`,
          `**Đối thủ:** ${competitor.name}\n**Lỗi:** ${errMsg}\n**Provider:** Social Crawler`);
      } catch { /* silent */ }

      return [];
    }
  }

  // ─── Playwright / In-process GraphQL Crawler ────────────────────────────
  //
  //  Dùng Playwright mở browser, intercept GraphQL API responses
  //  để lấy dữ liệu (ported từ Python social-crawler).
  //  Ổn định hơn DOM parsing vì cấu trúc GraphQL ít thay đổi hơn DOM.

  private async fetchViaPlaywright(
    competitor: Competitor,
    context: AdapterContext
  ): Promise<RawPostInput[]> {
    try {
      const { crawlFacebook, cleanupBrowser } = await import(
        "@/lib/adapters/providers/facebookCrawler"
      );
      const { getDefaultFacebookAccount } = await import("@/lib/facebook/accounts");

      // Lấy session cookies nếu có
      const fbAccount = await getDefaultFacebookAccount();
      const storageState = fbAccount
        ? (JSON.parse(fbAccount.sessionData) as Record<string, unknown>)
        : undefined;

      const providerConfig = context.settings.facebookProvider;
      const pwConfig = providerConfig?.playwright ?? {
        browserEngine: "playwright",
        headless: true,
        scrollDelayMin: 2000,
        scrollDelayMax: 4000,
      };

      const contextAny = context as Record<string, unknown>;
      const configuredMaxPosts =
        typeof contextAny.facebookMaxPosts === "number"
          ? contextAny.facebookMaxPosts
          : undefined;
      const hasDateRange = Boolean(context.startDate || context.endDate);
      const maxPosts = configuredMaxPosts ?? (hasDateRange ? 200 : 50);

      context.onLog?.(
        `🖥️ ${competitor.name}: GraphQL interception crawler (engine=${pwConfig.browserEngine})`
      );

      const result = await crawlFacebook(competitor.channelUrl, {
        headless: pwConfig.headless,
        browserEngine: pwConfig.browserEngine,
        storageState,
        maxPosts,
        startDate: context.startDate,
        endDate: context.endDate,
        scrollConfig: {
          scrollDelayMin: pwConfig.scrollDelayMin,
          scrollDelayMax: pwConfig.scrollDelayMax,
        },
        onLog: (msg: string) => context.onLog?.(msg),
      });

      await cleanupBrowser();

      if (!result || !result.posts.length) {
        context.onLog?.(`⚠️ ${competitor.name}: Không tìm thấy bài viết`);
        return [];
      }

      // Map GraphQL posts → RawPostInput
      const startFilter = context.startDate ? new Date(context.startDate) : null;
      const endFilter = context.endDate ? new Date(context.endDate) : null;
      if (endFilter) endFilter.setHours(23, 59, 59, 999);

      let posts: RawPostInput[] = result.posts.map((post) => ({
        platform: "facebook" as const,
        postUrl: post.postUrl,
        title: post.caption.slice(0, 200) || `Facebook post by ${post.authorName}`,
        caption: post.caption,
        publishedAt: post.publishedAt ? new Date(post.publishedAt) : new Date(),
        thumbnailUrl: post.imageUrl || undefined,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        format:
          post.images.length > 1
            ? "carousel"
            : post.images.length === 1
              ? "image_post"
              : "text_post",
      }));

      context.onLog?.(
        `📊 GraphQL crawl: ${result.posts.length} bài (${result.sourceType})`
      );

      if (startFilter || endFilter) {
        const before = posts.length;
        posts = posts.filter((p) => {
          if (startFilter && p.publishedAt < startFilter) return false;
          if (endFilter && p.publishedAt > endFilter) return false;
          return true;
        });
        context.onLog?.(`📅 Date filter: ${before} → ${posts.length} posts`);
      }

      console.log(`[facebook-adapter/playwright] ✅ ${competitor.name}: ${posts.length} posts`);
      return posts;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[facebook-adapter/playwright] Crawl failed for ${competitor.name}: ${errMsg}`);
      context.onLog?.(`❌ ${competitor.name}: Lỗi crawl Facebook — ${errMsg}`);

      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(context.teamId ?? null, "crawl.error",
          `❌ Lỗi crawl Facebook — ${competitor.name}`,
          `**Đối thủ:** ${competitor.name}\n**Lỗi:** ${errMsg}\n**Platform:** Facebook`);
      } catch { /* silent */ }

      return [];
    }
  }
}
