import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import type {
  ApifyProviderConfig,
  CrawlProvider,
  FacebookBrowserEngine,
  FacebookCrawlConfig,
  PlaywrightProviderConfig,
  PlatformCrawlConfig,
  PublicSettings,
  SocialCrawlerProviderConfig,
  TikTokBrowserEngine,
  TikTokCrawlConfig,
} from "@/lib/types";
import {
  DEFAULT_APIFY_CONFIG,
  DEFAULT_PLAYWRIGHT_CONFIG,
  DEFAULT_SOCIAL_CRAWLER_CONFIG,
} from "@/lib/types";

// ─── Legacy Setting keys (giữ cho backward compat) ─────────────────────────
const settingKeys = [
  "youtubeApiKey",
  "youtubeApiBaseUrl",
  "tiktokProviderUrl",
  "tiktokProviderToken",
  "tiktokCrawlHeadless",
  "tiktokCrawlBrowser",
  "tiktokCrawlScrollDelayMin",
  "tiktokCrawlScrollDelayMax",
  "tiktokBaseUrl",
  "metaGraphToken",
  "facebookEmail",
  "facebookPassword",
  "facebookCrawlHeadless",
  "facebookCrawlBrowser",
  "facebookCrawlScrollDelayMin",
  "facebookCrawlScrollDelayMax",
  "facebookBaseUrl",
  "facebookLoginUrl",
  "youtubeTranscriptAutoTranslate",
  "youtubeTranscriptFormat",
] as const;

export type SettingKey = (typeof settingKeys)[number];

// ─── Legacy parsers (kept for backward compat) ─────────────────────────────

function parseTikTokCrawlConfig(settings: Map<string, string>): TikTokCrawlConfig {
  const headlessRaw = settings.get("tiktokCrawlHeadless");
  const browserRaw = settings.get("tiktokCrawlBrowser");
  const scrollMinRaw = settings.get("tiktokCrawlScrollDelayMin");
  const scrollMaxRaw = settings.get("tiktokCrawlScrollDelayMax");
  return {
    headless: headlessRaw === undefined ? true : headlessRaw !== "false",
    browserEngine: (browserRaw as TikTokBrowserEngine) || "playwright",
    scrollDelayMin: scrollMinRaw ? parseInt(scrollMinRaw, 10) : undefined,
    scrollDelayMax: scrollMaxRaw ? parseInt(scrollMaxRaw, 10) : undefined,
  };
}

function parseFacebookCrawlConfig(settings: Map<string, string>): FacebookCrawlConfig {
  const headlessRaw = settings.get("facebookCrawlHeadless");
  const browserRaw = settings.get("facebookCrawlBrowser");
  const scrollMinRaw = settings.get("facebookCrawlScrollDelayMin");
  const scrollMaxRaw = settings.get("facebookCrawlScrollDelayMax");
  return {
    headless: headlessRaw === undefined ? true : headlessRaw !== "false",
    browserEngine: (browserRaw as FacebookBrowserEngine) || "playwright",
    scrollDelayMin: scrollMinRaw ? parseInt(scrollMinRaw, 10) : undefined,
    scrollDelayMax: scrollMaxRaw ? parseInt(scrollMaxRaw, 10) : undefined,
  };
}

export async function getSettingsMap() {
  const rows = await prisma.setting.findMany();
  const values = new Map<SettingKey, string>();
  for (const key of settingKeys) {
    values.set(key, "");
  }
  for (const row of rows) {
    if (settingKeys.includes(row.key as SettingKey)) {
      values.set(row.key as SettingKey, row.value);
    }
  }
  return values;
}

// ─── PlatformProviderConfig helpers ────────────────────────────────────────

/**
 * Lấy config provider cho một platform từ DB.
 * Tự động tạo row mặc định nếu chưa có.
 */
