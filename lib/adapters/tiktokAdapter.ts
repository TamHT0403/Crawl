import type { Competitor } from "@prisma/client";
import type { AdapterContext, CompetitorDataAdapter } from "@/lib/adapters/types";
import type { RawPostInput } from "@/lib/types";

/**
 * TikTokAdapter — Multi-provider crawl dispatcher
 *
 * Chọn provider dựa vào tiktokProvider.activeProvider trong settings:
 *  - "playwright"      → dùng Playwright/CloakBrowser local crawler
 *  - "apify"           → dùng Apify cloud Actor
 *  - "social-crawler"  → dùng third-party social-crawler API
 *
 * Thêm provider mới: chỉ cần thêm case mới vào switch bên dưới.
 */
export class TikTokAdapter implements CompetitorDataAdapter {
  async fetchLatestPosts(competitor: Competitor, context: AdapterContext) {
    const providerConfig = context.settings.tiktokProvider;
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
    const providerConfig = context.settings.tiktokProvider;
    const apifyConfig = providerConfig?.apify;

    if (!apifyConfig?.apiToken || !apifyConfig?.actorId) {
      console.warn(
        `[tiktok-adapter/apify] Apify token or actorId not configured for ${competitor.name} — skipping`
      );
      context.onLog?.(
        `⚠️ Apify chưa cấu hình (thiếu API Token hoặc Actor ID) cho ${competitor.name}`
      );
      return [];
    }

    try {
      const { apifyTikTokProvider } = await import("@/lib/providers/apifyTikTokProvider");

      const maxItems = apifyConfig.maxItems ?? 50;

      context.onLog?.(
        `☁️ ${competitor.name}: Crawl via Apify actor "${apifyConfig.actorId}" (maxItems=${maxItems})`
      );

      const posts = await apifyTikTokProvider.fetchVideos(
        competitor.channelUrl,
        apifyConfig,
        {
          startDate: context.startDate,
          endDate: context.endDate,
          maxItems,
          onLog: context.onLog,
        }
      );

      console.log(
        `[tiktok-adapter/apify] ✅ ${competitor.name}: ${posts.length} videos via Apify`
      );
      return posts;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[tiktok-adapter/apify] Crawl failed for ${competitor.name}:`, errMsg);
      context.onLog?.(
        `❌ Apify crawl thất bại cho ${competitor.name}: ${errMsg}`
      );

      // ─── Gửi Telegram notification ───────────────────────────────
      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(context.teamId ?? null, "crawl.error",
          `❌ Lỗi crawl TikTok (Apify) — ${competitor.name}`,
          `**Đối thủ:** ${competitor.name}\n**Lỗi:** ${errMsg}\n**Provider:** Apify`);
      } catch { /* silent */ }

      return [];
    }
  }

  // ─── Social Crawler Provider ─────────────────────────────────────────────

  private async fetchViaSocialCrawler(
    competitor: Competitor,
    context: AdapterContext
  ): Promise<RawPostInput[]> {
    const providerConfig = context.settings.tiktokProvider;
    const scConfig = providerConfig?.socialCrawler;

    if (!scConfig?.apiUrl) {
      console.warn(
        `[tiktok-adapter/social-crawler] API URL not configured for ${competitor.name} — skipping`
      );
      context.onLog?.(
        `⚠️ Social Crawler chưa cấu hình (thiếu API URL) cho ${competitor.name}`
      );
      return [];
    }

    try {
      const { socialCrawlerTikTokProvider } = await import(
        "@/lib/providers/socialCrawlerTikTokProvider"
      );
      const { getDefaultTikTokAccount } = await import("@/lib/tiktok/accounts");

      const defaultAccount = await getDefaultTikTokAccount();
      const cookies = defaultAccount?.sessionData ? JSON.parse(defaultAccount.sessionData) : null;

      const maxItems = scConfig.maxItems ?? 50;

      context.onLog?.(
        `🌐 ${competitor.name}: Crawl via Social Crawler (maxItems=${maxItems})`
      );

      const posts = await socialCrawlerTikTokProvider.fetchVideos(
        competitor.channelUrl,
        scConfig,
        {
          startDate: context.startDate,
          endDate: context.endDate,
          maxItems,
          cookies,
          onLog: (message: string) => {
            context.onLog?.(message);
          },
        }
      );

      console.log(
        `[tiktok-adapter/social-crawler] ✅ ${competitor.name}: ${posts.length} videos`
      );
      return posts;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[tiktok-adapter/social-crawler] Crawl failed for ${competitor.name}:`, errMsg);
      context.onLog?.(
        `❌ Social Crawler crawl thất bại cho ${competitor.name}: ${errMsg}`
      );

      // ─── Gửi Telegram notification ───────────────────────────────
      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(context.teamId ?? null, "crawl.error",
          `❌ Lỗi crawl TikTok (Social Crawler) — ${competitor.name}`,
          `**Đối thủ:** ${competitor.name}\n**Lỗi:** ${errMsg}\n**Provider:** Social Crawler`);
      } catch { /* silent */ }

