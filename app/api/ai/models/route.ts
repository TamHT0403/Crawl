import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Provider → model listing endpoint ─────────────────────────────────────

type ModelEntry = { id: string; name: string };

const PROVIDER_ENDPOINTS: Record<string, { url: string; auth: "header" | "query"; apiKeyKey: string }> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    auth: "header",
    apiKeyKey: "openai_api_key",
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    auth: "query",
    apiKeyKey: "gemini_api_key",
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    auth: "header",
    apiKeyKey: "groq_api_key",
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    auth: "header",
    apiKeyKey: "openrouter_api_key",
  },
};

/**
 * GET /api/ai/models?provider=openai
 *
 * Gọi API của provider để lấy danh sách model khả dụng.
 * Yêu cầu API key tương ứng đã được lưu trong config DB.
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");

  if (!provider || !PROVIDER_ENDPOINTS[provider]) {
    return NextResponse.json(
      { error: `Provider không hợp lệ. Hỗ trợ: ${Object.keys(PROVIDER_ENDPOINTS).join(", ")}` },
      { status: 400 },
    );
  }

  // ─── HuggingFace: trả về danh sách gợi ý (không thể fetch tất cả) ──
  if (provider === "huggingface") {
    return NextResponse.json({
      provider: "huggingface",
      source: "curated",
      models: [
        { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "Mistral 7B Instruct" },
        { id: "meta-llama/Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct" },
        { id: "meta-llama/Llama-3.2-3B-Instruct", name: "Llama 3.2 3B Instruct" },
        { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct" },
        { id: "google/gemma-2-2b-it", name: "Gemma 2 2B IT" },
        { id: "google/gemma-2-9b-it", name: "Gemma 2 9B IT" },
        { id: "microsoft/Phi-3-mini-4k-instruct", name: "Phi-3 Mini 4K" },
        { id: "microsoft/Phi-3.5-mini-instruct", name: "Phi-3.5 Mini Instruct" },
        { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen 2.5 7B Instruct" },
        { id: "Qwen/Qwen2.5-14B-Instruct", name: "Qwen 2.5 14B Instruct" },
        { id: "Qwen/Qwen2.5-32B-Instruct", name: "Qwen 2.5 32B Instruct" },
        { id: "Qwen/Qwen2.5-72B-Instruct", name: "Qwen 2.5 72B Instruct" },
        { id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", name: "DeepSeek R1 Distill Qwen 32B" },
        { id: "deepseek-ai/DeepSeek-V2.5-1210", name: "DeepSeek V2.5" },
        { id: "CohereForAI/c4ai-command-r7b-12-2024", name: "C4AI Command R7B" },
      ],
    });
  }

  // ─── Các provider khác: fetch từ API ──────────────────────────────
  const { url, auth, apiKeyKey } = PROVIDER_ENDPOINTS[provider];
  const apiKey = await getConfig(apiKeyKey);

  if (!apiKey) {
    // Có thể list model mà không cần key? Tuỳ provider.
    // OpenAI/Groq cần key, Gemini cần key query param, OpenRouter không cần
    if (provider !== "openrouter") {
      return NextResponse.json(
        {
          error: `Chưa cấu hình API Key cho provider này. Vào Settings → API Keys để thêm.`,
          missingKey: apiKeyKey,
        },
        { status: 400 },
      );
    }
  }

  try {
    const headers: Record<string, string> = {};

    if (auth === "header" && apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    let fetchUrl = url;
    if (auth === "query" && apiKey) {
      fetchUrl = `${url}?key=${apiKey}`;
    }

    const res = await fetch(fetchUrl, { headers });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unknown error");
      return NextResponse.json(
        {
          error: `API trả về lỗi ${res.status}: ${errorText.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const raw = await res.json();
    let models: ModelEntry[] = [];

    switch (provider) {
      case "openai": {
        // OpenAI: { data: [{ id: "gpt-4o", ... }] }
        // Lọc bỏ model không phải chat (embedding, whisper, tts, moderation, davinci, babbage)
        const excludePrefixes = ["text-embedding", "whisper", "tts", "davinci", "babbage", "curie", "ada", "moderation", "dall-e", "davinci-002", "babbage-002"];
        models = (raw.data || [])
          .filter((m: any) => !excludePrefixes.some((p) => m.id.startsWith(p)))
          .filter((m: any) => m.id.includes("gpt") || m.id.includes("o1") || m.id.includes("o3") || m.id.includes("chat"))
          .map((m: any) => ({ id: m.id, name: m.id }));
        break;
      }
      case "gemini": {
        // Gemini: { models: [{ name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent", ...] }] }
        models = (raw.models || [])
          .filter((m: any) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m: any) => ({
            id: m.name.replace("models/", ""),
            name: m.displayName || m.name.replace("models/", ""),
          }));
        break;
      }
      case "groq": {
        // Groq: { data: [{ id: "llama-3.3-70b-versatile", ... }] }
        models = (raw.data || []).map((m: any) => ({ id: m.id, name: m.id }));
        break;
      }
      case "openrouter": {
        // OpenRouter: { data: [{ id: "openai/gpt-4o", name: "GPT-4o", ... }] }
        models = (raw.data || []).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
        }));
        break;
      }
    }

    // Sort alphabetically
    models.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      provider,
      source: "api",
      models,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: `Không thể kết nối đến API của ${provider}: ${err.message}`,
      },
      { status: 502 },
    );
  }
}
