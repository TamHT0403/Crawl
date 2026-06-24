import { NextResponse } from "next/server";
import { aiClassifyPost, aiClassifyBatch } from "@/lib/aiClassifier";
import type { Platform } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/classify
 * AI-powered classification cho 1 hoặc nhiều posts
 *
 * Body:
 * { "title": "...", "caption": "...", "platform": "youtube" }  (single)
 * [{ "title": "...", "caption": "...", "platform": "tiktok" }]  (batch)
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Batch
    if (Array.isArray(body)) {
      const results = await aiClassifyBatch(
        body.map((item: { title?: string; caption?: string; platform?: string; transcript?: string }) => ({
          title: item.title ?? "",
          caption: item.caption ?? "",
          platform: (item.platform ?? "youtube") as Platform,
          transcript: item.transcript || undefined,
        }))
      );
      return NextResponse.json({ results, count: results.length });
    }

    // Single
    const input = body as { title?: string; caption?: string; platform?: string; transcript?: string };
    const result = await aiClassifyPost(
      input.title ?? "",
      input.caption ?? "",
      (input.platform ?? "youtube") as Platform,
      input.transcript
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Classification failed" },
      { status: 500 }
    );
  }
}
