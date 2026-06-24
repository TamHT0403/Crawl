/**
 * YouTube Auto-Publish Engine
 *
 * OAuth2 + YouTube Data API v3 để đăng video/content lên YouTube.
 * Flow: Auth → Upload video hoặc cập nhật description → Kiểm tra status.
 */

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"];

// ─── OAuth2 Client ─────────────────────────────────────────────────────────

async function getOAuth2Client() {
  const { getConfig, requireConfig } = await import("@/lib/config");
  const clientId = await requireConfig("google_client_id");
  const clientSecret = await requireConfig("google_client_secret");
  const redirectUri = (await getConfig("google_redirect_uri")) || "http://localhost:3000/api/youtube/auth/callback";

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ─── Auth URL ──────────────────────────────────────────────────────────────

export async function getAuthUrl(): Promise<string> {
  const oauth2 = await getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

// ─── Exchange code for tokens ──────────────────────────────────────────────

export async function handleCallback(code: string): Promise<{ tokens: Record<string, unknown>; email?: string }> {
  const oauth2 = await getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Lưu tokens vào Setting table
  await prisma.setting.upsert({
    where: { key: "youtube_tokens" },
    update: { value: JSON.stringify(tokens) },
    create: { key: "youtube_tokens", value: JSON.stringify(tokens) },
  });

  return { tokens: tokens as Record<string, unknown> };
}

// ─── Get stored tokens ─────────────────────────────────────────────────────

async function getStoredTokens(): Promise<Record<string, unknown> | null> {
  const row = await prisma.setting.findUnique({ where: { key: "youtube_tokens" } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── Get authenticated YouTube client ──────────────────────────────────────

async function getYouTubeClient() {
  const oauth2 = await getOAuth2Client();
  const tokens = await getStoredTokens();

  if (!tokens) {
    throw new Error("YouTube chưa được kết nối. Vào Settings → YouTube để đăng nhập.");
  }

  oauth2.setCredentials(tokens as { access_token?: string; refresh_token?: string });

  // Auto-refresh token nếu hết hạn
  oauth2.on("tokens", async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await prisma.setting.upsert({
      where: { key: "youtube_tokens" },
      update: { value: JSON.stringify(merged) },
      create: { key: "youtube_tokens", value: JSON.stringify(merged) },
    });
  });

  return google.youtube({ version: "v3", auth: oauth2 });
}

// ─── Get channel info ──────────────────────────────────────────────────────

export async function getYouTubeChannels(): Promise<Array<{ id: string; name: string; thumbnail: string }>> {
  try {
    const youtube = await getYouTubeClient();
    const response = await youtube.channels.list({
      part: ["snippet", "contentDetails"],
      mine: true,
    });

    return (
      response.data.items?.map((channel) => ({
        id: channel.id ?? "",
        name: channel.snippet?.title ?? "Unknown",
        thumbnail: channel.snippet?.thumbnails?.default?.url ?? "",
      })) ?? []
    );
  } catch (error) {
    // Token expired and can't refresh
    if ((error as { response?: { status?: number } }).response?.status === 401) {
      await prisma.setting.delete({ where: { key: "youtube_tokens" } }).catch(() => {});
    }
    throw error;
  }
}

// ─── Check connection status ────────────────────────────────────────────────

export async function getYouTubeStatus(): Promise<{
  configured: boolean;
  connected: boolean;
  authUrl: string;
  channels: Array<{ id: string; name: string; thumbnail: string }>;
  error?: string;
}> {
  const { getConfig } = await import("@/lib/config");
  const clientId = await getConfig("google_client_id");
  const clientSecret = await getConfig("google_client_secret");
  const configured = Boolean(clientId && clientSecret);
  const authUrl = configured ? await getAuthUrl() : "";

  if (!configured) {
    return { configured: false, connected: false, authUrl: "", channels: [] };
  }

  try {
    const channels = await getYouTubeChannels();
    return { configured: true, connected: channels.length > 0, authUrl, channels };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.warn("[youtube] Status check failed:", errMsg);
    return { configured: true, connected: false, authUrl, channels: [], error: errMsg };
  }
}

// ─── Publish content ────────────────────────────────────────────────────────

/**
 * Upload video file + publish lên YouTube
 * Nhận file MP4 + metadata → upload qua YouTube Data API
 */
export async function uploadVideoToYouTube(options: {
  contentId: string;
  title: string;
  description: string;
  videoPath: string;
  privacyStatus: "public" | "unlisted" | "private";
  scheduledAt?: string;
}): Promise<{ videoId: string; url: string }> {
  const youtube = await getYouTubeClient();
  const fs = await import("fs");

  // Kiểm tra file tồn tại
  if (!fs.existsSync(options.videoPath)) {
    throw new Error("File video không tồn tại: " + options.videoPath);
  }

  const fileSize = fs.statSync(options.videoPath).size;
  if (fileSize === 0) throw new Error("File video rỗng.");
  if (fileSize > 256 * 1024 * 1024) {
    throw new Error("File video quá lớn (>256MB). YouTube API giới hạn 256MB cho upload trực tiếp.");
  }

  const publishAt = options.scheduledAt
    ? new Date(options.scheduledAt).toISOString()
    : undefined;

  console.log(`[youtube] Uploading video: ${options.title} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

  // Rút gọn description — chỉ lấy đoạn mở đầu (hook) làm summary
  const clean = (s: string) => s
    .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u024F\u1EA0-\u1EF9\n\r]/g, "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cleanTitle = clean(options.title).slice(0, 100) || "Untitled Video";

  // Lấy 2-3 đoạn đầu làm summary, bỏ timestamps, section headers, production notes
  const rawDesc = clean(options.description);
  const lines = rawDesc.split("\n").filter(l => {
    const t = l.trim();
    // Lọc bỏ dòng chứa timestamp, section header, production notes
    if (/^\d{1,2}:\d{2}/.test(t)) return false;
    if (/^PH[ẤA]N \d/i.test(t)) return false;
    if (/^L[ƯUU] Ý/.test(t)) return false;
    if (/^===/.test(t)) return false;
    if (/CHÚ Ý:|NOTE:|LƯU Ý:/i.test(t)) return false;
    return t.length > 0;
  });
  // Lấy tối đa 5 dòng đầu (khoảng 2-3 đoạn văn)
  const cleanDesc = lines.slice(0, 5).join("\n\n").slice(0, 2000) || "Video created by Kolia AI Studio";

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: cleanTitle,
        description: `${cleanDesc}\n\n---\nKich ban duoc tao boi Kolia AI Content Studio`,
        categoryId: "22",
      },
      status: {
        privacyStatus: publishAt ? "private" : options.privacyStatus,
        selfDeclaredMadeForKids: false,
        publishAt,
      },
    },
    media: {
      body: fs.createReadStream(options.videoPath),
    },
  });

  // Xoá file tạm sau khi upload
  try { fs.unlinkSync(options.videoPath); } catch {}

  const videoId = response.data.id ?? "";
  const url = `https://youtube.com/watch?v=${videoId}`;

  // Update content record
  await prisma.generatedContent.update({
    where: { id: options.contentId },
    data: {
      status: options.scheduledAt ? "scheduled" : "published",
      publishedUrl: url,
      publishAt: options.scheduledAt ? new Date(options.scheduledAt) : new Date(),
      scheduledAt: options.scheduledAt ? new Date(options.scheduledAt) : null,
    },
  });

  return { videoId, url };
}

/**
 * Publish script (không video) — copy script + mở YouTube Studio
 */
export async function publishToYouTube(options: {
  contentId: string;
  title: string;
  description: string;
  privacyStatus: "public" | "unlisted" | "private";
  scheduledAt?: string;
}): Promise<{ videoId: string; url: string; script?: string; title?: string }> {
  await prisma.generatedContent.update({
    where: { id: options.contentId },
    data: {
      status: "draft",
      publishAt: options.scheduledAt ? new Date(options.scheduledAt) : new Date(),
      scheduledAt: options.scheduledAt ? new Date(options.scheduledAt) : null,
    },
  });

  return {
    videoId: "",
    url: `https://studio.youtube.com/channel/upload`,
    script: options.description,
    title: options.title.slice(0, 100),
  };
}
