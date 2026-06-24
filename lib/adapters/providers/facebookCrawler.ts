/**
 * Facebook Crawler — GraphQL Interception Approach
 *
 * Ported from Python social-crawler (scrape_facebook.py).
 * Thay vì parse DOM, crawler này INTERCEPT Facebook GraphQL API responses
 * và parse JSON Story nodes — ổn định hơn rất nhiều.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { FacebookCrawlInput, FacebookCrawlResult, FacebookGraphQLPost, FacebookScrollConfig } from './facebookCrawlerTypes';
import { DEFAULT_SCROLL_CONFIG } from './facebookCrawlerTypes';

// ─── Singleton Browser ─────────────────────────────────────────────────

let globalBrowser: Browser | null = null;
let globalContext: BrowserContext | null = null;

function crawlLog(input: FacebookCrawlInput | undefined, msg: string) {
  console.log(`[facebook-graphql] ${msg}`);
  input?.onLog?.(msg);
}

async function getOrCreateBrowser(input: FacebookCrawlInput = {}): Promise<{ browser: Browser; context: BrowserContext }> {
  if (globalBrowser?.contexts?.()?.length) {
    try { globalBrowser.contexts()[0].pages(); return { browser: globalBrowser, context: globalContext! }; }
    catch { await cleanupBrowser(); }
  }

  const headless = input.headless ?? true;
  const engine = input.browserEngine ?? 'playwright';
  let browser: Browser;

  if (engine === 'cloakbrowser') {
    const { launch } = await import('cloakbrowser');
    browser = await launch({ headless: true, humanize: true, timezone: 'Asia/Saigon', locale: 'en-US',
      args: ['--no-sandbox', '--disable-web-security', '--no-first-run', '--no-default-browser-check'] });
  } else {
    const opts: Record<string, unknown> = { headless,
      args: ['--disable-blink-features=AutomationControlled','--no-sandbox','--disable-web-security',
        '--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--disable-infobars','--ignore-certificate-errors'] };
    if (engine === 'msedge') opts.channel = 'msedge';
    browser = await chromium.launch(opts);
  }

  const ctxOpts: Record<string, unknown> = {
    viewport: { width: 1280 + Math.floor(Math.random() * 200), height: 720 + Math.floor(Math.random() * 100) },
    locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh',
    permissions: ['geolocation'], geolocation: { latitude: 10.8231, longitude: 106.6297 }, colorScheme: 'light',
  };
  if (input.storageState) ctxOpts.storageState = input.storageState;

  const context = await browser.newContext(ctxOpts);
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ]});
    Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
    (window as any).chrome = { runtime: { connect: () => {}, sendMessage: () => {},
      onMessage: { addListener: () => {} }, onConnect: { addListener: () => {} }, getManifest: () => ({ version: '131' }) },
      loadTimes: () => {}, csi: () => {}, app: { isInstalled: false } };
    const origQ = navigator.permissions.query.bind(navigator.permissions);
    (navigator.permissions as any).query = (p: { name: string }) =>
      p.name === 'notifications' ? Promise.resolve({ state: Notification.permission, onchange: null } as PermissionStatus) : origQ(p as PermissionDescriptor);
  });

  globalBrowser = browser;
  globalContext = context;
  return { browser, context };
}

export async function cleanupBrowser() {
  try { await globalContext?.close(); } catch { /* ignore */ }
  try { await globalBrowser?.close(); } catch { /* ignore */ }
  globalContext = null;
  globalBrowser = null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GRAPHQL JSON PARSERS — ported from Python scrape_facebook.py
// ═══════════════════════════════════════════════════════════════════════════

/** Navigate deep JSON path safely */
function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Extract image URI from media node */
function extractImageUri(media: unknown): string | null {
  if (!media || typeof media !== 'object') return null;
  const m = media as Record<string, unknown>;
  for (const key of ['photo_image', 'image', 'viewer_image', 'large_share_image', 'flexible_height_share_image']) {
    const obj = m[key];
    if (obj && typeof obj === 'object') {
      const uri = (obj as Record<string, unknown>).uri;
      if (typeof uri === 'string') return uri;
    }
  }
  return null;
}

