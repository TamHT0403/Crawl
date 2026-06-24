/**
 * TikTok Video Crawler Provider
 *
 * Adapted from the standalone CrawlTiktok project.
 * Uses CloakBrowser (stealth-patched Chromium) to evade TikTok anti-bot detection.
 */

import path from 'node:path';
import { launch } from 'cloakbrowser';
import type { Browser, BrowserContext, Page } from 'playwright';
import type {
  DateRange,
  RawVideoItem,
  CrawlStatus,
  MusicInfo,
  VideoItem,
  VideoStats,
  UserCrawlResult,
  BrowserConfig,
} from './tiktokCrawlerTypes';
import { getSettingWithFallback } from '@/lib/settings';

const TT_BASE_URL_FALLBACK = 'https://www.tiktok.com';

let _ttBaseUrl: string | null = null;

async function getTtBaseUrl(): Promise<string> {
  if (_ttBaseUrl) return _ttBaseUrl;
  _ttBaseUrl = await getSettingWithFallback('tiktokBaseUrl', TT_BASE_URL_FALLBACK);
  return _ttBaseUrl;
}

// ─── Constants ──────────────────────────────────────────────────────────

const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: true,
  authPath: path.resolve(process.cwd(), '..', 'CrawlTiktok', 'auth', 'tiktok-session.json'),
  maxRetries: 2,
  consecutiveErrorThreshold: 3,
  scrollDelayMin: 1500,
  scrollDelayMax: 4000,
  userDataDir: path.resolve(process.cwd(), '..', 'CrawlTiktok', 'auth', 'browser-profile'),
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
];

// ─── Singleton Browser ─────────────────────────────────────────────────

let globalBrowser: Browser | null = null;
let globalContext: BrowserContext | null = null;

async function getOrCreateBrowser(
  crawlOptions?: CrawlOptions,
  config: Partial<BrowserConfig> = {},
): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  if (globalBrowser && globalContext) {
    try {
      const pages = globalContext.pages();
      if (pages.length > 0 || globalContext) {
        return { browser: globalBrowser, context: globalContext };
      }
    } catch {
      await cleanupBrowser();
    }
  }

  const cfg = { ...DEFAULT_BROWSER_CONFIG, ...config };
  const headless = crawlOptions?.headless ?? cfg.headless;
  const engine = crawlOptions?.browserEngine ?? 'cloakbrowser';

  const viewportWidth = 1280 + Math.floor(Math.random() * 200);
  const viewportHeight = 720 + Math.floor(Math.random() * 100);

  let browser: Browser;

  if (engine === 'cloakbrowser') {
    // CloakBrowser — stealth-patched Chromium
    const { launch: cbLaunch } = await import('cloakbrowser');
    browser = await cbLaunch({
      headless,
      humanize: true,
      timezone: 'Asia/Saigon',
      locale: 'en-US',
      args: ['--no-sandbox', '--disable-web-security', '--no-first-run', '--no-default-browser-check'],
    });
  } else {
    // Playwright Chromium or Edge
    const { chromium } = await import('playwright');
    const opts: Record<string, unknown> = {
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-web-security',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    };
    if (engine === 'msedge') opts.channel = 'msedge';
    browser = await chromium.launch(opts);
  }

  const fs = await import('node:fs/promises');

  const authPath = cfg.authPath || path.resolve(process.cwd(), '..', 'CrawlTiktok', 'auth', 'tiktok-session.json');

  // Helper to create context
  const makeContext = async (opts: Record<string, unknown> = {}) => browser.newContext({
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: { width: viewportWidth, height: viewportHeight },
    locale: 'en-US',
    timezoneId: 'Asia/Saigon',
    permissions: ['geolocation'],
    geolocation: { latitude: 10.8231, longitude: 106.6297 },
    ...opts,
  });

  let context: BrowserContext;

  // Try loading session from database (default TikTok account) first
  try {
    const { getDefaultTikTokAccount } = await import('@/lib/tiktok/accounts');
    const defaultAccount = await getDefaultTikTokAccount();
    if (defaultAccount) {
      const parsedState = JSON.parse(defaultAccount.sessionData);
      context = await makeContext({ storageState: parsedState });
      console.log(`[tiktok-crawler] Loaded session from DB account: ${defaultAccount.label}`);
    } else {
      throw new Error('No account in DB');
    }
  } catch {
    // DB not available or no account — fall back to file
    try {
      await fs.access(authPath);
      context = await makeContext({ storageState: authPath });
      console.log(`[tiktok-crawler] Loaded session from ${authPath}`);
    } catch {
      context = await makeContext({});
      console.log('[tiktok-crawler] No saved session — continuing without authentication');
    }
  }

  // ─── Additional stealth cloaking ─────────────────────────────────────
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    (window as unknown as Record<string, unknown>).chrome = {
      runtime: {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {} },
        onConnect: { addListener: () => {} },
        getManifest: () => ({ version: '126' }),
      },
      loadTimes: () => {},
      csi: () => {},
      app: { isInstalled: false },
    };

    const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    (window.navigator.permissions as { query: (params: { name: string }) => Promise<PermissionStatus> }).query =
      (params: { name: string }) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus)
          : originalQuery(params as unknown as PermissionDescriptor);

    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' },
      ],
    });

    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'vi', 'zh-CN'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
  });

  globalBrowser = browser;
  globalContext = context;
  return { browser, context };
}