      return [];
    }
  }

  // ─── Playwright / In-process Crawler ────────────────────────────────────

  private async fetchViaPlaywright(
    competitor: Competitor,
    context: AdapterContext
  ): Promise<RawPostInput[]> {
    const providerConfig = context.settings.tiktokProvider;
    const pwConfig = providerConfig?.playwright ?? {
      browserEngine: "cloakbrowser",
      headless: true,
      scrollDelayMin: 1500,
      scrollDelayMax: 4000,
    };

    try {
      const { crawlTikTokProfile, cleanupBrowser } = await import(
        "@/lib/adapters/providers/tiktokCrawler"
      );

      const dateRange =
        context.startDate || context.endDate
          ? {
              start_date: context.startDate
                ? new Date(context.startDate).toISOString().split("T")[0]
                : undefined,
              end_date: context.endDate
                ? new Date(context.endDate).toISOString().split("T")[0]
                : undefined,
            }
          : undefined;

      const crawlConfig = {
        headless: pwConfig.headless,
        browserEngine: pwConfig.browserEngine,
        scrollDelayMin: pwConfig.scrollDelayMin,
        scrollDelayMax: pwConfig.scrollDelayMax,
      };

      context.onLog?.(
        `🖥️ ${competitor.name}: Playwright/CloakBrowser (engine=${crawlConfig.browserEngine})`
      );

      const result = await crawlTikTokProfile(competitor.channelUrl, dateRange, crawlConfig);
      await cleanupBrowser();

      if (!result || result.videos.length === 0) {
        console.warn(`[tiktok-adapter/playwright] No videos found for ${competitor.name}`);
        return [];
      }

      const posts: RawPostInput[] = result.videos.map((video) => ({
        platform: "tiktok" as const,
        postUrl: video.url,
        title: video.description.slice(0, 200) || `TikTok video by ${result.nickname}`,
        caption: video.description,
        publishedAt: new Date(video.create_time),
        thumbnailUrl: video.cover_url || undefined,
        views: video.stats.play_count,
        likes: video.stats.like_count,
        comments: video.stats.comment_count,
        shares: video.stats.share_count,
        format: "short_video",
      }));

      console.log(
        `[tiktok-adapter/playwright] ✅ ${competitor.name}: ${posts.length} videos`
      );
      return posts;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[tiktok-adapter/playwright] Crawl failed for ${competitor.name}:`, errMsg);

      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(context.teamId ?? null, "crawl.error",
          `❌ Lỗi crawl TikTok (Playwright) — ${competitor.name}`,
          `**Đối thủ:** ${competitor.name}\n**Lỗi:** ${errMsg}\n**Provider:** Playwright`);
      } catch { /* silent */ }

      return [];
    }
  }
}
