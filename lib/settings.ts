import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { decrypt, encrypt } from "@/lib/crypto";
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

const isMaskedConfigValue = (value: string | undefined): value is string =>
  typeof value === "string" && value.includes("•••");

const ENCRYPTED_STRING_REGEX = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/;
const isEncryptedString = (value: unknown): value is string =>
  typeof value === "string" && ENCRYPTED_STRING_REGEX.test(value);

function decryptSecretValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  if (!isEncryptedString(value)) return value;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function encryptSecretValue(value: string): string {
  if (!value) return value;
  if (isEncryptedString(value)) return value;
  return encrypt(value);
}

function decryptProviderSecrets(config: PlatformCrawlConfig): PlatformCrawlConfig {
  return {
    ...config,
    apify: {
      ...config.apify,
      apiToken: decryptSecretValue(config.apify.apiToken),
    },
    socialCrawler: {
      ...config.socialCrawler,
      apiUrl: decryptSecretValue(config.socialCrawler.apiUrl),
      apiKey: decryptSecretValue(config.socialCrawler.apiKey),
    },
  };
}

function encryptProviderSecrets(config: PlatformCrawlConfig): PlatformCrawlConfig {
  return {
    ...config,
    apify: {
      ...config.apify,
      apiToken: encryptSecretValue(config.apify.apiToken),
    },
    socialCrawler: {
      ...config.socialCrawler,
      apiUrl: encryptSecretValue(config.socialCrawler.apiUrl),
      apiKey: encryptSecretValue(config.socialCrawler.apiKey),
    },
  };
}

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

  const config = {
    activeProvider: (row.activeProvider as CrawlProvider) ?? "playwright",
    playwright,
    apify,
    socialCrawler,
  };

  return decryptProviderSecrets(config);
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
  const updatedConfig = encryptProviderSecrets({
    activeProvider: newActiveProvider,
    playwright: newPlaywright,
    apify: newApify,
    socialCrawler: newSocialCrawler,
  });

  await prisma.platformProviderConfig.upsert({
    where: { platform },
    create: {
      platform,
      activeProvider: newActiveProvider,
      playwrightConfig: JSON.stringify(newPlaywright),
      apifyConfig: JSON.stringify(updatedConfig.apify),
      socialCrawlerConfig: JSON.stringify(updatedConfig.socialCrawler),
    },
    update: {
      activeProvider: newActiveProvider,
      playwrightConfig: JSON.stringify(newPlaywright),
      apifyConfig: JSON.stringify(updatedConfig.apify),
      socialCrawlerConfig: JSON.stringify(updatedConfig.socialCrawler),
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

  // Backward compat: read legacy Social Crawler config from old config storage if present.
  const legacyKeys = [
    "config_social_crawler_api_url_tiktok",
    "config_social_crawler_api_key_tiktok",
    "config_social_crawler_api_url_facebook",
    "config_social_crawler_api_key_facebook",
    "config_social_crawler_max_items",
    "config_social_crawler_timeout_secs",
    "config_social_crawler_api_url",
    "config_social_crawler_api_key",
  ];

  const legacyRows = await prisma.setting.findMany({ where: { key: { in: legacyKeys } } });
  const legacyMap: Record<string, string> = {};
  for (const row of legacyRows) {
    try {
      legacyMap[row.key] = decrypt(row.value);
    } catch {
      legacyMap[row.key] = row.value;
    }
  }

  const legacyUrlTiktok = legacyMap["config_social_crawler_api_url_tiktok"]
    ?? legacyMap["config_social_crawler_api_url"];
  const legacyKeyTiktok = legacyMap["config_social_crawler_api_key_tiktok"]
    ?? legacyMap["config_social_crawler_api_key"];
  const legacyUrlFacebook = legacyMap["config_social_crawler_api_url_facebook"]
    ?? legacyMap["config_social_crawler_api_url"];
  const legacyKeyFacebook = legacyMap["config_social_crawler_api_key_facebook"]
    ?? legacyMap["config_social_crawler_api_key"];
  const legacyMaxItems = legacyMap["config_social_crawler_max_items"];
  const legacyTimeoutSecs = legacyMap["config_social_crawler_timeout_secs"];

  const resolveLegacySocialCrawler = (platform: "facebook" | "tiktok") => {
    const platformUrlRaw = platform === "facebook" ? legacyUrlFacebook : legacyUrlTiktok;
    const platformKeyRaw = platform === "facebook" ? legacyKeyFacebook : legacyKeyTiktok;
    const url = isMaskedConfigValue(platformUrlRaw) ? undefined : platformUrlRaw;
    const key = isMaskedConfigValue(platformKeyRaw) ? undefined : platformKeyRaw;
    return { url, key };
  };

  const mergeLegacySocialCrawler = (
    config: SocialCrawlerProviderConfig,
    legacy: { url?: string; key?: string }
  ): SocialCrawlerProviderConfig => ({
    ...config,
    apiUrl: config.apiUrl || legacy.url || config.apiUrl,
    apiKey: config.apiKey || legacy.key || config.apiKey,
    ...(legacyMaxItems ? { maxItems: parseInt(legacyMaxItems, 10) } : {}),
    ...(legacyTimeoutSecs ? { timeoutSecs: parseInt(legacyTimeoutSecs, 10) } : {}),
  });

  const tiktokLegacy = resolveLegacySocialCrawler("tiktok");
  const facebookLegacy = resolveLegacySocialCrawler("facebook");

  tiktokProvider.socialCrawler = mergeLegacySocialCrawler(tiktokProvider.socialCrawler, tiktokLegacy);
  facebookProvider.socialCrawler = mergeLegacySocialCrawler(facebookProvider.socialCrawler, facebookLegacy);

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