export async function getPlatformProviderConfig(
  platform: "facebook" | "tiktok"
): Promise<PlatformCrawlConfig> {
  const row = await prisma.platformProviderConfig.findUnique({
    where: { platform },
  });

  if (!row) {
    return buildDefaultPlatformConfig(platform);
  }

  let playwright: PlaywrightProviderConfig = { ...DEFAULT_PLAYWRIGHT_CONFIG };
  let apify: ApifyProviderConfig = { ...DEFAULT_APIFY_CONFIG };
  let socialCrawler: SocialCrawlerProviderConfig = { ...DEFAULT_SOCIAL_CRAWLER_CONFIG };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowAny = row as Record<string, unknown>;

  try {
    if (row.playwrightConfig && row.playwrightConfig !== "{}") {
      playwright = { ...DEFAULT_PLAYWRIGHT_CONFIG, ...JSON.parse(row.playwrightConfig) };
    }
  } catch { /* fallback to default */ }

  try {
    if (row.apifyConfig && row.apifyConfig !== "{}") {
      apify = { ...DEFAULT_APIFY_CONFIG, ...JSON.parse(row.apifyConfig) };
    }
  } catch { /* fallback to default */ }

  try {
    if (rowAny.socialCrawlerConfig && String(rowAny.socialCrawlerConfig) !== "{}") {
      socialCrawler = { ...DEFAULT_SOCIAL_CRAWLER_CONFIG, ...JSON.parse(String(rowAny.socialCrawlerConfig)) };
    }
  } catch { /* fallback to default */ }

  return {
    activeProvider: (row.activeProvider as CrawlProvider) ?? "playwright",
    playwright,
    apify,
    socialCrawler,
  };
}

/**
 * Cập nhật provider config cho một platform.
 * Gọi khi user save settings từ UI.
 */
export async function updatePlatformProviderConfig(
  platform: "facebook" | "tiktok",
  update: {
    activeProvider?: CrawlProvider;
    playwright?: Partial<PlaywrightProviderConfig>;
    apify?: Partial<ApifyProviderConfig>;
    socialCrawler?: Partial<SocialCrawlerProviderConfig>;
  }
): Promise<PlatformCrawlConfig> {
  const current = await getPlatformProviderConfig(platform);

  const newPlaywright = update.playwright
    ? { ...current.playwright, ...update.playwright }
    : current.playwright;

  const newApify = update.apify
    ? { ...current.apify, ...update.apify }
    : current.apify;

  const newSocialCrawler = update.socialCrawler
    ? { ...current.socialCrawler, ...update.socialCrawler }
    : current.socialCrawler;

  const newActiveProvider = update.activeProvider ?? current.activeProvider;

  await prisma.platformProviderConfig.upsert({
    where: { platform },
    create: {
      platform,
      activeProvider: newActiveProvider,
      playwrightConfig: JSON.stringify(newPlaywright),
      apifyConfig: JSON.stringify(newApify),
      socialCrawlerConfig: JSON.stringify(newSocialCrawler),
    },
    update: {
      activeProvider: newActiveProvider,
      playwrightConfig: JSON.stringify(newPlaywright),
      apifyConfig: JSON.stringify(newApify),
      socialCrawlerConfig: JSON.stringify(newSocialCrawler),
    },
  });

  return {
    activeProvider: newActiveProvider,
    playwright: newPlaywright,
    apify: newApify,
    socialCrawler: newSocialCrawler,
  };
}

function buildDefaultPlatformConfig(platform: "facebook" | "tiktok"): PlatformCrawlConfig {
  return {
    activeProvider: "playwright",
    playwright: {
      ...DEFAULT_PLAYWRIGHT_CONFIG,
      browserEngine: platform === "tiktok" ? "cloakbrowser" : "playwright",
    },
    apify: {
      ...DEFAULT_APIFY_CONFIG,
      actorId:
        platform === "tiktok"
          ? "clockworks/tiktok-scraper"
          : "apify/facebook-posts-scraper",
    },
    socialCrawler: {
      ...DEFAULT_SOCIAL_CRAWLER_CONFIG,
    },
  };
}

// ─── Public Settings ────────────────────────────────────────────────────────