/** Extract video URL from media node */
function extractVideoUrl(media: unknown): string | null {
  if (!media || typeof media !== 'object') return null;
  const candidates = [media, dig(media, 'video_grid_renderer', 'video')];
  for (const obj of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    for (const urlsKey of ['videoDeliveryResponseFragment', 'video_delivery_response']) {
      const urls = urlsKey === 'videoDeliveryResponseFragment'
        ? dig(o, 'videoDeliveryResponseFragment', 'videoDeliveryResponseResult', 'progressive_urls')
        : dig(o, 'video_delivery_response', 'progressive_urls');
      if (Array.isArray(urls)) {
        for (const item of urls) {
          const u = (item as Record<string, unknown>)?.progressive_url;
          if (typeof u === 'string') return u;
        }
      }
    }
    for (const key of ['browser_native_hd_url', 'browser_native_sd_url', 'playable_url', 'url']) {
      const u = o[key];
      if (typeof u === 'string') return u;
    }
  }
  return null;
}

/** Extract video thumbnail */
function extractVideoThumbnail(media: unknown): string | null {
  if (!media || typeof media !== 'object') return null;
  const candidates = [media, (media as Record<string, unknown>).video, dig(media, 'video_grid_renderer', 'video')];
  for (const obj of candidates) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    const thumb = dig(o, 'preferred_thumbnail', 'image', 'uri');
    if (typeof thumb === 'string') return thumb;
    if (typeof o.first_frame_thumbnail === 'string') return o.first_frame_thumbnail;
    const ls = dig(o, 'large_share_image', 'uri');
    if (typeof ls === 'string') return ls;
    const ti = dig(o, 'thumbnailImage', 'uri');
    if (typeof ti === 'string') return ti;
  }
  return null;
}

/** Collect media from a node */
function collectMedia(media: unknown, images: string[], videos: string[]): void {
  if (!media || typeof media !== 'object') return;
  const m = media as Record<string, unknown>;
  const typename = (m.__typename as string) || '';
  const uri = extractImageUri(media);
  if (uri) { if (!images.includes(uri)) images.push(uri); }
  else if (typename === 'Video') {
    const thumb = extractVideoThumbnail(media);
    if (thumb && !images.includes(thumb)) images.push(thumb);
    const v = extractVideoUrl(media);
    if (v && !videos.includes(v)) videos.push(v);
    const permalink = (m.permalink_url || m.shareable_url || '') as string;
    if (permalink && !videos.includes(permalink)) videos.push(permalink);
  } else if (typename === 'ExternalUrl') {
    const link = (m.url || m.playable_url || '') as string;
    if (typeof link === 'string' && link.includes('reel') && !videos.includes(link)) videos.push(link);
  }
}

const SUBATTACHMENT_FIELDS = [
  'all_subattachments', 'five_photos_subattachments', 'four_photos_subattachments',
  'three_photos_subattachments', 'two_photos_subattachments', 'frame_sublayout_subattachments',
];

/** Select best subattachment album */
function bestSubattachmentNodes(attachment: Record<string, unknown>): Record<string, unknown>[] {
  let bestNodes: Record<string, unknown>[] = [];
  let bestUsable = -1;
  for (const field of SUBATTACHMENT_FIELDS) {
    const block = attachment[field] as Record<string, unknown> | undefined;
    if (!block) continue;
    const nodes = block.nodes as Record<string, unknown>[] | undefined;
    if (!Array.isArray(nodes) || !nodes.length) continue;
    let usable = 0;
    const current: Record<string, unknown>[] = [];
    for (const n of nodes) {
      if (!n) continue;
      current.push(n);
      if (extractImageUri(n.media) || extractVideoUrl(n.media)) usable++;
    }
    if (usable > bestUsable) { bestNodes = current; bestUsable = usable; }
  }
  return bestNodes;
}

