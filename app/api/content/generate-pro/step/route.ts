import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/openai";
import { executeStep } from "@/lib/content-generator-pro";
import type { StepInput } from "@/lib/content-generator-pro";

export const runtime = "nodejs";

/**
 * POST /api/content/generate-pro/step
 *
 * Execute a single step of the PRO generation pipeline.
 * Used by Manual mode in the frontend — allows users to edit prompts before execution.
 *
 * Body: StepInput
 *   step: 1 | 2 | 3
 *   platform: "youtube" | "tiktok" | "facebook"
 *   mainTopic: string
 *   marketContext?: string
 *   marketSnapshot?: MarketSnapshot
 *   researchBrief?: string       (for step 2 & 3)
 *   outlineRaw?: string          (for step 3)
 *   outlineJSON?: Record<string, unknown> (for step 3)
 *   overriddenSystemInstruction?: string  (user-edited system instruction)
 *   overriddenUserPrompt?: string         (user-edited user prompt)
 */
export async function POST(request: Request) {
  // ─── Pre-flight check ─────────────────────────────────────────────────
  if (!await isOpenAIConfigured()) {
    return NextResponse.json(
      { error: "OpenAI chưa được cấu hình. Vào Settings để thêm API key." },
      { status: 400 }
    );
  }

  let body: StepInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.step || ![1, 2, 3].includes(body.step)) {
    return NextResponse.json(
      { error: "step phải là 1, 2 hoặc 3." },
      { status: 400 }
    );
  }

  if (!body.platform) {
    return NextResponse.json(
      { error: "platform là bắt buộc." },
      { status: 400 }
    );
  }

  try {
    const result = await executeStep(body);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Step execution failed.";
    console.error(`[step-route] Step ${body.step} error:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
