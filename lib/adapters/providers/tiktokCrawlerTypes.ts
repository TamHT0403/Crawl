// ─── Input & Configuration Types ────────────────────────────────────────

export interface CrawlInput {
  usernames: string[];
  date_range: DateRange;
  output_dir: string;
}

export interface DateRange {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

// ─── Video & User Data Types ────────────────────────────────────────────

export interface MusicInfo {
  id: string;
  title: string;
  author: string;
}

export interface VideoStats {
  play_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
}

export interface VideoItem {
  video_id: string;
  description: string;
  create_time: string; // ISO8601
  url: string;
  duration: number;
  cover_url: string;
  video_url: string;
  music: MusicInfo;
  stats: VideoStats;
  hashtags: string[];
}

export interface UserCrawlResult {
  username: string;
  user_id: string;
  nickname: string;
  follower_count: number;
  crawl_date: string; // ISO8601
  date_range: DateRange;
  total_videos: number;
  videos: VideoItem[];
}

// ─── Summary Types ──────────────────────────────────────────────────────

export type CrawlStatus = 'success' | 'failed' | 'partial';

export interface UserSummaryEntry {
  username: string;
  status: CrawlStatus;
  video_count: number;
  error?: string;
}

export interface CrawlSummary {
  crawl_date: string;
  total_users: number;
  succeeded: number;
  failed: number;
  partial: number;
  users: UserSummaryEntry[];
}

// ─── TikTok API Response Shapes (intercepted) ──────────────────────────

export interface TiktokApiResponse<T = unknown> {
  statusCode?: number;
  status_code?: number;
  data?: T;
  msg?: string;
  message?: string;
}

export interface UserDetailData {
  user?: {
    id?: string;
    uniqueId?: string;
    nickname?: string;
    signature?: string;
    bioLink?: { link: string };
    avatarLarger?: string;
    avatarMedium?: string;
    avatarThumb?: string;
    followerCount?: number;
    followingCount?: number;
    heartCount?: number;
    videoCount?: number;
    diggCount?: number;
    privateAccount?: boolean;
    isUnderAge18?: boolean;
  };
}

export interface PostItemListData {
  itemList?: RawVideoItem[];
  cursor?: string;
  hasMore?: boolean;
}

export interface RawVideoItem {
  id?: string;
  video_id?: string;
  desc?: string;
  createTime?: number;
  create_time?: number;
  duration?: number;
  width?: number;
  height?: number;
  cover?: string;
  originCover?: string;
  dynamicCover?: string;
  play?: string;
  download?: string;
  video?: {
    cover?: string;
    coverMedium?: string;
    dynamicCover?: string;
    playAddr?: string;
    downloadAddr?: string;
    bitrate?: number;
    duration?: number;
    width?: number;
    height?: number;
  };
  music?: {
    id?: string;
    title?: string;
    authorName?: string;
    author?: string;
    album?: string;
    playUrl?: string;
    coverLarge?: string;
    coverMedium?: string;
    coverThumb?: string;
    duration?: number;
  };
  author?: {
    id?: string;
    uniqueId?: string;
    nickname?: string;
    avatarThumb?: string;
    avatarMedium?: string;
    avatarLarger?: string;
    signature?: string;
    verified?: boolean;
  };
  stats?: {
    playCount?: number;
    diggCount?: number;
    commentCount?: number;
    shareCount?: number;
    collectCount?: number;
    play_count?: number;
    digg_count?: number;
    comment_count?: number;
    share_count?: number;
    collect_count?: number;
  };
  challenges?: Array<{
    id?: string;
    title?: string;
    desc?: string;
  }>;
  hashtags?: string[];
  textExtra?: Array<{
    hashtagName?: string;
    hashtagId?: string;
    type?: number;
    start?: number;
    end?: number;
  }>;
}

// ─── Browser Config ─────────────────────────────────────────────────────

export interface BrowserConfig {
  headless: boolean;
  browserChannel?: 'chromium' | 'msedge' | 'msedge-beta' | 'msedge-dev';
  authPath: string;
  maxRetries: number;
  consecutiveErrorThreshold: number;
  scrollDelayMin: number; // ms
  scrollDelayMax: number; // ms
  userDataDir: string;    // persistent browser profile (mimics real user)
}