/** Parse attachments for images/videos */
function parseAttachments(attachments: unknown[], images: string[], videos: string[]): void {
  for (const att of attachments) {
    if (!att || typeof att !== 'object') continue;
    const attachment = dig(att, 'styles', 'attachment') as Record<string, unknown> | undefined;
    if (!attachment) continue;
    if (attachment.media) collectMedia(attachment.media, images, videos);
    const styleInfos = attachment.style_infos;
    if (Array.isArray(styleInfos)) {
      for (const info of styleInfos) {
        const reelAtts = (info as Record<string, unknown>)?.fb_shorts_story as Record<string, unknown> | undefined;
        const reelList = reelAtts?.attachments as Record<string, unknown>[] | undefined;
        if (Array.isArray(reelList)) {
          for (const a of reelList) { const m = a?.media; if (m) collectMedia(m, images, videos); }
        }
      }
    }
    for (const node of bestSubattachmentNodes(attachment)) {
      if (node.media) collectMedia(node.media, images, videos);
    }
  }
}

/** Extract text from Story with 4-path fallback */
function extractText(storyJson: Record<string, unknown>): string {
  const paths = [
    ['comet_sections', 'content', 'story', 'message', 'text'],
    ['comet_sections', 'content', 'story', 'comet_sections', 'message_container', 'story', 'message', 'text'],
    ['comet_sections', 'content', 'story', 'comet_sections', 'message', 'story', 'message', 'text'],
  ];
  for (const path of paths) {
    const t = dig(storyJson, ...path);
    if (typeof t === 'string' && t) return t;
  }
  const blocks = dig(storyJson, 'comet_sections', 'content', 'story', 'comet_sections', 'message', 'rich_message') as unknown[];
  if (Array.isArray(blocks)) {
    const parts = blocks.filter(b => b && typeof b === 'object').map(b => (b as Record<string, unknown>).text).filter(Boolean);
    if (parts.length) return parts.join('\n');
  }
  return '';
}