export async function getPublicSettings(): Promise<PublicSettings> {
  const [settings, tiktokProvider, facebookProvider] = await Promise.all([
    getSettingsMap(),
    getPlatformProviderConfig("tiktok"),
    getPlatformProviderConfig("facebook"),
  ]);

  const configYoutubeKey = await getConfig("youtube_api_key");
  const storedYoutubeApiKey = settings.get("youtubeApiKey")?.trim();
  const fbEmail = settings.get("facebookEmail")?.trim() || (await getConfig("fb_email")) || "";
  const fbPassword = settings.get("facebookPassword")?.trim() || (await getConfig("fb_password")) || "";

  // ─── Social Crawler: load từ encrypted Setting table ────────
  const scApiUrl = await getConfig("social_crawler_api_url");
  const scApiKey = await getConfig("social_crawler_api_key");
  const scMaxItems = await getConfig("social_crawler_max_items");
  const scTimeoutSecs = await getConfig("social_crawler_timeout_secs");

  // Merge encrypted values into tiktokProvider.socialCrawler (override PlatformProviderConfig)
  if (scApiUrl || scApiKey) {
    tiktokProvider.socialCrawler = {
      ...tiktokProvider.socialCrawler,
      ...(scApiUrl ? { apiUrl: scApiUrl } : {}),
      ...(scApiKey ? { apiKey: scApiKey } : {}),
      ...(scMaxItems ? { maxItems: parseInt(scMaxItems, 10) } : {}),
      ...(scTimeoutSecs ? { timeoutSecs: parseInt(scTimeoutSecs, 10) } : {}),
    };
  }

  // Legacy TikTok provider (backward compat với tiktokCrawler.ts)
  const legacyCrawl = parseTikTokCrawlConfig(settings as Map<string, string>);
  const legacyFbCrawl = parseFacebookCrawlConfig(settings as Map<string, string>);

  return {
    hasYoutubeApiKey: Boolean(configYoutubeKey || storedYoutubeApiKey),
    youtubeApiKeySource: configYoutubeKey ? "database" : storedYoutubeApiKey ? "database" : undefined,
    youtubeApiBaseUrl: settings.get("youtubeApiBaseUrl") || undefined,
    hasMetaGraphToken: Boolean(settings.get("metaGraphToken")),
    hasFacebookCredentials: Boolean(fbEmail && fbPassword),
    facebookEmail: fbEmail || undefined,
    facebookPassword: fbPassword || undefined,
    facebookBaseUrl: settings.get("facebookBaseUrl") || undefined,
    facebookLoginUrl: settings.get("facebookLoginUrl") || undefined,
    youtubeTranscriptAutoTranslate: settings.get("youtubeTranscriptAutoTranslate") !== "false",
    youtubeTranscriptFormat: (settings.get("youtubeTranscriptFormat") as "plain_text" | "timestamps") || "plain_text",

    // New provider configs
    tiktokProvider,
    facebookProvider,

    // Legacy fields (backward compat)
    hasTikTokProvider: Boolean(settings.get("tiktokProviderUrl") && settings.get("tiktokProviderToken")),
    tiktokProviderUrl: settings.get("tiktokProviderUrl") || undefined,
    tiktokBaseUrl: settings.get("tiktokBaseUrl") || undefined,
    tiktokCrawl: legacyCrawl,
    facebookCrawl: legacyFbCrawl,
  };
}

export async function getServerYoutubeApiKey() {
  const configKey = await getConfig("youtube_api_key");
  if (configKey) return configKey;
  const row = await prisma.setting.findUnique({ where: { key: "youtubeApiKey" } });
  return row?.value.trim() || "";
}

/**
 * Lấy giá trị setting từ DB, fallback về giá trị mặc định nếu chưa có.
 */
export async function getSettingWithFallback(key: SettingKey, fallback: string): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row?.value?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function updateSettings(input: Partial<Record<SettingKey, string | boolean>>) {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  await Promise.all(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) }
      })
    )
  );
  return getPublicSettings();
}

export async function getServerFacebookCredentials() {
  const map = await getSettingsMap();
  const email = map.get("facebookEmail")?.trim() || (await getConfig("fb_email")) || "";
  const password = map.get("facebookPassword")?.trim() || (await getConfig("fb_password")) || "";
  return { email, password };
}
