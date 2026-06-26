export type Platform = "youtube" | "tiktok" | "facebook";
export type SourceType = "trong_nuoc" | "nuoc_ngoai";
export type SortBy = "engagement" | "views" | "comments" | "newest";

export type ClassifiedPost = {
  contentPillar: string;
  promotionType: string;
  toneOfVoice: string;
  hookType: string;
  format: string;
  mainTopic: string;
};

export type RawPostInput = {
  competitorId?: string;
  platform: Platform;
  postUrl: string;
  title: string;
  caption: string;
  publishedAt: Date;
  thumbnailUrl?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  format?: string;
  transcript?: string;
};

export type CompetitorSeed = {
  name: string;
  platform: Platform;
  source: SourceType;
  segmentation?: string;
  category: string;
  topicDescription?: string;
  channelUrl: string;
  avatarUrl?: string;
};

// ─── Provider Types ────────────────────────────────────────────────────────
/**
 * Loại provider crawl được hỗ trợ.
 * Có thể mở rộng thêm provider mới mà không cần sửa adapter core.
 */
export type CrawlProvider = "playwright" | "apify" | "social-crawler";

/** Config dành riêng cho Playwright/CloakBrowser provider */
export type PlaywrightProviderConfig = {
  browserEngine: "playwright" | "cloakbrowser" | "msedge";
  headless: boolean;
  scrollDelayMin: number;
  scrollDelayMax: number;
};

/**
 * Config dành riêng cho Apify provider.
 * actorId được configure trực tiếp từ UI → không cần sửa code khi đổi actor.
 * Ví dụ: "clockworks/tiktok-scraper", "apify/facebook-posts-scraper"
 */
export type ApifyProviderConfig = {
  apiToken: string;      // Apify API token (encrypted ở DB)
  actorId: string;       // Actor ID cho Profile/Page, e.g. "apify/facebook-posts-scraper"
  groupActorId: string;  // Actor ID cho Group, e.g. "apify/facebook-groups-scraper"
  maxItems: number;      // Số item tối đa cần fetch
  timeoutSecs: number;   // Timeout cho actor run (giây), default 120
  memoryMbytes: number;  // RAM cho actor run (MB), default 1024
};

/**
 * Config dành riêng cho Social Crawler third-party service.
 * Endpoint: https://social-crawler.public.rke.crawl.tmtco.org
 *
 * Các field facebook* chỉ áp dụng cho Facebook crawl (POST /crawl/facebook),
 * TikTok sẽ bỏ qua các field này.
 */
export type SocialCrawlerProviderConfig = {
  apiUrl: string;       // Base URL của social-crawler service
  apiKey: string;       // API key (encrypted ở DB)
  maxItems: number;     // Số item tối đa cần fetch
  timeoutSecs: number;  // Timeout cho request (giây), default 120

  // ── Facebook-specific crawl params (optional) ──────────────────────
  /** Số bài viết Facebook tối đa cần thu thập (default 50) */
  facebookMaxPosts?: number;

  // Scroll / Anti-ban config
  scrollDelayMin?: number;      // Delay chính tối thiểu sau mỗi scroll (ms), default 5000
  scrollDelayMax?: number;      // Delay chính tối đa sau mỗi scroll (ms), default 9000
  scrollStepsMin?: number;      // Số lần PageDown tối thiểu mỗi chu kỳ, default 3
  scrollStepsMax?: number;      // Số lần PageDown tối đa mỗi chu kỳ, default 5
  interStepDelayMin?: number;   // Delay tối thiểu giữa các PageDown (ms), default 400
  interStepDelayMax?: number;   // Delay tối đa giữa các PageDown (ms), default 800
  maxScrolls?: number;          // Số chu kỳ scroll tối đa, default 15
  staleLimit?: number;          // Ngưỡng stale — số lần scroll ko có post mới thì dừng, default 4

  // Human simulation config
  humanScrollChance?: number;   // Xác suất scroll phụ (0.0–1.0), default 0.7
  humanScrollUpChance?: number; // Xác suất cuộn lên (0.0–1.0), default 0.3
};

/** Aggregated config cho một platform — gồm active provider + config của từng provider */
export type PlatformCrawlConfig = {
  activeProvider: CrawlProvider;
  playwright: PlaywrightProviderConfig;
  apify: ApifyProviderConfig;
  socialCrawler: SocialCrawlerProviderConfig;
};

// ─── Default configs ────────────────────────────────────────────────────────
export const DEFAULT_PLAYWRIGHT_CONFIG: PlaywrightProviderConfig = {
  browserEngine: "playwright",
  headless: true,
  scrollDelayMin: 2000,
  scrollDelayMax: 4000,
};

