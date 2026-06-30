import { FacebookAdapter } from "@/lib/adapters/facebookAdapter";
import { TikTokAdapter } from "@/lib/adapters/tiktokAdapter";
import { YouTubeAdapter } from "@/lib/adapters/youtubeAdapter";
import { enrichRawPost } from "@/lib/classifier";
import { prisma } from "@/lib/prisma";
import { getPublicSettings } from "@/lib/settings";
import type { Platform, SyncFilters } from "@/lib/types";

// ─── Global sync job status store ──────────────────────────────────────────

export type SyncJobStatus = {
  state: "running" | "completed" | "error";
  progress: Record<string, unknown>;
  logs: string[];        // Recent log messages để GlobalSyncStatus hiển thị
  result?: Record<string, unknown>;
  cookieInvalid?: boolean;
  cookieInvalidCompetitor?: string | null;
};

declare global {
  // eslint-disable-next-line no-var
  var syncJobs: Record<string, SyncJobStatus>;
}
global.syncJobs = global.syncJobs || {};

// ─── Adapters ──────────────────────────────────────────────────────────────

const adapters = {
  youtube: new YouTubeAdapter(),
  tiktok: new TikTokAdapter(),
  facebook: new FacebookAdapter()
};

type ProgressEmitter = (event: string, data: Record<string, unknown>) => void;

/**
 * Sanitize string fields to prevent JSON serialization errors in Prisma.
 * Scraped content may contain control characters, invalid escape sequences,
 * or broken unicode that would cause "unexpected end of hex escape" errors.
 */