/** Extract post from a GraphQL Story node */
function extractPostFromStory(storyJson: Record<string, unknown>): FacebookGraphQLPost | null {
  const postId = storyJson.post_id;
  if (!postId) return null;

  let postUrl = '';
  let createdDate: Date | null = null;
  const metaStory = dig(storyJson, 'comet_sections', 'context_layout', 'story', 'comet_sections', 'metadata', '0', 'story') as Record<string, unknown> | undefined;
  if (metaStory) {
    postUrl = (metaStory.url as string) || '';
    const ct = metaStory.creation_time;
    if (ct != null) { try { createdDate = new Date(Number(ct) * 1000); } catch { /* ignore */ } }
  }

  let authorName = '', authorId = '', authorUrl = '';
  const owning = dig(storyJson, 'feedback', 'owning_profile') as Record<string, unknown> | undefined;
  if (owning) { authorName = (owning.name as string) || ''; authorId = (owning.id as string) || ''; }
  const actors = (storyJson.actors as unknown[]) || [];
  let actor = actors[0] as Record<string, unknown> | undefined;
  if (!actor) {
    actor = dig(storyJson, 'comet_sections', 'context_layout', 'story', 'comet_sections', 'actor_photo', 'story', 'actors', '0') as Record<string, unknown> | undefined;
  }
  if (actor) {
    authorUrl = (actor.url || actor.profile_url || '') as string;
    if (!authorName) authorName = (actor.name as string) || '';
    if (!authorId) authorId = (actor.id as string) || '';
  }
  if (!authorId) {
    const fb = dig(storyJson, 'comet_sections', 'feedback', 'story', 'feedback_context', 'feedback_target_with_context', 'owning_profile') as Record<string, unknown> | undefined;
    if (fb) { if (!authorName) authorName = (fb.name as string) || ''; authorId = (fb.id as string) || ''; }
  }

  const text = extractText(storyJson);

  let likeCount = 0, commentCount = 0, shareCount = 0;

  // Path 1: Extract from adaptive_ufi_action_renderers + top_reactions
  try {
    const ufiFeedback = dig(storyJson, 'comet_sections', 'feedback', 'story', 'story_ufi_container', 'story',
      'feedback_context', 'feedback_target_with_context', 'comet_ufi_summary_and_actions_renderer',
      'feedback') as Record<string, unknown> | undefined;
    if (ufiFeedback) {
      const renderers = ufiFeedback.adaptive_ufi_action_renderers as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(renderers)) {
        for (const r of renderers) {
          const typename = r.__typename as string || '';
          const fbk = r.feedback as Record<string, unknown> | undefined;
          if (!fbk) continue;

          if (typename === 'UFIStoryReactActionRenderer') {
            const rc = fbk.reaction_count as Record<string, unknown> | undefined;
            if (rc?.count != null) likeCount = Number(rc.count);
          } else if (typename === 'UFICommentActionRenderer') {
            const cri = fbk.comment_rendering_instance as Record<string, unknown> | undefined;
            const comments = cri?.comments as Record<string, unknown> | undefined;
            if (comments?.total_count != null) commentCount = Number(comments.total_count);
          } else if (typename === 'XFBUFIAdaptiveShareActionRenderer') {
            const sc = fbk.share_count as Record<string, unknown> | undefined;
            if (sc?.count != null) shareCount = Number(sc.count);
          }
        }
      }
      // Fallback: extract likes from top_reactions if not found via renderers
      if (!likeCount) {
        const topReactions = ufiFeedback.top_reactions as Record<string, unknown> | undefined;
        const edges = topReactions?.edges as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(edges)) {
          likeCount = edges.reduce((sum: number, edge: any) => {
            return sum + Number(edge.reaction_count ?? edge.node?.reaction_count ?? 0);
          }, 0);
        }
      }
    } else {
      // Fallback: old structure
      try {
        const fb = storyJson.feedback as Record<string, unknown> | undefined;
        if (fb) {
          likeCount = Number((fb.reaction_count as Record<string, unknown> ?? {}).count ?? (fb as any).reaction_count ?? 0);
          const cr = fb.comment_rendering_instance as Record<string, unknown> | undefined;
          commentCount = Number((cr?.comments as Record<string, unknown> ?? {}).total_count ?? (fb as any).comment_count ?? 0);
          shareCount = Number((fb.share_count as Record<string, unknown> ?? {}).count ?? (fb as any).share_count ?? 0);
        }
      } catch { /* ignore */ }
    }
  } catch { /* fallback */ }

  // Path 2: Top-level feedback object
  if (!likeCount && !commentCount && !shareCount) {
    try {
      const fb = storyJson.feedback as Record<string, unknown> | undefined;
      if (fb) {
        likeCount = Number((fb.reaction_count as Record<string, unknown> ?? {}).count ?? (fb as any).reaction_count ?? 0);
        const cr = fb.comment_rendering_instance as Record<string, unknown> | undefined;
        commentCount = Number((cr?.comments as Record<string, unknown> ?? {}).total_count ?? (fb as any).comment_count ?? 0);
        shareCount = Number((fb.share_count as Record<string, unknown> ?? {}).count ?? (fb as any).share_count ?? 0);
      }
    } catch { /* ignore */ }
  }

  // Path 3: Direct fields on storyJson
  if (!likeCount && !commentCount && !shareCount) {
    try {
      likeCount = Number((storyJson as any).reaction_count?.count ?? 0);
      commentCount = Number((storyJson as any).comment_count?.count ?? 0);
      shareCount = Number((storyJson as any).share_count?.count ?? 0);
    } catch { /* ignore */ }
  }

  const images: string[] = [];
  const videos: string[] = [];
  const att1 = storyJson.attachments as unknown[];
  if (Array.isArray(att1)) parseAttachments(att1, images, videos);
  const att2 = dig(storyJson, 'comet_sections', 'content', 'story', 'attachments') as unknown[];
  if (Array.isArray(att2)) parseAttachments(att2, images, videos);
  if (!videos.length && postUrl.includes('/reel/')) videos.push(postUrl);
  if (!authorUrl && authorId) authorUrl = `https://www.facebook.com/${authorId}`;

  return {
    postUrl: postUrl || `https://www.facebook.com/${authorId}/posts/${postId}`,
    caption: text,
    imageUrl: images[0] || null,
    publishedAt: createdDate?.toISOString() || null,
    views: 0, likes: likeCount, comments: commentCount, shares: shareCount,
    authorName, authorId, images, videos,
  };
}

