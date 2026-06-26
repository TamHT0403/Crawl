import { NextResponse } from "next/server";
import { isOpenAIConfigured } from "@/lib/openai";
import { executeStep } from "@/lib/content-generator-pro";
import type { StepInput } from "@/lib/content-generator-pro";

export const runtime = "nodejs";

/**
 * POST /api/content/generate-pro/step
 *
 * Execute a single step of the PRO v4.0 generation pipeline (5 steps).
 * Used by Manual mode in the frontend — allows users to edit prompts before execution.
 *
 * Body: StepInput
 *   step: 1 | 2 | 3 | 4 | 5
 *   platform: "youtube" | "tiktok" | "facebook"
 *   mainTopic: string
 *   sessionId?: string              (for session-based context passing)
 *   niche?: string                  (content niche, e.g., "tài chính")
 *   marketContext?: string
 *   marketSnapshot?: MarketSnapshot
 *   researchBrief?: string          (step 2+, fallback if no sessionId)
 *   blueprintRaw?: string           (step 3+)
 *   blueprintJSON?: object          (step 3+)
 *   sceneOutlineRaw?: string        (step 4+)
 *   sceneOutlineJSON?: object       (step 4+)
 *   fullScript?: string             (step 5)
 *   overriddenSystemInstruction?: string
 *   overriddenUserPrompt?: string
 */
export async function POST(request: Request) {
  if (!(await isOpenAIConfigured())) {
    return NextResponse.json(
      { error: "AI chưa được cấu hình. Vào Settings để thêm API key." },
      { status: 400 }
    );
  }

  let body: StepInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.step || ![1, 2, 3, 4, 5].includes(body.step)) {
    return NextResponse.json(
      { error: "step phải là 1, 2, 3, 4 hoặc 5." },
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
