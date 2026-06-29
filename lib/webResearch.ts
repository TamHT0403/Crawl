/**
 * Web Research — Multi-Provider Search Integration
 * Content Generator Pro v4.0
 *
 * Kiến trúc multi-provider: dễ dàng thêm provider mới mà không sửa core logic.
 *
 * Providers được hỗ trợ:
 *   - tavily   (Tavily AI Search — tối ưu cho AI use cases)
 *   - serpapi  (Google Search qua SerpAPI)
 *   - none     (disabled — dùng DB-only enrichment)
 *
 * API keys được lưu trong DB Settings (encrypted), không hardcode trong code.
 * Config keys trong DB:
 *   - web_search_provider       : "tavily" | "serpapi" | "none"
 *   - web_search_api_key        : API key của provider đang active
 *   - web_search_max_results    : Số kết quả tối đa (mặc định: 5)
 *   - web_search_token_budget   : Max token cho research output (mặc định: 2000)
 *   - content_gen_token_budget  : Max token cho toàn bộ generation pipeline (mặc định: 20000)
 *
 * Thiết kế:
 *   - Tất cả providers implement `WebSearchProvider` interface
 *   - `getWebResearchProvider()` tự động load đúng provider từ DB config
 *   - Graceful fallback: nếu search fail → dùng DB context (không crash)
 */

import { getConfig } from "@/lib/config";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number; // Relevance score từ provider (nếu có)
  publishedDate?: string;
}

export interface WebSearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced"; // Tavily-specific
  topic?: "general" | "news" | "finance"; // Category hint
}

/** Interface mọi search provider phải implement */
export interface WebSearchProvider {
  id: string;
  name: string;
  search(options: WebSearchOptions): Promise<WebSearchResult[]>;
  isConfigured(): Promise<boolean>;
}

