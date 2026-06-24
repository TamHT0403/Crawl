/**
 * Facebook & TikTok Auto-Publish Engine
 *
 * Sử dụng API đồ họa Facebook (Graph API) và Playwright/API TikTok để đăng bài.
 */

import { prisma } from "@/lib/prisma";
import type { SocialPublishInput, SocialPublishResult } from "@/lib/types";

// ─── Facebook Publish ──────────────────────────────────────────────────────

/**
 * Đăng bài lên Facebook Page qua Graph API.
 * Yêu cầu: FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN trong .env
 */
export async function publishToFacebook(input: SocialPublishInput): Promise<SocialPublishResult> {
  const { getConfig } = await import("@/lib/config");
  const pageId = await getConfig("fb_page_id");
  const accessToken = await getConfig("fb_page_access_token");

  if (!pageId || !accessToken) {
    return {
      ok: false,
      platform: "facebook",
      message: "⚠️ Facebook Page chưa được cấu hình. Vào Settings → Config để thêm.",
    };
  }

  try {
    // Tạo bài post text lên Facebook Page
    const postBody = `${input.title}\n\n${input.description.slice(0, 5000)}`;

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: postBody,
          access_token: accessToken,
          published: input.scheduledAt ? false : true,
          scheduled_publish_time: input.scheduledAt
            ? Math.floor(new Date(input.scheduledAt).getTime() / 1000)
            : undefined,
        }),
      }
    );

    const data = await response.json() as { id?: string; error?: { message: string }; post_id?: string };

    if (data.error) {
      return { ok: false, platform: "facebook", message: `❌ Facebook API: ${data.error.message}` };
    }

    const postId = data.id || data.post_id || "";
    const url = postId ? `https://facebook.com/${postId}` : "";

    // Update content record
    await prisma.generatedContent.update({
      where: { id: input.contentId },
      data: {
        status: input.scheduledAt ? "scheduled" : "published",
        publishedUrl: url,
        publishAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });

    // ─── Gửi Telegram notification ───────────────────────────────
    try {
      const { sendAlert } = await import("@/lib/alerts");
      const statusLabel = input.scheduledAt ? "📅 Đã lên lịch" : "📤 Đã đăng";
      await sendAlert(input.teamId ?? null, "content.published", `${statusLabel} Facebook`,
        `**${input.title}**\n` +
        (url ? `🔗 ${url}\n` : "") +
        `${input.scheduledAt
          ? `Lên lịch: ${new Date(input.scheduledAt).toLocaleString("vi-VN")}`
          : "Đã đăng thành công!"}`);
    } catch { /* silent */ }

    return {
      ok: true,
      platform: "facebook",
      postId,
      url,
      message: input.scheduledAt
        ? `✅ Facebook: Đã lên lịch đăng lúc ${new Date(input.scheduledAt!).toLocaleString("vi-VN")}`
        : "✅ Facebook: Đã đăng bài thành công!",
    };
  } catch (error) {
    return {
      ok: false,
      platform: "facebook",
      message: `❌ Lỗi đăng Facebook: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ─── TikTok Publish ────────────────────────────────────────────────────────

/**
 * Đăng video/content lên TikTok qua API hoặc Playwright.
 *
 * Cách 1: TikTok Business API (ưu tiên)
 * Cách 2: Playwright auto-post (fallback)
 */
export async function publishToTikTok(input: SocialPublishInput): Promise<SocialPublishResult> {
  const { getConfig } = await import("@/lib/config");
  const accessToken = await getConfig("tiktok_access_token");
  const openId = await getConfig("tiktok_open_id");

  // ─── Cách 1: TikTok Business API ──────────────────────────────────
  if (accessToken && openId) {
    return publishViaTikTokAPI(input, accessToken, openId);
  }

  // ─── Cách 2: Playwright auto-post ─────────────────────────────────
  return publishViaPlaywright(input);
}

/**
 * TikTok Business API v2 — upload video/content
 * Docs: https://developers.tiktok.com/
 */
async function publishViaTikTokAPI(
  input: SocialPublishInput,
  accessToken: string,
  openId: string
): Promise<SocialPublishResult> {
  try {
    // TikTok API yêu cầu upload video file trước, rồi mới tạo post.
    // Vì đây là content script (text), ta dùng Creator Content API nếu được.
    // Fallback: lưu vào draft và thông báo cho user.

    const response = await fetch(
      "https://open-api.tiktok.com/v2/video/upload/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          open_id: openId,
          access_token: accessToken,
          description: `${input.title}\n\n${input.description.slice(0, 2200)}`,
          privacy_level: input.privacyStatus === "private" ? "PRIVATE" : "PUBLIC",
          schedule_time: input.scheduledAt
            ? Math.floor(new Date(input.scheduledAt).getTime() / 1000)
            : undefined,
        }),
      }
    );

    const data = await response.json() as { data?: { error?: { code?: string; message?: string }; publish_id?: string }; error?: { message: string } };

    if (data.error) {
      return { ok: false, platform: "tiktok", message: `❌ TikTok API: ${data.error.message}` };
    }

    if (data.data?.error?.code) {
      return { ok: false, platform: "tiktok", message: `❌ TikTok: ${data.data.error.message || data.data.error.code}` };
    }

    // Update content record
    await prisma.generatedContent.update({
      where: { id: input.contentId },
      data: {
        status: input.scheduledAt ? "scheduled" : "published",
        publishAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });

    // ─── Gửi Telegram notification ───────────────────────────────
    try {
      const { sendAlert } = await import("@/lib/alerts");
      const statusLabel = input.scheduledAt ? "📅 Đã lên lịch" : "📤 Đã đăng";
      await sendAlert(input.teamId ?? null, "content.published", `${statusLabel} TikTok`,
        `**${input.title}**\n` +
        `${input.scheduledAt
          ? `Lên lịch: ${new Date(input.scheduledAt).toLocaleString("vi-VN")}`
          : "Đã đăng thành công!"}`);
    } catch { /* silent */ }

    return {
      ok: true,
      platform: "tiktok",
      postId: data.data?.publish_id,
      message: input.scheduledAt
        ? `✅ TikTok: Đã lên lịch đăng lúc ${new Date(input.scheduledAt!).toLocaleString("vi-VN")}`
        : "✅ TikTok: Đã đăng thành công!",
    };
  } catch (error) {
    return {
      ok: false,
      platform: "tiktok",
      message: `❌ Lỗi đăng TikTok: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}

/**
 * Playwright auto-post — dùng session TikTok để đăng bài
 */
async function publishViaPlaywright(input: SocialPublishInput): Promise<SocialPublishResult> {
  try {
    const { getDefaultTikTokAccount } = await import("@/lib/tiktok/accounts");
    const account = await getDefaultTikTokAccount();

    if (!account) {
      return {
        ok: false,
        platform: "tiktok",
        message: "⚠️ Chưa có tài khoản TikTok nào. Vào TikTok Tracker → thêm tài khoản trước.",
      };
    }

    // Cần triển khai Playwright auto-post nếu có yêu cầu cụ thể
    // Hiện tại: lưu content và hướng dẫn user tự đăng
    await prisma.generatedContent.update({
      where: { id: input.contentId },
      data: {
        status: "approved",
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });

    return {
      ok: false,
      platform: "tiktok",
      message: "ℹ️ TikTok auto-publish cần cấu hình TikTok API (TIKTOK_ACCESS_TOKEN + TIKTOK_OPEN_ID). Hiện tại đã lưu content để bạn đăng thủ công.",
    };
  } catch (error) {
    return {
      ok: false,
      platform: "tiktok",
      message: `❌ Lỗi: ${error instanceof Error ? error.message : "Unknown"}`,
    };
  }
}