export async function cleanupBrowser() {
  if (globalContext) {
    try { await globalContext.close(); } catch { /* ignore */ }
    globalContext = null;
  }
  if (globalBrowser) {
    try { await globalBrowser.close(); } catch { /* ignore */ }
    globalBrowser = null;
  }
}

// ─── Utility ────────────────────────────────────────────────────────────

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toISOString(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

function getDateRangeTimestamps(range: DateRange): { startTs: number; endTs: number } {
  return {
    startTs: new Date(range.start_date + 'T00:00:00Z').getTime() / 1000,
    endTs: new Date(range.end_date + 'T23:59:59Z').getTime() / 1000,
  };
}

function extractUsername(channelUrl: string): string {
  const match = channelUrl.match(/tiktok\.com\/@([^/?#]+)/);
  return match ? match[1] : channelUrl.replace(/^@/, '');
}

// ─── Intercept TikTok API Responses ─────────────────────────────────────

/**
 * Set up response interceptor BEFORE page navigation.
 * The listener stays active and collects ALL TikTok API JSON responses
 * into a shared Map for later processing.
 */
function setupResponseInterceptor(page: Page): Map<string, unknown> {
  const capturedResponses: Map<string, unknown> = new Map();

  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('tiktok.com/api/')) return;
    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;

    // Fire-and-forget: parse JSON in background
    response.json().then((json: unknown) => {
      capturedResponses.set(url, json);
    }).catch(() => {
      // Not parseable JSON — skip
    });
  });

  return capturedResponses;
}

// ─── Extract Initial State from Page SSR ────────────────────────────────

async function extractInitialState<T>(page: Page): Promise<T | null> {
  try {
    const state = await page.evaluate(() => {
      const universalData = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (universalData?.textContent) {
        try { return JSON.parse(universalData.textContent); } catch { /* ignore */ }
      }
      const sigiData = document.getElementById('__SIGI_INITIAL_STATE__');
      if (sigiData?.textContent) {
        try { return JSON.parse(sigiData.textContent); } catch { /* ignore */ }
      }
      const win = window as unknown as Record<string, unknown>;
      if (win.__INITIAL_STATE__) return win.__INITIAL_STATE__;
      return null;
    });
    return state as T | null;
  } catch {
    return null;
  }
}

// ─── Normalize raw video from various sources ───────────────────────────

function normalizeRawVideoItem(obj: Record<string, unknown>): RawVideoItem | null {
  if (!obj || typeof obj !== 'object') return null;
  if (!obj.id && !obj.video_id && !obj.ID) return null;

  return {
    id: String(obj.id || obj.video_id || obj.ID || ''),
    video_id: String(obj.id || obj.video_id || obj.ID || ''),
    desc: String(obj.desc || obj.description || obj.Desc || ''),
    createTime: Number(obj.createTime || obj.create_time || obj.CreateTime || 0),
    create_time: Number(obj.createTime || obj.create_time || obj.CreateTime || 0),
    duration: Number(obj.duration || obj.Duration || 0),
    cover: String(obj.cover || obj.Cover || obj.originCover || ''),
    originCover: String(obj.originCover || obj.cover || ''),
    dynamicCover: String(obj.dynamicCover || ''),
    play: String(obj.play || obj.Play || ''),
    download: String(obj.download || obj.Download || ''),
    video: obj.video ? {
      cover: String((obj.video as Record<string, unknown>).cover || ''),
      playAddr: String((obj.video as Record<string, unknown>).playAddr || ''),
      downloadAddr: String((obj.video as Record<string, unknown>).downloadAddr || ''),
      duration: Number((obj.video as Record<string, unknown>).duration || 0),
    } : undefined,
    music: obj.music ? {
      id: String((obj.music as Record<string, unknown>).id || ''),
      title: String((obj.music as Record<string, unknown>).title || ''),
      author: String((obj.music as Record<string, unknown>).author || (obj.music as Record<string, unknown>).authorName || ''),
    } : undefined,
    author: obj.author ? {
      id: String((obj.author as Record<string, unknown>).id || ''),
      uniqueId: String((obj.author as Record<string, unknown>).uniqueId || ''),
      nickname: String((obj.author as Record<string, unknown>).nickname || ''),
    } : undefined,
    stats: obj.stats ? {
      playCount: Number((obj.stats as Record<string, unknown>).playCount || (obj.stats as Record<string, unknown>).play_count || 0),
      diggCount: Number((obj.stats as Record<string, unknown>).diggCount || (obj.stats as Record<string, unknown>).digg_count || 0),
      commentCount: Number((obj.stats as Record<string, unknown>).commentCount || (obj.stats as Record<string, unknown>).comment_count || 0),
      shareCount: Number((obj.stats as Record<string, unknown>).shareCount || (obj.stats as Record<string, unknown>).share_count || 0),
      collectCount: Number((obj.stats as Record<string, unknown>).collectCount || (obj.stats as Record<string, unknown>).collect_count || 0),
    } : undefined,
    challenges: Array.isArray(obj.challenges) ? obj.challenges as RawVideoItem['challenges'] : undefined,
    textExtra: Array.isArray(obj.textExtra) ? obj.textExtra : undefined,
    hashtags: Array.isArray(obj.hashtags) ? obj.hashtags.map(String) : undefined,
  };
}

// ─── Parse Single Video Item ────────────────────────────────────────────

export function parseVideoItem(raw: RawVideoItem): VideoItem {
  const videoId = raw.id || raw.video_id || '';

  const hashtags: string[] = [];
  if (raw.challenges) {
    for (const c of raw.challenges) {
      if (c.title) hashtags.push(c.title);
    }
  }
  if (raw.textExtra) {
    for (const te of raw.textExtra) {
      if (te.hashtagName && !hashtags.includes(te.hashtagName)) {
        hashtags.push(te.hashtagName);
      }
    }
  }
  if (raw.hashtags) {
    for (const h of raw.hashtags) {
      if (!hashtags.includes(h)) hashtags.push(h);
    }
  }

  const stats: VideoStats = {
    play_count: raw.stats?.playCount ?? raw.stats?.play_count ?? 0,
    like_count: raw.stats?.diggCount ?? raw.stats?.digg_count ?? 0,
    comment_count: raw.stats?.commentCount ?? raw.stats?.comment_count ?? 0,
    share_count: raw.stats?.shareCount ?? raw.stats?.share_count ?? 0,
    collect_count: raw.stats?.collectCount ?? raw.stats?.collect_count ?? 0,
  };

  const music: MusicInfo = {
    id: raw.music?.id || '',
    title: raw.music?.title || '',
    author: raw.music?.authorName || raw.music?.author || '',
  };

  const videoUrl = raw.download || raw.video?.downloadAddr || raw.play || raw.video?.playAddr || '';

  return {
    video_id: videoId,
    description: raw.desc || '',
    create_time: toISOString(raw.createTime ?? raw.create_time ?? 0),
    url: videoId ? `${TT_BASE_URL_FALLBACK}/@${raw.author?.uniqueId || 'unknown'}/video/${videoId}` : '',
    duration: raw.duration ?? raw.video?.duration ?? 0,
    cover_url: raw.cover || raw.originCover || raw.video?.cover || raw.video?.coverMedium || raw.dynamicCover || '',
    video_url: videoUrl,
    music,
    stats,
    hashtags,
  };
}

// ─── Crawl Single User ──────────────────────────────────────────────────

export async function crawlUserVideos(
  page: Page,
  username: string,
  dateRange: DateRange,
  scrollOverride?: { min: number; max: number },
): Promise<UserCrawlResult> {
  const cleanUsername = username.replace(/^@/, '');
  const ttBaseUrl = await getTtBaseUrl();
  const profileUrl = `${ttBaseUrl}/@${cleanUsername}`;
  const { startTs, endTs } = getDateRangeTimestamps(dateRange);

  let consecutiveErrors = 0;
  let userDetail: { id?: string; uniqueId?: string; nickname?: string; followerCount?: number } | null = null;
  const allRawVideos: RawVideoItem[] = [];
  let hasMore = true;

  // Set up response interceptor BEFORE navigation (critical!)
  const capturedResponses = setupResponseInterceptor(page);

  // Navigate to profile
  console.log(`[tiktok:${cleanUsername}] Navigating to ${profileUrl}`);
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ─── Captcha / Challenge Detection ─────────────────────────────────
  // Detect captcha by checking for TikTok's challenge container element
  const hasCaptcha = await page.evaluate(() => {
    // Check for TikTok's specific captcha/challenge container
    const challengeEl = document.querySelector(
      'div[class*="captcha"], div[class*="challenge"], div[class*="verify"], ' +
      'iframe[src*="captcha"], iframe[src*="challenge"], ' +
      '#captcha-container, .captcha-container, [data-e2e*="captcha"]'
    );
    if (challengeEl) return true;
    // Also check if URL path is on a challenge page (not the profile)
    const path = window.location.pathname.toLowerCase();
    if (path.includes('challenge') || path.includes('captcha')) return true;
    return false;
  });

  if (hasCaptcha) {
    console.log(`[tiktok:${cleanUsername}] ⚠️ CAPTCHA detected! Please solve it in the browser window...`);
    console.log(`[tiktok:${cleanUsername}] Waiting for redirect to profile page...`);

    // Wait for TikTok to redirect back to the actual profile page
    // After captcha, TikTok navigates to the real profile URL
    try {
      await page.waitForFunction(
        (expectedUrl: string) => {
          const current = window.location.href;
          // The profile URL should not contain challenge/captcha
          if (current.includes('challenge') || current.includes('captcha')) return false;
          // And should contain the username
          return current.includes(expectedUrl.replace(/^https?:\/\//, '').split('/')[1]);
        },
        profileUrl,
        { timeout: 120000, polling: 1000 },
      );
      console.log(`[tiktok:${cleanUsername}] ✅ Captcha solved! Redirected to profile.`);
    } catch {
      console.log(`[tiktok:${cleanUsername}] ⏰ Captcha wait timeout, continuing anyway...`);
    }
    // Extra settling time
    await randomDelay(2000, 3000);
  }

  // Wait for the video API response explicitly (after captcha if any)
  console.log(`[tiktok:${cleanUsername}] Waiting for video API response...`);
  try {
    const apiResp = await page.waitForResponse(
      (resp) => {
        const url = resp.url();
        return (
          url.includes('/api/post/item_list/') ||
          url.includes('/api/post/item/list/') ||
          url.includes('/api/feed/profile/') ||
          (url.includes('/api/') && (url.includes('itemList') || url.includes('item_list') || url.includes('user-detail')))
        ) && resp.status() === 200;
      },
      { timeout: 25000 },
    );
    const apiUrl = apiResp.url();
    const json = await apiResp.json();
    capturedResponses.set(apiUrl, json);
    console.log(`[tiktok:${cleanUsername}] ✅ Captured video API: ${apiUrl.substring(0, 80)}`);
  } catch {
    console.log(`[tiktok:${cleanUsername}] Explicit API wait timed out, relying on event capture`);
  }

  // Wait for the post list to render
  console.log(`[tiktok:${cleanUsername}] Waiting for video data...`);
  try {
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('[class*="DivItemContainer"], [class*="video-feed"], [data-e2e*="user-post-item"]');
        return items.length > 0;
      },
      { timeout: 15000 },
    );
  } catch {
    // timeout is fine
  }
  // Wait extra time for API responses to fully arrive
  await randomDelay(4000, 6000);

  console.log(`[tiktok:${cleanUsername}] Checking captured API responses (${capturedResponses.size} total)`);

  // Try to extract data from SSR state
  const ssrState = await extractInitialState<Record<string, unknown>>(page);
  if (ssrState) {
    const defaultScope = ssrState.__DEFAULT_SCOPE__ as Record<string, unknown> | undefined;
    if (defaultScope) {
      const userDetailData = defaultScope['user-detail'] as Record<string, unknown> | undefined;
      if (userDetailData) {
        const userInfo = userDetailData.userInfo as Record<string, unknown> | undefined;
        if (userInfo) {
          const user = userInfo.user as Record<string, unknown> | undefined;
          const stats = userInfo.stats as Record<string, unknown> | undefined;
          if (user) {
            userDetail = {
              id: String(user.id || ''),
              uniqueId: String(user.uniqueId || user.unique_id || cleanUsername),
              nickname: String(user.nickname || user.nick_name || cleanUsername),
              followerCount: Number(stats?.followerCount ?? stats?.follower_count ?? user.followerCount ?? 0),
            };
          }
        }

        const itemList = userDetailData.itemList as unknown[] | undefined;
        if (Array.isArray(itemList) && itemList.length > 0) {
          for (const item of itemList) {
            const raw = normalizeRawVideoItem(item as Record<string, unknown>);
            if (raw) allRawVideos.push(raw);
          }
          const total = userDetailData.total as number | undefined;
          console.log(`[tiktok:${cleanUsername}] Found ${allRawVideos.length} videos in SSR data${total ? ` (total: ${total})` : ''}`);
          hasMore = false;
        }
      }
    }
  }

  // Extract user detail from intercepted responses
  for (const [, data] of capturedResponses.entries()) {
    const resp = data as Record<string, unknown>;
    const respData = resp.data as Record<string, unknown> | undefined;
    if (respData?.user) {
      userDetail = respData.user as { id?: string; uniqueId?: string; nickname?: string; followerCount?: number };
      console.log(`[tiktok:${cleanUsername}] Found user detail from API response`);
      break;
    }
  }

  // Process video data from intercepted API responses
  for (const [, data] of capturedResponses.entries()) {
    const resp = data as Record<string, unknown>;
    if (!resp) continue;

    const itemSources: unknown[] = [
      ...(Array.isArray(resp.itemList) ? resp.itemList : []),
      ...(Array.isArray(resp.item_list) ? resp.item_list : []),
      ...(Array.isArray((resp.data as Record<string, unknown> | undefined)?.itemList)
        ? (resp.data as Record<string, unknown>).itemList as unknown[]
        : []),
    ];

    for (const item of itemSources) {
      const raw = normalizeRawVideoItem(item as Record<string, unknown>);
      if (raw) allRawVideos.push(raw);
    }

    if (itemSources.length > 0) {
      const hasMoreField = (resp.hasMore ?? resp.has_more ?? false) as boolean;
      hasMore = hasMoreField;
      console.log(`[tiktok:${cleanUsername}] Found ${itemSources.length} videos from API, hasMore=${hasMore}`);
    }
  }

  // Fallback for nickname
  if (!userDetail || !userDetail.nickname) {
    try {
      const metaNick = await page.evaluate(() => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        return meta?.content || null;
      });
      if (metaNick) userDetail = { ...userDetail, nickname: metaNick };
    } catch { /* ignore */ }
  }

  const userId = userDetail?.id || '';
  const nickname = userDetail?.nickname || cleanUsername;
  const followerCount = userDetail?.followerCount ?? 0;

  console.log(`[tiktok:${cleanUsername}] User: ${nickname} (ID: ${userId || 'unknown'})`);

  // Scroll and collect videos (only if SSR extraction didn't find anything)
  if (allRawVideos.length === 0) {
    let pageNum = 0;
    const knownResponseKeys = new Set(capturedResponses.keys());
    while (hasMore) {
      pageNum++;
      console.log(`[tiktok:${cleanUsername}] Scroll round ${pageNum}`);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Explicitly wait for a new API response after scrolling
      const scrollApiWait = page.waitForResponse(
        (resp) => {
          const url = resp.url();
          return (
            url.includes('/api/post/item_list/') ||
            url.includes('/api/feed/profile/') ||
            (url.includes('/api/') && url.includes('itemList'))
          ) && resp.status() === 200;
        },
        { timeout: 10000 },
      );

      const sMin = scrollOverride?.min ?? DEFAULT_BROWSER_CONFIG.scrollDelayMin;
      const sMax = scrollOverride?.max ?? DEFAULT_BROWSER_CONFIG.scrollDelayMax;
      await randomDelay(sMin, sMax);

      // Try to capture the awaited response
      try {
        const apiResp = await scrollApiWait;
        const apiUrl = apiResp.url();
        if (!knownResponseKeys.has(apiUrl)) {
          const json = await apiResp.json();
          capturedResponses.set(apiUrl, json);
          console.log(`[tiktok:${cleanUsername}] Scroll captured API: ${apiUrl.substring(0, 80)}`);
        }
      } catch {
        // No new API response — check capturedResponses for late arrivals
      }

      let foundNewData = false;
      for (const [url, data] of capturedResponses.entries()) {
        if (knownResponseKeys.has(url)) continue; // already processed
        knownResponseKeys.add(url);

        const resp = data as Record<string, unknown>;
        if (!resp) continue;

        const itemSources: unknown[] = [
          ...(Array.isArray(resp.itemList) ? resp.itemList : []),
          ...(Array.isArray(resp.item_list) ? resp.item_list : []),
          ...(Array.isArray((resp.data as Record<string, unknown> | undefined)?.itemList)
            ? (resp.data as Record<string, unknown>).itemList as unknown[]
            : []),
        ];

        if (itemSources.length > 0) {
          foundNewData = true;
          const existingIds = new Set(allRawVideos.map((v) => v.id || v.video_id));
          const newItems = itemSources.filter((v: unknown) => {
            const raw = v as Record<string, unknown>;
            const id = raw.id || raw.video_id;
            return !existingIds.has(String(id));
          });

          if (newItems.length === 0) {
            console.log(`[tiktok:${cleanUsername}] No new videos found — stopping`);
            hasMore = false;
            break;
          }

          for (const item of newItems) {
            const raw = normalizeRawVideoItem(item as Record<string, unknown>);
            if (raw) allRawVideos.push(raw);
          }

          const hasMoreField = (resp.hasMore ?? resp.has_more ?? false) as boolean;
          hasMore = hasMoreField;

          console.log(`[tiktok:${cleanUsername}] Fetched ${allRawVideos.length} total (${newItems.length} new), hasMore=${hasMore}`);

          const timestamps = allRawVideos
            .map((v) => v.createTime ?? v.create_time)
            .filter((t): t is number => t !== undefined);

          if (timestamps.length > 0) {
            const oldestTs = Math.min(...timestamps);
            if (oldestTs < startTs) {
              console.log(`[tiktok:${cleanUsername}] Oldest video (${toISOString(oldestTs)}) is before start_date — stopping early`);
              hasMore = false;
            }
          }

          consecutiveErrors = 0;
          // Process only the first matching response per scroll
          break;
        }
      }

      if (!foundNewData) {
        consecutiveErrors++;
        console.log(`[tiktok:${cleanUsername}] No API response (${consecutiveErrors}/${DEFAULT_BROWSER_CONFIG.consecutiveErrorThreshold})`);

        if (consecutiveErrors >= DEFAULT_BROWSER_CONFIG.consecutiveErrorThreshold) {
          console.log(`[tiktok:${cleanUsername}] Too many consecutive errors — aborting`);
          break;
        }
      }

      if (!hasMore) break;
    }
  }

  // Filter videos by date range
  const filteredVideos = allRawVideos.filter((raw) => {
    const ts = raw.createTime ?? raw.create_time;
    return ts !== undefined && ts >= startTs && ts <= endTs;
  });

  console.log(`[tiktok:${cleanUsername}] ${allRawVideos.length} total fetched, ${filteredVideos.length} in date range`);

  const videos: VideoItem[] = filteredVideos.map(parseVideoItem);

  return {
    username: `@${cleanUsername}`,
    user_id: userId,
    nickname,
    follower_count: followerCount,
    crawl_date: new Date().toISOString(),
    date_range: { ...dateRange },
    total_videos: videos.length,
    videos,
  };
}