/** Config cho web research module */
export interface WebResearchConfig {
  provider: "tavily" | "serpapi" | "none";
  apiKey: string;
  maxResults: number;
  tokenBudget: number; // Token budget cho step 1 research output
  contentGenTokenBudget: number; // Token budget cho toàn bộ pipeline (user-configurable)
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG REGISTRY — thêm keys mới vào config.ts
// ═══════════════════════════════════════════════════════════════════════════

export const WEB_RESEARCH_CONFIG_KEYS = {
  provider: "web_search_provider",
  apiKey: "web_search_api_key",
  maxResults: "web_search_max_results",
  tokenBudget: "web_search_token_budget",
  contentGenTokenBudget: "content_gen_token_budget",
} as const;

export async function getWebResearchConfig(): Promise<WebResearchConfig> {
  const [provider, apiKey, maxResults, tokenBudget, contentGenTokenBudget] =
    await Promise.all([
      getConfig(WEB_RESEARCH_CONFIG_KEYS.provider),
      getConfig(WEB_RESEARCH_CONFIG_KEYS.apiKey),
      getConfig(WEB_RESEARCH_CONFIG_KEYS.maxResults),
      getConfig(WEB_RESEARCH_CONFIG_KEYS.tokenBudget),
      getConfig(WEB_RESEARCH_CONFIG_KEYS.contentGenTokenBudget),
    ]);

  return {
    provider: (provider as WebResearchConfig["provider"]) || "tavily",
    apiKey: apiKey || "",
    maxResults: parseInt(maxResults || "5", 10),
    tokenBudget: parseInt(tokenBudget || "2000", 10),
    contentGenTokenBudget: parseInt(contentGenTokenBudget || "20000", 10),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVIDER: TAVILY
// ═══════════════════════════════════════════════════════════════════════════

class TavilyProvider implements WebSearchProvider {
  id = "tavily";
  name = "Tavily AI Search";

  private apiKey: string;
  private baseUrl = "https://api.tavily.com/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async search(options: WebSearchOptions): Promise<WebSearchResult[]> {
    if (!this.apiKey) throw new Error("Tavily API key chưa được cấu hình");

    const body = {
      api_key: this.apiKey,
      query: options.query,
      max_results: options.maxResults ?? 5,
      search_depth: options.searchDepth ?? "basic",
      topic: options.topic ?? "general",
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tavily API error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json() as {
      results?: Array<{
        title: string;
        url: string;
        content: string;
        score?: number;
        published_date?: string;
      }>;
    };

    return (data.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.slice(0, 400) ?? "",
      score: r.score,
      publishedDate: r.published_date,
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVIDER: SERPAPI (Google Search)
// ═══════════════════════════════════════════════════════════════════════════

class SerpApiProvider implements WebSearchProvider {
  id = "serpapi";
  name = "SerpAPI (Google Search)";

  private apiKey: string;
  private baseUrl = "https://serpapi.com/search";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async isConfigured(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async search(options: WebSearchOptions): Promise<WebSearchResult[]> {
    if (!this.apiKey) throw new Error("SerpAPI key chưa được cấu hình");

    const params = new URLSearchParams({
      q: options.query,
      api_key: this.apiKey,
      num: String(options.maxResults ?? 5),
      hl: "vi",
      gl: "vn",
    });

    const response = await fetch(`${this.baseUrl}?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`SerpAPI error ${response.status}`);
    }

    const data = await response.json() as {
      organic_results?: Array<{
        title: string;
        link: string;
        snippet: string;
        date?: string;
      }>;
    };

    return (data.organic_results ?? []).slice(0, options.maxResults ?? 5).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet?.slice(0, 400) ?? "",
      publishedDate: r.date,
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVIDER: NO-OP (disabled)
// ═══════════════════════════════════════════════════════════════════════════

class NoopProvider implements WebSearchProvider {
  id = "none";
  name = "Web Search Disabled";

  async isConfigured(): Promise<boolean> { return false; }
  async search(_options: WebSearchOptions): Promise<WebSearchResult[]> { return []; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createWebSearchProvider(
  providerId: WebResearchConfig["provider"],
  apiKey: string,
): WebSearchProvider {
  switch (providerId) {
    case "tavily":  return new TavilyProvider(apiKey);
    case "serpapi": return new SerpApiProvider(apiKey);
    case "none":
    default:        return new NoopProvider();
  }
}

export async function getWebSearchProvider(): Promise<WebSearchProvider> {
  const config = await getWebResearchConfig();
  return createWebSearchProvider(config.provider, config.apiKey);
}

// ═══════════════════════════════════════════════════════════════════════════
//  RESEARCH ENRICHMENT — Kết hợp web search + DB context
// ═══════════════════════════════════════════════════════════════════════════

export interface ResearchEnrichment {
  webResults: WebSearchResult[];
  formattedWebContext: string;
  usedWebSearch: boolean;
  provider: string;
}

/**
 * Tìm kiếm thông tin mới nhất về topic trên web.
 * Gracefully fallback về empty nếu provider không configured hoặc search fail.
 *
 * @param topic      Chủ đề cần research
 * @param niche      Lĩnh vực (vd: "tài chính", "công nghệ", "bất động sản")
 * @param maxResults Số kết quả tối đa
 */
export async function enrichWithWebResearch(
  topic: string,
  niche = "tài chính",
  maxResults = 5,
): Promise<ResearchEnrichment> {
  const config = await getWebResearchConfig();
  const provider = createWebSearchProvider(config.provider, config.apiKey);

  const notConfigured: ResearchEnrichment = {
    webResults: [],
    formattedWebContext: "",
    usedWebSearch: false,
    provider: config.provider,
  };

  if (config.provider === "none") return notConfigured;
  if (!(await provider.isConfigured())) return notConfigured;

  try {
    // Tạo query phù hợp với niche và topic
    const query = buildSearchQuery(topic, niche);
    const results = await provider.search({
      query,
      maxResults: Math.min(maxResults, config.maxResults),
      topic: niche.includes("tài chính") || niche.includes("đầu tư") ? "finance" : "general",
    });

    if (!results.length) return notConfigured;

    const formatted = formatWebResultsForPrompt(results);
    return {
      webResults: results,
      formattedWebContext: formatted,
      usedWebSearch: true,
      provider: provider.id,
    };
  } catch (err) {
    // Graceful fallback — không crash pipeline
    console.warn(`[webResearch] ${provider.name} search failed:`, (err as Error).message);
    return notConfigured;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build search query tối ưu cho niche + topic.
 * Query bằng tiếng Việt để lấy kết quả phù hợp thị trường Việt Nam.
 */
function buildSearchQuery(topic: string, niche: string): string {
  // Bỏ query quá dài
  const cleanTopic = topic.slice(0, 80);
  const currentYear = new Date().getFullYear();

  // Nếu niche là tài chính, thêm context phù hợp
  if (niche.toLowerCase().includes("tài chính") || niche.toLowerCase().includes("đầu tư")) {
    return `${cleanTopic} phân tích tài chính ${currentYear}`;
  }
  return `${cleanTopic} ${niche} ${currentYear}`;
}

/**
 * Format web search results thành text ngắn gọn cho prompt injection.
 * ~200-400 tokens thay vì dump HTML/full content.
 */
function formatWebResultsForPrompt(results: WebSearchResult[]): string {
  if (!results.length) return "";

  const lines = results.map((r, i) =>
    `${i + 1}. "${r.title}" — ${r.snippet.slice(0, 200)}${r.publishedDate ? ` (${r.publishedDate})` : ""}`
  );

  return `## KẾT QUẢ TÌM KIẾM WEB (thông tin mới nhất):\n${lines.join("\n")}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOKEN BUDGET CONFIG HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Lấy token budget do user cấu hình từ DB. Fallback = 20000 */
export async function getContentGenTokenBudget(): Promise<number> {
  const raw = await getConfig(WEB_RESEARCH_CONFIG_KEYS.contentGenTokenBudget);
  const parsed = parseInt(raw || "20000", 10);
  // Clamp giữa 8000 và 100000
  return Math.max(8_000, Math.min(100_000, isNaN(parsed) ? 20_000 : parsed));
}

/**
 * Phân bổ token budget cho 5 step dựa trên tổng budget.
 * Trả về max_output_tokens cho từng step.
 */
export function allocateTokenBudget(totalBudget: number): {
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  step5: number;
} {
  // Tỷ lệ phân bổ cố định: Research 15%, Blueprint 10%, Outline 15%, Script 45%, QA 15%
  return {
    step1: Math.round(totalBudget * 0.15),
    step2: Math.round(totalBudget * 0.10),
    step3: Math.round(totalBudget * 0.15),
    step4: Math.round(totalBudget * 0.45),
    step5: Math.round(totalBudget * 0.15),
  };
}