export const DEFAULT_APIFY_CONFIG: ApifyProviderConfig = {
  apiToken: "",
  actorId: "",
  groupActorId: "",
  maxItems: 50,
  timeoutSecs: 120,
  memoryMbytes: 1024,
};

export const DEFAULT_SOCIAL_CRAWLER_CONFIG: SocialCrawlerProviderConfig = {
  apiUrl: "https://social-crawler.public.rke.crawl.tmtco.org",
  apiKey: "",
  maxItems: 50,
  timeoutSecs: 120,
  // Facebook defaults
  facebookMaxPosts: 50,
  scrollDelayMin: 5000,
  scrollDelayMax: 9000,
  scrollStepsMin: 3,
  scrollStepsMax: 5,
  interStepDelayMin: 400,
  interStepDelayMax: 800,
  maxScrolls: 15,
  staleLimit: 4,
  humanScrollChance: 0.7,
  humanScrollUpChance: 0.3,
};

export const DEFAULT_PLATFORM_CRAWL_CONFIG: PlatformCrawlConfig = {
  activeProvider: "playwright",
  playwright: DEFAULT_PLAYWRIGHT_CONFIG,
  apify: DEFAULT_APIFY_CONFIG,
  socialCrawler: DEFAULT_SOCIAL_CRAWLER_CONFIG,
};

// ─── Legacy types (backward compat) ───────────────────────────────────────
/** @deprecated Dùng PlaywrightProviderConfig.browserEngine thay thế */
export type TikTokBrowserEngine = "cloakbrowser" | "playwright" | "msedge" | "api";

/** @deprecated Dùng PlaywrightProviderConfig thay thế */
export type TikTokCrawlConfig = {
  headless: boolean;
  browserEngine: TikTokBrowserEngine;
  scrollDelayMin?: number;
  scrollDelayMax?: number;
};

/** @deprecated Dùng PlaywrightProviderConfig.browserEngine thay thế */
export type FacebookBrowserEngine = "playwright" | "msedge" | "cloakbrowser";

/** @deprecated Dùng PlaywrightProviderConfig thay thế */
export type FacebookCrawlConfig = {
  headless: boolean;
  browserEngine: FacebookBrowserEngine;
  scrollDelayMin?: number;
  scrollDelayMax?: number;
};

// ─── Public Settings ───────────────────────────────────────────────────────
export type PublicSettings = {
  hasYoutubeApiKey: boolean;
  youtubeApiKeySource?: "env" | "database";
  youtubeApiBaseUrl?: string;
  hasMetaGraphToken: boolean;
  hasGoogleDocsConnection?: boolean;
  youtubeTranscriptAutoTranslate?: boolean;
  youtubeTranscriptFormat?: "plain_text" | "timestamps";

  // Facebook credentials (Playwright fallback)
  hasFacebookCredentials: boolean;
  facebookEmail?: string;
  facebookPassword?: string;
  facebookBaseUrl?: string;
  facebookLoginUrl?: string;

  // Per-platform provider config (new architecture)
  tiktokProvider: PlatformCrawlConfig;
  facebookProvider: PlatformCrawlConfig;

  // Legacy — kept for backward compat with crawlers that read these
  hasTikTokProvider: boolean;
  tiktokProviderUrl?: string;
  tiktokBaseUrl?: string;
  /** @deprecated */
  tiktokCrawl?: TikTokCrawlConfig;
  /** @deprecated */
  facebookCrawl?: FacebookCrawlConfig;
};

// ─── Analytics & Sync ─────────────────────────────────────────────────────
export type AnalyticsFilters = {
  platform?: Platform | "all";
  days?: number;
  source?: SourceType | "all";
  contentPillar?: string;
  format?: string;
  promotionType?: string;
  sortBy?: SortBy;
};

export type ExportType = "csv" | "json" | "markdown";

export type SyncFilters = {
  platforms: Platform[];
  startDate?: string;
  endDate?: string;
  competitorIds: string[];
  facebookMaxPosts?: number;
};

// ─── Content Generation ────────────────────────────────────────────────────
export type ContentType = "script" | "post" | "carousel" | "caption";
export type GenerationOutputMode = "video" | "post";

export type ContentStatus =
  | "draft"
  | "qa_warning"   // QA gate: low hook score or checklist failures — review before publish
  | "qa_failed"    // QA gate: below minimum threshold — edit required before publish
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export type GenerateContentInput = {
  platform: Platform;
  contentType: ContentType;
  outputMode?: GenerationOutputMode;
  marketContext?: string;
  gapIds?: string[];
  lessonPostIds?: string[];
  customPrompt?: string;
};

