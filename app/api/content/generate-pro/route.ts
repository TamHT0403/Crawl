import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/openai";
import { generateProBatch, generateProContent, autoGenerateProFromSync } from "@/lib/content-generator-pro";
import type { StepResult } from "@/lib/content-generator-pro";
import type { GenerateBatchInput } from "@/lib/types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// ═══════════════════════════════════════════════════════════════════════════
//  SSE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Escape special regex characters in a string (mirrors content-generator-pro) */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Encode a single SSE event with named event type */
function sseEvent(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  return `event: ${event}\ndata: ${json}\n\n`;
}

/** Create the SSE Response with proper headers */
function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  GET /api/content/generate-pro
// ═══════════════════════════════════════════════════════════════════════════

export async function GET() {
  return NextResponse.json({
    configured: await isOpenAIConfigured(),
    engine: "pro-v2",
    description: "Multi-step AI generation: Research → Outline → Draft & Polish",
    endpoint: "/api/content/generate-pro",
    methods: ["POST"],
    streaming: "Set Accept: text/event-stream for SSE mode",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  POST /api/content/generate-pro
//  Supports two modes:
//    1. SSE mode  — Accept: text/event-stream → streams step-by-step progress
//    2. JSON mode — default → backward-compatible batch JSON response
// ═══════════════════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  // ─── Pre-flight checks (shared by both modes) ─────────────────────────
  if (!await isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI chưa được cấu hình. Vào Settings để thêm API key." },
      { status: 400 }
    );
  }

  let body: { syncRunId?: string } & GenerateBatchInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ─── Detect SSE vs JSON mode ──────────────────────────────────────────
  const acceptHeader = request.headers.get("Accept") ?? "";
  const wantsSSE = acceptHeader.includes("text/event-stream");

  // ─── SSE MODE ─────────────────────────────────────────────────────────
  if (wantsSSE) {
    return handleSSE(body);
  }

  // ─── JSON MODE (backward compatible) ──────────────────────────────────
  return handleJSON(body);
}

// ═══════════════════════════════════════════════════════════════════════════
//  JSON MODE — backward-compatible, delegates to generateProBatch
// ═══════════════════════════════════════════════════════════════════════════

async function handleJSON(body: { syncRunId?: string } & GenerateBatchInput) {
  try {
    if (body.syncRunId) {
      const result = await autoGenerateProFromSync(body.syncRunId);
      return NextResponse.json(result);
    }

    if (!body.entries?.length) {
      return NextResponse.json(
        { error: "entries là bắt buộc." },
        { status: 400 }
      );
    }

    const result = await generateProBatch(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content generation failed.";
    console.error("[content-generate-pro] JSON Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SSE MODE — streams step-by-step progress via Server-Sent Events
// ═══════════════════════════════════════════════════════════════════════════

function handleSSE(body: { syncRunId?: string } & GenerateBatchInput): Response {
  // Validate input before creating stream
  const entry = body.entries?.[0];
  if (!entry && !body.syncRunId) {
    // Return error as SSE stream so clients always get event-stream format
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(
          sseEvent("error", { error: "entries là bắt buộc. Cần ít nhất 1 entry hoặc syncRunId." })
        ));
        controller.close();
      },
    });
    return createSSEResponse(errorStream);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      /** Safely enqueue data to the stream, no-op if already closed */
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // Stream already closed by client disconnect — ignore
        }
      };

      try {
        // ─── syncRunId path: delegate to batch, emit final result ────
        if (body.syncRunId) {
          emit("step", { step: 1, stepName: "Research", output: "Đang phân tích sync run...", durationMs: 0 });
          const result = await autoGenerateProFromSync(body.syncRunId);
          emit("complete", result);
          controller.close();
          return;
        }

        // ─── SSE single-entry path with step callbacks ──────────────
        const firstEntry = body.entries[0];

        const result = await generateProContent({
          platform: firstEntry.platform,
          contentType: firstEntry.contentType,
          mainTopic: firstEntry.mainTopic,
          toneOfVoice: firstEntry.toneOfVoice,
          marketContext: body.marketContext,
          marketSnapshot: (body as any).marketSnapshot,
          onStepComplete: (stepResult: StepResult) => {
            emit("step", stepResult);
          },
        });

        // ─── Build full script (same logic as generateProBatch) ─────
        let rawTitle: string;
        if (typeof result.title === 'object' && result.title !== null) {
          rawTitle = (result as Record<string, unknown>).mainTopic as string || result.mainTopic || "";
        } else {
          rawTitle = String(result.title ?? "");
        }

        const cleanTitle = (rawTitle || result.mainTopic || "Phân tích thị trường")
          .replace(/^[{[]+/, '')
          .trim()
          .replace(new RegExp(`^(${escapeRegex(result.mainTopic?.split(" ")[0] || '')})\\s+\\1`, 'i'), '$1 ')
          .trim() || result.mainTopic || "Phân tích thị trường";

        const fullScript = [
          `# ${cleanTitle}`,
          ``,
          result.script,
          ``,
          `---`,
          `### 📌 Key Takeaways`,
          ...(result.keyTakeaways || []).map(k => `- ${k}`),
          ``,
          `### 🏆 Competitor References`,
          ...(result.competitorReferences || []).map(r => `- ${r}`),
        ].filter(Boolean).join("\n");

        // ─── Save to database ───────────────────────────────────────
        const saved = await prisma.generatedContent.create({
          data: {
            platform: firstEntry.platform,
            contentType: firstEntry.contentType,
            title: cleanTitle,
            script: fullScript,
            thumbnailIdea: result.thumbnailIdea ?? null,
            cta: result.cta ?? null,
            toneOfVoice: result.toneOfVoice,
            mainTopic: result.mainTopic,
            sourceGap: body.gapIds ? JSON.stringify(body.gapIds) : null,
            sourcePosts: body.lessonPostIds ? JSON.stringify(body.lessonPostIds) : null,
            status: "draft",
          },
        });

        // ─── Emit complete event ────────────────────────────────────
        emit("complete", {
          items: [{
            id: saved.id,
            platform: firstEntry.platform,
            contentType: firstEntry.contentType,
            title: cleanTitle,
            script: `## ${cleanTitle}\n\n${result.script}`,
            thumbnailIdea: result.thumbnailIdea,
            cta: result.cta,
            toneOfVoice: result.toneOfVoice,
            mainTopic: result.mainTopic,
            status: "draft",
            createdAt: saved.createdAt.toISOString(),
            // Quality metrics from Polish step
            hookScore: result.hookScore,
            retentionRisks: result.retentionRisks,
            alternativeHooks: result.alternativeHooks,
            seoTitle: result.seoTitle,
            seoDescription: result.seoDescription,
            hashtags: result.hashtags,
            qualityChecklist: result.qualityChecklist,
            titleVariants: result.titleVariants,
            researchBrief: result.researchBrief,
            outline: result.outline,
          }],
          totalGenerated: 1,
        });

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Content generation failed.";
        console.error("[content-generate-pro] SSE Error:", error);
        emit("error", { error: message });
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return createSSEResponse(stream);
}
