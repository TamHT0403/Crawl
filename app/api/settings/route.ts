import { NextResponse } from "next/server";
import { getPublicSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(await getPublicSettings());
}

export async function PUT(request: Request) {
  const body = await request.json();
  // Accept any setting key from body — allows adding new settings without changing API route
  const knownKeys: Record<string, string | boolean | undefined> = {
    youtubeApiKey: body.youtubeApiKey,
    youtubeApiBaseUrl: body.youtubeApiBaseUrl,
    tiktokProviderUrl: body.tiktokProviderUrl,
    tiktokProviderToken: body.tiktokProviderToken,
    tiktokCrawlHeadless: body.tiktokCrawlHeadless,
    tiktokCrawlBrowser: body.tiktokCrawlBrowser,
    tiktokCrawlScrollDelayMin: body.tiktokCrawlScrollDelayMin,
    tiktokCrawlScrollDelayMax: body.tiktokCrawlScrollDelayMax,
    tiktokBaseUrl: body.tiktokBaseUrl,
    metaGraphToken: body.metaGraphToken,
    facebookEmail: body.facebookEmail,
    facebookPassword: body.facebookPassword,
    facebookCrawlHeadless: body.facebookCrawlHeadless,
    facebookCrawlBrowser: body.facebookCrawlBrowser,
    facebookCrawlScrollDelayMin: body.facebookCrawlScrollDelayMin,
    facebookCrawlScrollDelayMax: body.facebookCrawlScrollDelayMax,
    facebookBaseUrl: body.facebookBaseUrl,
    facebookLoginUrl: body.facebookLoginUrl,
  };
  // Also pick any extra keys not explicitly listed
  for (const [key, value] of Object.entries(body)) {
    if (!(key in knownKeys) && typeof value === 'string') {
      knownKeys[key] = value;
    }
  }
  const updated = await updateSettings(knownKeys);
  return NextResponse.json(updated);
}