export type GenerateBatchInput = {
  entries: Array<{
    platform: Platform;
    contentType: ContentType;
    outputMode?: GenerationOutputMode;
    mainTopic?: string;
    toneOfVoice?: string;
  }>;
  marketContext?: string;
  gapIds?: string[];
  lessonPostIds?: string[];
  count?: number; // Number of variations per entry, default 1
};

export type GenerateContentResponse = {
  id: string;
  platform: Platform;
  contentType: string;
  title: string;
  script: string;
  outputMode?: GenerationOutputMode;
  thumbnailIdea?: string;
  cta?: string;
  toneOfVoice: string;
  mainTopic: string;
  status: ContentStatus;
  createdAt: string;
};

export type GenerateBatchResponse = {
  items: GenerateContentResponse[];
  totalGenerated: number;
  syncRunId?: string;
};

// ─── Content Calendar ──────────────────────────────────────────────────────
export type CalendarEntry = {
  id: string;
  date: Date;
  platform: Platform;
  contentType: string;
  title: string;
  status: ContentStatus;
  mainTopic: string;
  toneOfVoice: string;
};

export type CalendarDay = {
  date: string; // YYYY-MM-DD
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  entries: CalendarEntry[];
};

export type CalendarMonth = {
  year: number;
  month: number;
  weeks: CalendarDay[][];
};

// ─── Predictive Scoring ────────────────────────────────────────────────────
export type PredictiveScore = {
  predictedViews: number;
  predictedEngagement: number;
  viralityProbability: number;
  bestPostingTime: string;
  confidenceLevel: "high" | "medium" | "low";
  suggestedHashtags: string[];
};

// ─── YouTube Publish ───────────────────────────────────────────────────────
export type YouTubePublishStatus = {
  configured: boolean;
  connected: boolean;
  authUrl?: string;
  channels?: Array<{
    id: string;
    name: string;
    thumbnail: string;
  }>;
};

export type YouTubePublishInput = {
  contentId: string;
  title: string;
  description: string;
  privacyStatus: "public" | "unlisted" | "private";
  scheduledAt?: string;
};

// ─── Smart Content Recommendation ──────────────────────────────────────────
export type ContentRecommendation = {
  id: string;
  type: "gap" | "trend" | "improvement" | "experiment";
  priority: "high" | "medium" | "low";
  platform: Platform;
  title: string;
  reason: string;
  expectedImpact: string;
  competitorReference?: string;
  action: string;
};

export type RecommendationReport = {
  recommendations: ContentRecommendation[];
  summary: string;
  generatedAt: string;
};

// ─── Natural Language Query ────────────────────────────────────────────────
export type NLQueryRequest = {
  question: string;
};

export type NLQueryResponse = {
  answer: string;
  confidence: "high" | "medium" | "low";
  data?: Record<string, unknown>;
  suggestedActions?: string[];
};

// ─── Social Publish (Facebook / TikTok) ────────────────────────────────────
export type SocialPublishInput = {
  contentId: string;
  platform: "facebook" | "tiktok";
  title: string;
  description: string;
  privacyStatus?: "public" | "private";
  scheduledAt?: string;
  teamId?: string;
};

export type SocialPublishResult = {
  ok: boolean;
  platform: string;
  postId?: string;
  url?: string;
  message: string;
};

// ─── Multi-Tenant / Team ───────────────────────────────────────────────────
export type TeamRole = "admin" | "editor" | "viewer";

export type TeamMemberData = {
  id: string;
  email: string;
  name?: string;
  role: TeamRole;
  isActive: boolean;
};

export type TeamData = {
  id: string;
  name: string;
  slug: string;
  members: TeamMemberData[];
};

// ─── API Keys ──────────────────────────────────────────────────────────────
export type ApiKeyData = {
  id: string;
  label: string;
  keyPreview: string; // "sk-...abcd"
  scopes: string;
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
};

export type ApiKeyCreateInput = {
  label: string;
  scopes?: "read" | "write" | "admin";
  expiresInDays?: number;
};

// ─── Alerts & Webhooks ────────────────────────────────────────────────────
export type AlertChannel = "slack" | "email" | "telegram";
export type AlertEvent =
  | "sync.completed"
  | "sync.failed"
  | "content.generated"
  | "content.published"
  | "crawl.error"
  | "performance.alert";

export type AlertConfig = {
  id: string;
  channel: AlertChannel;
  config: Record<string, string>; // { webhookUrl?, email?, chatId? }
  events: AlertEvent[];
  isActive: boolean;
};

export type WebhookData = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggedAt?: string;
};

// ─── Audit Log ─────────────────────────────────────────────────────────────
export type AuditLogEntry = {
  id: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};