/** Recursively find Story nodes in JSON */
function findStoryNodes(obj: unknown, stories: Record<string, unknown>[], depth = 0): void {
  if (depth > 30 || obj == null) return;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item && typeof item === 'object') {
        const d = item as Record<string, unknown>;
        if (d.__typename === 'Story' && d.post_id) { stories.push(d); continue; }
        findStoryNodes(item, stories, depth + 1);
      }
    }
  } else if (typeof obj === 'object') {
    const d = obj as Record<string, unknown>;
    if (d.__typename === 'Story' && d.post_id) { stories.push(d); return; }
    const data = d.data;
    if (data && typeof data === 'object') {
      const node = (data as Record<string, unknown>).node;
      if (node && typeof node === 'object') { findStoryNodes(node, stories, depth + 1); return; }
    }
    for (const val of Object.values(d)) {
      if (val && typeof val === 'object') findStoryNodes(val, stories, depth + 1);
    }
  }
}

/** Parse GraphQL response body, handling `for (;;);` prefix */
function parseGraphQLResponse(text: string): Record<string, unknown>[] {
  let clean = text.trim();
  if (clean.startsWith('for (;;);')) clean = clean.slice(9).trim();
  if (clean.length < 100) {
    return [];
  }
  const stories: Record<string, unknown>[] = [];
  let linesParsed = 0;
  let totalLines = 0;
  for (const line of clean.split('\n')) {
    totalLines++;
    const trimmed = line.trim();
    if (trimmed.length < 2) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const before = stories.length;
      findStoryNodes(parsed, stories);
      if (stories.length > before) { linesParsed++; }
    }
    catch {
      let pos = 0;
      while (pos < trimmed.length) {
        try {
          const parsed = JSON.parse(trimmed.slice(pos));
          const before = stories.length;
          findStoryNodes(parsed, stories);
          if (stories.length > before) { linesParsed++; break; }
        }
        catch { pos++; }
      }
    }
  }
  return stories;
}