// ─── High-level API: crawl by channelUrl ────────────────────────────────

export type CrawlOptions = {
  headless?: boolean;
  browserEngine?: 'cloakbrowser' | 'playwright' | 'msedge' | 'api';
  scrollDelayMin?: number;
  scrollDelayMax?: number;
};

export async function crawlTikTokProfile(
  channelUrl: string,
  dateRange?: { start_date?: string; end_date?: string },
  crawlOptions?: CrawlOptions,
): Promise<UserCrawlResult | null> {
  const username = extractUsername(channelUrl);
  if (!username) {
    console.warn(`[tiktok-crawler] Could not extract username from URL: ${channelUrl}`);
    return null;
  }

  const effectiveRange: DateRange = {
    start_date: dateRange?.start_date || '2020-01-01',
    end_date: dateRange?.end_date || new Date().toISOString().split('T')[0],
  };

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= DEFAULT_BROWSER_CONFIG.maxRetries; attempt++) {
    console.log(`[tiktok-crawler] Crawling @${username} (attempt ${attempt}/${DEFAULT_BROWSER_CONFIG.maxRetries})`);

    try {
      const { context } = await getOrCreateBrowser(crawlOptions);
      const page = await context.newPage();
      const scrollOverride = crawlOptions?.scrollDelayMin || crawlOptions?.scrollDelayMax
        ? { min: crawlOptions.scrollDelayMin ?? DEFAULT_BROWSER_CONFIG.scrollDelayMin, max: crawlOptions.scrollDelayMax ?? DEFAULT_BROWSER_CONFIG.scrollDelayMax }
        : undefined;
      const result = await crawlUserVideos(page, username, effectiveRange, scrollOverride);
      await page.close();
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[tiktok-crawler] Attempt ${attempt} failed for @${username}: ${lastError}`);

      if (attempt < DEFAULT_BROWSER_CONFIG.maxRetries) {
        await randomDelay(3000, 6000);
        // Clean up browser on error to get fresh state
        await cleanupBrowser();
      }
    }
  }

  console.error(`[tiktok-crawler] All attempts failed for @${username}: ${lastError}`);
  return null;
}
