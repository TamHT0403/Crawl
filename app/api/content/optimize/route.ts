import { NextResponse } from "next/server";
import { optimizeContent } from "@/lib/content-generator-pro";
import type { OptimizeStepEvent } from "@/lib/content-generator-pro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/content/optimize
 * Nhận góp ý + tối ưu lại content
 * SSE mode (Accept: text/event-stream): stream step events real-time
 */
export async function POST(request: Request) {
  let body: { contentId: string; feedback: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!body.contentId || !body.feedback?.trim()) {
    return NextResponse.json({ error: "contentId và feedback là bắt buộc." }, { status: 400 });
  }

  // ─── SSE Mode ──────────────────────────────────────────────────────────
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const result = await optimizeContent({
            contentId: body.contentId!,
            feedback: body.feedback!.trim(),
            onStep: (step: OptimizeStepEvent) => {
              sendEvent("step", step);
            },
          });

          sendEvent("complete", { ok: true, ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Không thể tối ưu nội dung.";
          sendEvent("error", { error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // ─── JSON Mode (default) ──────────────────────────────────────────────
  try {
    const result = await optimizeContent({
      contentId: body.contentId,
      feedback: body.feedback.trim(),
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tối ưu nội dung.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
