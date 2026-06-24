/**
 * Facebook Crawler Types
 *
 * Types cho Facebook GraphQL interception crawler,
 * ported từ Python social-crawler (scrape_facebook.py).
 */

// ─── Scroll & Anti-ban Config ──────────────────────────────────────────────

export type FacebookBrowserEngine = "playwright" | "msedge" | "cloakbrowser";

export interface FacebookScrollConfig {
  initialDelayMin: number;
  initialDelayMax: number;
  scrollStepsMin: number;
  scrollStepsMax: number;
  interStepDelayMin: number;
  interStepDelayMax: number;
  scrollDelayMin: number;
  scrollDelayMax: number;
  humanScrollChance: number;
  humanScrollDelayMin: number;
  humanScrollDelayMax: number;
  humanMouseMoveStepsMin: number;
  humanMouseMoveStepsMax: number;
  humanScrollUpChance: number;
  humanScrollUpDelayMin: number;
  humanScrollUpDelayMax: number;
  maxScrolls: number;
  staleLimit: number;
  popupDismissDelay: number;
}

export const DEFAULT_SCROLL_CONFIG: FacebookScrollConfig = {
  initialDelayMin: 3000,
  initialDelayMax: 5000,
  scrollStepsMin: 3,
  scrollStepsMax: 5,
  interStepDelayMin: 400,
  interStepDelayMax: 800,
  scrollDelayMin: 5000,
  scrollDelayMax: 9000,
  humanScrollChance: 0.7,
  humanScrollDelayMin: 0.5,
  humanScrollDelayMax: 1.2,
  humanMouseMoveStepsMin: 15,
  humanMouseMoveStepsMax: 30,
  humanScrollUpChance: 0.3,
  humanScrollUpDelayMin: 0.5,
  humanScrollUpDelayMax: 1.5,
  maxScrolls: 15,
  staleLimit: 4,
  popupDismissDelay: 2000,
};

// ─── Crawl Input ──────────────────────────────────────────────────────────

export interface FacebookCrawlInput {
  headless?: boolean;
  browserEngine?: FacebookBrowserEngine;
  storageState?: Record<string, unknown>;
  email?: string;
  password?: string;
  maxPosts?: number;
  startDate?: string;
  endDate?: string;
  scrollConfig?: Partial<FacebookScrollConfig>;
  onLog?: (message: string) => void;
}

// ─── Crawl Output (GraphQL-extracted) ─────────────────────────────────────

export interface FacebookGraphQLPost {
  postUrl: string;
  caption: string;
  imageUrl: string | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  authorName: string;
  authorId: string;
  images: string[];
  videos: string[];
}

export interface FacebookCrawlResult {
  sourceType: "profile" | "group";
  sourceName: string;
  sourceUrl: string;
  totalPosts: number;
  posts: FacebookGraphQLPost[];
  crawlDate: string;
}
