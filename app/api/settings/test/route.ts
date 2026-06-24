import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/settings";

export async function POST() {
  const settings = await getPublicSettings();
  return NextResponse.json({
    ok: true,
    checks: [
      {
        name: "YouTube Data API v3",
        status: settings.hasYoutubeApiKey ? `sẵn sàng (${settings.youtubeApiKeySource})` : "chưa cấu hình"
      },
      {
        name: "YouTube API URL",
        status: settings.youtubeApiBaseUrl ? `tuỳ chỉnh: ${settings.youtubeApiBaseUrl}` : "dùng mặc định"
      },
      {
        name: "TikTok provider",
        status: settings.hasTikTokProvider ? "sẵn sàng" : "chưa cấu hình"
      },
      {
        name: "TikTok Base URL",
        status: settings.tiktokBaseUrl ? `tuỳ chỉnh: ${settings.tiktokBaseUrl}` : "dùng mặc định"
      },
      {
        name: "Facebook Crawler",
        status: settings.hasFacebookCredentials ? "sẵn sàng (có email/password)" : "chưa cấu hình"
      },
      {
        name: "Facebook Base URL",
        status: settings.facebookBaseUrl ? `tuỳ chỉnh: ${settings.facebookBaseUrl}` : "dùng mặc định"
      },
      {
        name: "Meta Graph API",
        status: settings.hasMetaGraphToken ? "sẵn sàng" : "chưa cấu hình"
      }
    ]
  });
}