/** Human-like interaction simulation */
async function simulateHumanInteraction(page: Page, cfg: FacebookScrollConfig): Promise<void> {
  try {
    if (Math.random() < cfg.humanScrollChance) {
      await page.keyboard.press('PageDown');
      await new Promise(r => setTimeout(r, (cfg.humanScrollDelayMin + Math.random() * (cfg.humanScrollDelayMax - cfg.humanScrollDelayMin)) * 1000));
    }
    await page.mouse.move(100 + Math.random() * 800, 100 + Math.random() * 600,
      { steps: cfg.humanMouseMoveStepsMin + Math.floor(Math.random() * (cfg.humanMouseMoveStepsMax - cfg.humanMouseMoveStepsMin)) });
    if (Math.random() < cfg.humanScrollUpChance) {
      await new Promise(r => setTimeout(r, (cfg.humanScrollUpDelayMin + Math.random() * (cfg.humanScrollUpDelayMax - cfg.humanScrollUpDelayMin)) * 1000));
      await page.keyboard.press('PageUp');
      await page.mouse.move(100 + Math.random() * 800, 100 + Math.random() * 600,
        { steps: cfg.humanMouseMoveStepsMin + Math.floor(Math.random() * (cfg.humanMouseMoveStepsMax - cfg.humanMouseMoveStepsMin)) });
    }
  } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN CRAWL FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function crawlFacebook(
  channelUrl: string,
  input?: FacebookCrawlInput,
): Promise<FacebookCrawlResult | null> {
  const cfg = input ?? {};
  const maxPosts = cfg.maxPosts ?? 50;
  const scrollCfg: FacebookScrollConfig = { ...DEFAULT_SCROLL_CONFIG, ...cfg.scrollConfig };
  const startDt = cfg.startDate ? new Date(cfg.startDate) : null;
  const endDt = cfg.endDate ? new Date(cfg.endDate) : null;
  const sourceType = channelUrl.includes('/groups/') ? 'group' as const : 'profile' as const;

  crawlLog(cfg, `🚀 Bắt đầu crawl Facebook GraphQL: ${channelUrl} (${sourceType})`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { context } = await getOrCreateBrowser(cfg);
      const page = await context.newPage();
      const graphqlFilter = /\/(api\/graphql|graphql)/i;
      const collectedPosts: FacebookGraphQLPost[] = [];
      const seenPostIds = new Set<string>();
      const storyBuffer: Record<string, unknown>[] = [];

      // Network interception
      const onResponse = (response: import('playwright').Response) => {
        try {
          if (!graphqlFilter.test(response.url())) return;
          const url = response.url().slice(0, 150);
          const status = response.status();
          response.text().then(body => {
            const bodyLen = body.length;
            const stories = parseGraphQLResponse(body);
            if (stories.length) {
              storyBuffer.push(...stories);
            }
          }).catch(() => {});
        } catch { /* ignore */ }
      };
      page.on('response', onResponse);

      try {
        await page.goto(channelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, scrollCfg.initialDelayMin + Math.random() * (scrollCfg.initialDelayMax - scrollCfg.initialDelayMin)));

        const currentUrl = page.url().toLowerCase();
        if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
          crawlLog(cfg, '❌ Bị chuyển hướng sang login/checkpoint. Cookies hết hạn hoặc bị block.');
          await page.close(); continue;
        }

        // Dismiss login popups
        try {
          await page.waitForTimeout(scrollCfg.popupDismissDelay);
          await page.evaluate(() => {
            document.querySelectorAll('div[aria-label="Close"], div[aria-label="Đóng"]')
              .forEach(el => (el as HTMLElement).click());
          });
        } catch { /* ignore */ }

        // Scroll loop
        let staleStreak = 0;
        for (let scroll = 1; scroll <= scrollCfg.maxScrolls; scroll++) {
          if (collectedPosts.length >= maxPosts) break;

          await simulateHumanInteraction(page, scrollCfg);
          const steps = scrollCfg.scrollStepsMin + Math.floor(Math.random() * (scrollCfg.scrollStepsMax - scrollCfg.scrollStepsMin + 1));
          for (let s = 0; s < steps; s++) {
            await page.keyboard.press('PageDown');
            await new Promise(r => setTimeout(r, scrollCfg.interStepDelayMin + Math.random() * (scrollCfg.interStepDelayMax - scrollCfg.interStepDelayMin)));
          }
          try { await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, scrollCfg.scrollDelayMin + Math.random() * (scrollCfg.scrollDelayMax - scrollCfg.scrollDelayMin)));

          // Click "See more"
          try {
            await page.evaluate(() => {
              document.querySelectorAll('div[role="button"]').forEach(btn => {
                const t = (btn as HTMLElement).innerText;
                if (t && (t.includes('See more') || t.includes('Xem thêm'))) try { (btn as HTMLElement).click(); } catch { /* ignore */ }
              });
            });
          } catch { /* ignore */ }

          // Drain buffer
          const newStories = [...storyBuffer];
          storyBuffer.length = 0;
          let stopCrawling = false;

          for (const storyJson of newStories) {
            const pid = storyJson.post_id as string;
            if (!pid || seenPostIds.has(pid)) continue;
            seenPostIds.add(pid);
            const post = extractPostFromStory(storyJson);
            if (!post) continue;
            const pd = post.publishedAt ? new Date(post.publishedAt) : null;
            if (endDt && pd && pd > endDt) continue;
            if (startDt && pd && pd < startDt) { stopCrawling = true; break; }
            collectedPosts.push(post);
            if (collectedPosts.length >= maxPosts) { stopCrawling = true; break; }
          }
          if (stopCrawling) break;

          const before = collectedPosts.length;
          // Stale: if no new stories added this cycle
          if (collectedPosts.length === before) staleStreak++; else staleStreak = 0;

          if (staleStreak >= scrollCfg.staleLimit) {
            crawlLog(cfg, `⏹️ Dừng sớm: ${staleStreak} lần scroll không có post mới`); break;
          }
        }
      } finally {
        page.removeListener('response', onResponse);
        await page.close();
      }

      if (!collectedPosts.length) {
        crawlLog(cfg, '⚠️ Không tìm thấy bài viết nào.');
        if (attempt < 2) { await cleanupBrowser(); continue; }
        return null;
      }

      crawlLog(cfg, `✅ Hoàn thành: ${collectedPosts.length} posts`);
      return {
        sourceType,
        sourceName: collectedPosts[0]?.authorName || sourceType,
        sourceUrl: channelUrl,
        totalPosts: collectedPosts.length,
        posts: collectedPosts,
        crawlDate: new Date().toISOString(),
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      crawlLog(cfg, `❌ Attempt ${attempt}: ${errMsg}`);
      if (attempt < 2) { await cleanupBrowser(); await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000)); }
      else return null;
    }
  }
  return null;
}
