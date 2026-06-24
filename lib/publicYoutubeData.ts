import { YouTubeAdapter } from "@/lib/adapters/youtubeAdapter";
import type { RawPostInput } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { enrichRawPost } from "@/lib/classifier";

const youtubeAdapter = new YouTubeAdapter();

import { getConfig } from "@/lib/config";

export async function hasPublicYoutubeApiKey(): Promise<boolean> {
  return Boolean(await getConfig("youtube_api_key"));
}