function sanitize(val: string | undefined | null): string {
  if (typeof val !== "string") return "";
  return val.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

function formatTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m${sec % 60}s`;
}

const syncFilterTimeZone = "Asia/Ho_Chi_Minh";
const syncFilterDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: syncFilterTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toSyncFilterDateKey(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = value instanceof Date ? value : new Date(value);
  const parts = syncFilterDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function isOutsideSyncDateRange(postDate: Date, startDate?: string, endDate?: string): boolean {
  if (!startDate && !endDate) return false;

  const postDateKey = toSyncFilterDateKey(postDate);
  if (startDate && postDateKey < toSyncFilterDateKey(startDate)) return true;
  if (endDate && postDateKey > toSyncFilterDateKey(endDate)) return true;
  return false;
}

function formatSyncDateRangeLog(startDate?: string, endDate?: string): string {
  const start = startDate ? toSyncFilterDateKey(startDate) : "...";
  const end = endDate ? toSyncFilterDateKey(endDate) : "...";
  return `🗓️ Áp dụng bộ lọc ngày (${syncFilterTimeZone}): ${start} → ${end}`;
}

function getFacebookSaveLimit(platform: string, syncFilters?: SyncFilters): number | null {
  if (platform !== "facebook") return null;
  if (typeof syncFilters?.facebookMaxPosts !== "number") return null;
  return syncFilters.facebookMaxPosts;
}

function shouldApplySyncDateFilter(platform: string, settings: Awaited<ReturnType<typeof getPublicSettings>>): boolean {
  return !(platform === "facebook" && settings.facebookProvider?.activeProvider === "social-crawler");
}

export async function syncCompetitorData(platform?: Platform, syncFilters?: SyncFilters) {
  const settings = await getPublicSettings();
  const platforms = syncFilters?.platforms?.length ? syncFilters.platforms : (platform ? [platform] : undefined);

  const whereCompetitor: Record<string, unknown> = {};
  if (platforms?.length) {
    whereCompetitor.platform = { in: platforms };
  }
  if (syncFilters?.competitorIds?.length) {
    whereCompetitor.id = { in: syncFilters.competitorIds };
  }

  const competitors = await prisma.competitor.findMany({
    where: whereCompetitor,
    orderBy: [{ platform: "asc" }, { name: "asc" }]
  });

  const syncRunId = `${Date.now()}`;
  let createdPosts = 0;
  let updatedPosts = 0;

  for (const competitor of competitors) {
    const adapter = adapters[competitor.platform as Platform];
    const rawPosts = await adapter.fetchLatestPosts(competitor, {
      settings,
      syncRunId,
      startDate: syncFilters?.startDate,
      endDate: syncFilters?.endDate
    });

    for (const rawPost of rawPosts) {
      const enriched = enrichRawPost({
        ...rawPost,
        competitorId: competitor.id
      });

      // Skip posts check removed because date filtering is already handled on the crawler backend

      const existingPost = await prisma.post.findFirst({
        where: {
          competitorId: competitor.id,
          postUrl: enriched.postUrl
        },
        select: { id: true }
      });
      const data = {
        competitorId: competitor.id,
        platform: enriched.platform,
        postUrl: sanitize(enriched.postUrl),
        title: sanitize(enriched.title),
        caption: sanitize(enriched.caption),
        transcript: enriched.transcript ? sanitize(enriched.transcript) : null,
        publishedAt: enriched.publishedAt,
        thumbnailUrl: sanitize(enriched.thumbnailUrl),
        format: sanitize(enriched.format),
        contentPillar: sanitize(enriched.contentPillar),
        promotionType: sanitize(enriched.promotionType),
        toneOfVoice: sanitize(enriched.toneOfVoice),
        hookType: sanitize(enriched.hookType),
        mainTopic: sanitize(enriched.mainTopic),
        views: enriched.views,
        likes: enriched.likes,
        comments: enriched.comments,
        shares: enriched.shares,
        engagementRate: enriched.engagementRate,
        viralityScore: enriched.viralityScore
      };

      if (existingPost) {
        await prisma.post.update({
          where: { id: existingPost.id },
          data
        });
        updatedPosts += 1;
      } else {
        await prisma.post.create({ data });
        createdPosts += 1;
      }
    }
  }

  return {
    syncRunId,
    competitors: competitors.length,
    createdPosts,
    updatedPosts,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Phiên bản streaming — gửi progress events về client qua SSE
 * để UI hiển thị progress bar + log messages realtime.
 *
 * @deprecated Dùng startBackgroundSync thay thế (background job, không SSE)
 */
export async function syncCompetitorDataStream(
  platform?: Platform,
  syncFilters?: SyncFilters,
  externalSyncRunId?: string,
): Promise<ReadableStream> {
  const encoder = new TextEncoder();

  const emit: ProgressEmitter = (event, data) => {
    // Used internally via the stream controller
  };

  let syncRunId = externalSyncRunId || `${Date.now()}`;
  let totalCompetitors = 0;
  let completedCompetitors = 0;
  let createdPosts = 0;
  let updatedPosts = 0;
  let startTime = Date.now();
  let currentPlatform: string | null = null;
  let currentCompetitorName: string | null = null;

  // Initialize global job status
  const syncJobRef: SyncJobStatus = {
    state: "running",
    progress: {},
    logs: [],
  };
  global.syncJobs[syncRunId] = syncJobRef;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller might be closed if client disconnected — ignore gracefully
        }
      };

      const updateProgress = (message?: string) => {
        const plat = currentPlatform || "unknown";
        const percent = totalCompetitors > 0
          ? Math.round((completedCompetitors / totalCompetitors) * 100)
          : 0;

        syncJobRef.progress = {
          total: totalCompetitors,
          completed: completedCompetitors,
          percent,
          [plat]: {
            phase: completedCompetitors === totalCompetitors ? "done" : "crawling",
            percent,
            statusMsg: message || (currentCompetitorName
              ? `Đang xử lý ${currentCompetitorName}`
              : "Đang chờ..."),
          },
        };
      };

      const pushLog = (msg: string) => {
        syncJobRef.logs = [...syncJobRef.logs.slice(-99), msg];
      };

      try {
        send("job", { syncRunId });
        send("log", { message: "📡 Đang tải cấu hình hệ thống..." });

        const settings = await getPublicSettings();
        const platforms = syncFilters?.platforms?.length
          ? syncFilters.platforms
          : platform
            ? [platform]
            : undefined;

        send("log", { message: `✅ Đã tải cấu hình — ${platforms?.join(", ") || "tất cả nền tảng"}` });
        if (syncFilters?.startDate || syncFilters?.endDate) {
          send("log", { message: formatSyncDateRangeLog(syncFilters.startDate, syncFilters.endDate) });
        }
        send("log", { message: "🔍 Đang truy vấn danh sách đối thủ..." });

        const whereCompetitor: Record<string, unknown> = {};
        if (platforms?.length) whereCompetitor.platform = { in: platforms };
        if (syncFilters?.competitorIds?.length) whereCompetitor.id = { in: syncFilters.competitorIds };

        const competitors = await prisma.competitor.findMany({
          where: whereCompetitor,
          orderBy: [{ platform: "asc" }, { name: "asc" }],
        });

        totalCompetitors = competitors.length;
        startTime = Date.now();

        send("progress", { total: totalCompetitors, completed: 0, percent: 0 });
        send("log", {
          message: `📋 Tìm thấy ${totalCompetitors} đối thủ cần đồng bộ (${platforms?.join(", ") || "tất cả"})`,
        });
        updateProgress();

        if (totalCompetitors === 0) {
          send("log", { message: "⚠️ Không có đối thủ nào để đồng bộ." });
          send("done", {
            syncRunId, competitors: 0, createdPosts: 0, updatedPosts: 0,
            elapsed: formatTime(Date.now() - startTime),
          });
          syncJobRef.state = "completed";
          syncJobRef.progress = {};
          syncJobRef.logs = [];
          syncJobRef.result = { competitors: 0, createdPosts: 0, updatedPosts: 0, elapsed: formatTime(Date.now() - startTime) };
          controller.close();
          return;
        }

        for (let i = 0; i < competitors.length; i++) {
          const competitor = competitors[i];
          const platformLabel = competitor.platform === "youtube" ? "YouTube"
            : competitor.platform === "tiktok" ? "TikTok" : "Facebook";

          currentPlatform = competitor.platform;
          currentCompetitorName = competitor.name;

          send("log", {
            message: `🔄 [${i + 1}/${totalCompetitors}] Đang xử lý ${competitor.name} (${platformLabel})...`,
            competitor: competitor.name, platform: competitor.platform,
          });
          updateProgress(`Đang xử lý ${competitor.name} (${platformLabel})`);

          const adapter = adapters[competitor.platform as Platform];

          const adapterContext: Record<string, unknown> = {
            settings, syncRunId, teamId: undefined,
            startDate: syncFilters?.startDate,
            endDate: syncFilters?.endDate,
            onLog: (message: string) => {
              updateProgress(message);
              pushLog(message);
              send("log", { message, competitor: competitor.name, platform: competitor.platform });
            },
          };
          if (syncFilters?.facebookMaxPosts && competitor.platform === "facebook") {
            adapterContext.facebookMaxPosts = syncFilters.facebookMaxPosts;
          }

          const rawPosts = await adapter.fetchLatestPosts(competitor, adapterContext as Parameters<typeof adapter.fetchLatestPosts>[1]);

          if (!rawPosts || rawPosts.length === 0) {
            send("log", { message: `⚠️ ${competitor.name}: Không tìm thấy bài viết mới.`, competitor: competitor.name });
          } else {
            send("log", { message: `📥 ${competitor.name}: Đã thu thập ${rawPosts.length} bài viết, đang lưu...`, competitor: competitor.name });
          }

          let competitorCreated = 0;
          let competitorUpdated = 0;
          let competitorSkippedByDate = 0;
          const competitorSaveLimit = getFacebookSaveLimit(competitor.platform, syncFilters);
          const applyDateFilter = shouldApplySyncDateFilter(competitor.platform, settings);
          if (!applyDateFilter && (syncFilters?.startDate || syncFilters?.endDate)) {
            send("log", { message: `ℹ️ ${competitor.name}: Bỏ qua lọc ngày tại Next.js vì Social Crawler Facebook đã trả danh sách cuối cùng.`, competitor: competitor.name });
          }

          for (let j = 0; j < (rawPosts?.length ?? 0); j++) {
            if (competitorSaveLimit !== null && competitorCreated + competitorUpdated >= competitorSaveLimit) break;

            const rawPost = rawPosts![j];
            const enriched = enrichRawPost({ ...rawPost, competitorId: competitor.id });

            if (applyDateFilter && (syncFilters?.startDate || syncFilters?.endDate)) {
              const postDate = new Date(enriched.publishedAt);
              if (isOutsideSyncDateRange(postDate, syncFilters.startDate, syncFilters.endDate)) {
                competitorSkippedByDate++;
                send("log", {
                  message: `⏭️ ${competitor.name}: Bỏ qua bài ngoài khoảng thời gian (${toSyncFilterDateKey(postDate)}) — ${enriched.postUrl}`,
                  competitor: competitor.name,
                });
                continue;
              }
            }

            const existingPost = await prisma.post.findFirst({
              where: { competitorId: competitor.id, postUrl: enriched.postUrl },
              select: { id: true },
            });

            const data = {
              competitorId: competitor.id, platform: enriched.platform,
              postUrl: sanitize(enriched.postUrl), title: sanitize(enriched.title),
              caption: sanitize(enriched.caption),
              transcript: enriched.transcript ? sanitize(enriched.transcript) : null,
              publishedAt: enriched.publishedAt,
              thumbnailUrl: sanitize(enriched.thumbnailUrl), format: sanitize(enriched.format),
              contentPillar: sanitize(enriched.contentPillar), promotionType: sanitize(enriched.promotionType),
              toneOfVoice: sanitize(enriched.toneOfVoice), hookType: sanitize(enriched.hookType),
              mainTopic: sanitize(enriched.mainTopic),
              views: enriched.views, likes: enriched.likes, comments: enriched.comments, shares: enriched.shares,
              engagementRate: enriched.engagementRate, viralityScore: enriched.viralityScore,
            };

            if (existingPost) {
              await prisma.post.update({ where: { id: existingPost.id }, data });
              competitorUpdated++;
            } else {
              await prisma.post.create({ data });
              competitorCreated++;
            }

            if ((j + 1) % 5 === 0 || j === rawPosts.length - 1) {
              send("log", {
                message: `💾 ${competitor.name}: Đã xử lý ${j + 1}/${rawPosts.length} bài (${competitorCreated} mới, ${competitorUpdated} cập nhật)`,
                competitor: competitor.name,
              });
            }
          }

          createdPosts += competitorCreated;
          updatedPosts += competitorUpdated;
          completedCompetitors = i + 1;

          const percent = Math.round((completedCompetitors / totalCompetitors) * 100);
          send("progress", { total: totalCompetitors, completed: completedCompetitors, percent });
          send("log", { message: `✅ ${competitor.name}: Hoàn tất — ${competitorCreated} bài mới, ${competitorUpdated} bài cập nhật.`, competitor: competitor.name });
          if (competitorSkippedByDate > 0) {
            send("log", { message: `ℹ️ ${competitor.name}: ${competitorSkippedByDate} bài bị bỏ qua do nằm ngoài khoảng thời gian lọc.`, competitor: competitor.name });
          }
          updateProgress();
        }

        const elapsed = formatTime(Date.now() - startTime);
        send("log", { message: `🎉 Đồng bộ hoàn tất sau ${elapsed}!` });
        send("done", { syncRunId, competitors: totalCompetitors, createdPosts, updatedPosts, elapsed, syncedAt: new Date().toISOString() });
        syncJobRef.state = "completed";
        syncJobRef.progress = { total: totalCompetitors, completed: completedCompetitors, percent: 100 };
        syncJobRef.result = { competitors: totalCompetitors, createdPosts, updatedPosts, elapsed };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", { message: `❌ Lỗi: ${msg}` });
        send("done", { syncRunId, competitors: totalCompetitors, createdPosts, updatedPosts, elapsed: formatTime(Date.now() - startTime), error: msg });
        syncJobRef.state = "error";
        syncJobRef.progress = { total: totalCompetitors, completed: completedCompetitors, percent: totalCompetitors > 0 ? Math.round((completedCompetitors / totalCompetitors) * 100) : 0 };
        syncJobRef.result = { competitors: totalCompetitors, createdPosts, updatedPosts, elapsed: formatTime(Date.now() - startTime), error: msg };
      } finally {
        controller.close();
      }
    },
  });

  return stream;
}

// ─── Background Sync Job ───────────────────────────────────────────────────
// Chạy sync ở background, không dùng SSE stream.
// API route trả về { jobId } ngay lập tức, client poll status.

export function startBackgroundSync(
  jobId: string,
  platform?: Platform,
  syncFilters?: SyncFilters,
  teamId?: string,
) {
  global.syncJobs[jobId] = {
    state: "running",
    progress: {},
    logs: [],
  };

  const send = (event: string, data: Record<string, unknown>) => {
    const job = global.syncJobs[jobId];
    if (!job) return;

    if (event === "log") {
      const msg = String(data.message || "");
      job.logs = [...job.logs.slice(-99), msg];
    } else if (event === "progress") {
      const plat = data.platform as string;
      if (plat) {
        job.progress = {
          ...job.progress,
          [plat]: { ...((job.progress[plat] as Record<string, unknown>) || {}), ...data },
        };
      } else {
        job.progress = { ...job.progress, ...data };
      }
    } else if (event === "cookie_invalid") {
      job.cookieInvalid = true;
      job.cookieInvalidCompetitor = data.competitor as string;
    } else if (event === "done") {
      job.state = data.error ? "error" : "completed";
      job.result = data;
    } else if (event === "error") {
      job.logs = [...job.logs.slice(-99), `❌ ${data.message}`];
    }
  };

  (async () => {
    let totalCompetitors = 0;
    let createdPosts = 0;
    let updatedPosts = 0;
    let startTime = Date.now();
    const syncRunId = `${Date.now()}`;

    try {
      send("log", { message: "📡 Đang tải cấu hình hệ thống..." });

      const settings = await getPublicSettings();
      const platforms = syncFilters?.platforms?.length
        ? syncFilters.platforms
        : platform
          ? [platform]
          : undefined;

      send("log", { message: `✅ Đã tải cấu hình — ${platforms?.join(", ") || "tất cả nền tảng"}` });
      if (syncFilters?.startDate || syncFilters?.endDate) {
        send("log", { message: formatSyncDateRangeLog(syncFilters.startDate, syncFilters.endDate) });
      }
      send("log", { message: "🔍 Đang truy vấn danh sách đối thủ..." });

      const whereCompetitor: Record<string, unknown> = {};
      if (platforms?.length) whereCompetitor.platform = { in: platforms };
      if (syncFilters?.competitorIds?.length) whereCompetitor.id = { in: syncFilters.competitorIds };

      const competitors = await prisma.competitor.findMany({
        where: whereCompetitor,
        orderBy: [{ platform: "asc" }, { name: "asc" }],
      });

      totalCompetitors = competitors.length;
      startTime = Date.now();

      send("log", { message: `📋 Tìm thấy ${totalCompetitors} đối thủ cần đồng bộ (${platforms?.join(", ") || "tất cả"})` });

      if (totalCompetitors === 0) {
        send("log", { message: "⚠️ Không có đối thủ nào để đồng bộ." });
        send("done", {
          syncRunId, competitors: 0, createdPosts: 0, updatedPosts: 0,
          elapsed: formatTime(Date.now() - startTime),
        });
        return;
      }

      // Group by platform
      const compByPlatform: Record<string, typeof competitors> = {};
      for (const c of competitors) {
        if (!compByPlatform[c.platform]) compByPlatform[c.platform] = [];
        compByPlatform[c.platform].push(c);
      }

      for (const [plat, comps] of Object.entries(compByPlatform)) {
        send("progress", { platform: plat, total: comps.length, completed: 0, percent: 0, phase: "waiting" });
      }

      await Promise.allSettled(Object.entries(compByPlatform).map(async ([plat, comps]) => {
        if (comps.length === 0) return;
        const adapter = adapters[plat as Platform];
        if (!adapter) {
          send("log", { message: `⚠️ Không tìm thấy adapter cho ${plat}` });
          return;
        }

        send("log", { message: `🔄 Đang xử lý ${comps.length} đối thủ trên ${plat}...` });
        send("progress", { platform: plat, phase: "running", statusMsg: "Đang khởi động..." });

        const adapterContext: Record<string, unknown> = {
          settings, syncRunId, teamId,
          startDate: syncFilters?.startDate,
          endDate: syncFilters?.endDate,
          onLog: (message: string) => send("log", { message }),
        };

        if (syncFilters?.facebookMaxPosts && plat === "facebook") {
          adapterContext.facebookMaxPosts = syncFilters.facebookMaxPosts;
        }

        for (let i = 0; i < comps.length; i++) {
          const competitor = comps[i];
          send("log", { message: `🔄 [${i + 1}/${comps.length}] Đang xử lý ${competitor.name} (${plat})...` });
          send("progress", { platform: plat, phase: "running", statusMsg: `Đang xử lý: ${competitor.name}`, completed: i, percent: Math.round((i / comps.length) * 100) });

          const rawPosts = await adapter.fetchLatestPosts(competitor, adapterContext as Parameters<typeof adapter.fetchLatestPosts>[1]);

          if (!rawPosts || rawPosts.length === 0) {
            send("log", { message: `⚠️ ${competitor.name}: Không tìm thấy bài viết mới.` });
          } else {
            send("log", { message: `📥 ${competitor.name}: Đã thu thập ${rawPosts.length} bài viết, đang lưu...` });
          }

          let compCreated = 0, compUpdated = 0, compSkippedByDate = 0;
          const compSaveLimit = getFacebookSaveLimit(competitor.platform, syncFilters);
          const applyDateFilter = shouldApplySyncDateFilter(competitor.platform, settings);
          if (!applyDateFilter && (syncFilters?.startDate || syncFilters?.endDate)) {
            send("log", { message: `ℹ️ ${competitor.name}: Bỏ qua lọc ngày tại Next.js vì Social Crawler Facebook đã trả danh sách cuối cùng.` });
          }
          for (const rawPost of (rawPosts || [])) {
            if (compSaveLimit !== null && compCreated + compUpdated >= compSaveLimit) break;

            const enriched = enrichRawPost({ ...rawPost, competitorId: competitor.id });

            if (applyDateFilter && (syncFilters?.startDate || syncFilters?.endDate)) {
              const postDate = new Date(enriched.publishedAt);
              if (isOutsideSyncDateRange(postDate, syncFilters.startDate, syncFilters.endDate)) {
                compSkippedByDate++;
                send("log", {
                  message: `⏭️ ${competitor.name}: Bỏ qua bài ngoài khoảng thời gian (${toSyncFilterDateKey(postDate)}) — ${enriched.postUrl}`,
                });
                continue;
              }
            }

            const existingPost = await prisma.post.findFirst({
              where: { competitorId: competitor.id, postUrl: enriched.postUrl },
              select: { id: true },
            });

            const data = {
              competitorId: competitor.id, platform: enriched.platform,
              postUrl: sanitize(enriched.postUrl), title: sanitize(enriched.title),
              caption: sanitize(enriched.caption),
              transcript: enriched.transcript ? sanitize(enriched.transcript) : null,
              publishedAt: enriched.publishedAt,
              thumbnailUrl: sanitize(enriched.thumbnailUrl), format: sanitize(enriched.format),
              contentPillar: sanitize(enriched.contentPillar), promotionType: sanitize(enriched.promotionType),
              toneOfVoice: sanitize(enriched.toneOfVoice), hookType: sanitize(enriched.hookType),
              mainTopic: sanitize(enriched.mainTopic),
              views: enriched.views, likes: enriched.likes, comments: enriched.comments, shares: enriched.shares,
              engagementRate: enriched.engagementRate, viralityScore: enriched.viralityScore,
            };

            if (existingPost) {
              await prisma.post.update({ where: { id: existingPost.id }, data });
              compUpdated++;
            } else {
              await prisma.post.create({ data });
              compCreated++;
            }
          }

          createdPosts += compCreated;
          updatedPosts += compUpdated;

          send("progress", { platform: plat, completed: i + 1, percent: Math.round(((i + 1) / comps.length) * 100), phase: i + 1 === comps.length ? "done" : "running", statusMsg: `✅ ${competitor.name}: Hoàn tất (${compCreated} mới, ${compUpdated} cập nhật)` });
          send("log", { message: `✅ ${competitor.name}: Hoàn tất — ${compCreated} bài mới, ${compUpdated} bài cập nhật.` });
          if (compSkippedByDate > 0) {
            send("log", { message: `ℹ️ ${competitor.name}: ${compSkippedByDate} bài bị bỏ qua do nằm ngoài khoảng thời gian lọc.` });
          }
        }
      }));

      const elapsed = formatTime(Date.now() - startTime);
      send("log", { message: `🎉 Đồng bộ hoàn tất sau ${elapsed}!` });
      send("done", { syncRunId, competitors: totalCompetitors, createdPosts, updatedPosts, elapsed, syncedAt: new Date().toISOString() });

      // ─── Gửi Telegram notification ─────────────────────────────────
      try {
        const { sendAlert } = await import("@/lib/alerts");
        if (createdPosts > 0 || updatedPosts > 0) {
          await sendAlert(teamId ?? null, "sync.completed", "✅ Đồng bộ hoàn tất",
            `📊 **Kết quả đồng bộ:**\n- Bài mới: ${createdPosts}\n- Bài cập nhật: ${updatedPosts}\n- Đối thủ: ${totalCompetitors}\n- Thời gian: ${elapsed}`);
        }
      } catch { /* silent */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      send("error", { message: `❌ Lỗi: ${msg}` });
      send("done", { syncRunId, competitors: totalCompetitors, createdPosts, updatedPosts, elapsed: formatTime(Date.now() - startTime), error: msg });

      // ─── Gửi Telegram notification khi lỗi ─────────────────────────
      try {
        const { sendAlert } = await import("@/lib/alerts");
        await sendAlert(teamId ?? null, "sync.failed", "❌ Đồng bộ thất bại",
          `Lỗi: ${msg}\n- Đã xử lý: ${createdPosts} bài mới, ${updatedPosts} cập nhật\n- Thời gian: ${formatTime(Date.now() - startTime)}`);
      } catch { /* silent */ }
    }
  })();
}
