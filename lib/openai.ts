import OpenAI from "openai";
import { getConfig } from "@/lib/config";
import { isAiQuotaExhausted } from "@/lib/aiQuota";

// ─── Provider config map ───────────────────────────────────────────────────
type ProviderInfo = {
  label: string;
  apiKeyKey: string;
  modelKey: string;
  defaultModel: string;
  baseUrl: string;
  /** Config key cho custom base URL (để user nhập trong Settings) */
  baseUrlKey: string;
  /** Provider này chỉ hỗ trợ Chat Completions (không support Responses API) */
  chatOnly?: boolean;
};

const PROVIDERS: Record<string, ProviderInfo> = {
  openai: {
    label: "OpenAI",
    apiKeyKey: "openai_api_key",
    modelKey: "openai_model",
    defaultModel: "gpt-5.5",
    baseUrl: "https://api.openai.com/v1",
    baseUrlKey: "openai_base_url",
  },
  gemini: {
    label: "Google Gemini",
    apiKeyKey: "gemini_api_key",
    modelKey: "gemini_model",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    baseUrlKey: "gemini_base_url",
    chatOnly: true,
  },
  groq: {
    label: "Groq",
    apiKeyKey: "groq_api_key",
    modelKey: "groq_model",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    baseUrlKey: "groq_base_url",
    chatOnly: true,
  },
  openrouter: {
    label: "OpenRouter",
    apiKeyKey: "openrouter_api_key",
    modelKey: "openrouter_model",
    defaultModel: "google/gemini-2.5-flash:free",
    baseUrl: "https://openrouter.ai/api/v1",
    baseUrlKey: "openrouter_base_url",
  },
  huggingface: {
    label: "HuggingFace",
    apiKeyKey: "huggingface_api_key",
    modelKey: "huggingface_model",
    defaultModel: "mistralai/Mistral-7B-Instruct-v0.3",
    baseUrl: "https://api-inference.huggingface.co/v1",
    baseUrlKey: "huggingface_base_url",
    chatOnly: true,
  },
};

export function getProviderList() {
  return Object.entries(PROVIDERS).map(([id, info]) => ({
    id,
    label: info.label,
    defaultModel: info.defaultModel,
    chatOnly: info.chatOnly ?? false,
  }));
}

export async function getActiveProvider(): Promise<string> {
  return (await getConfig("ai_provider")) || "openai";
}

export async function getProviderInfo(): Promise<ProviderInfo & { id: string }> {
  const providerId = await getActiveProvider();
  const provider = PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown AI provider: ${providerId}. Vào Settings → Config để chọn provider.`);
  }
  return { id: providerId, ...provider };
}

// ─── Rate-limit retry with exponential backoff + jitter ───────────────────
// Bảo vệ toàn bộ lời gọi model khỏi 429 Too Many Requests.
// Strategy:
//   - Max 3 retries (4 total attempts)
//   - Delay = baseDelay * 2^attempt + jitter(0..500ms)
//   - Nếu response header có Retry-After, dùng giá trị đó thay vì tính tự động
//   - Sau khi hết retry vẫn 429 → ném lỗi rõ ràng với retry count

const RATE_LIMIT_RETRY_MAX = 3;
const RATE_LIMIT_BASE_DELAY_MS = 2000; // 2s base → 2s, 4s, 8s (+ jitter)
const RATE_LIMIT_MAX_DELAY_MS = 32_000; // cap mỗi attempt ở 32s

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) {
      return true;
    }
  }
  // OpenAI SDK throws APIStatusError with status property
  if (typeof err === "object" && err !== null && "status" in err) {
    return (err as { status: number }).status === 429;
  }
  return false;
}

function extractRetryAfterMs(err: unknown): number | null {
  // OpenAI SDK error may carry response headers via .headers
  if (typeof err === "object" && err !== null && "headers" in err) {
    const headers = (err as { headers: Record<string, string> }).headers;
    const retryAfter = headers?.["retry-after"] || headers?.["x-ratelimit-reset-requests"];
    if (retryAfter) {
      const secs = parseFloat(retryAfter);
      if (!isNaN(secs)) return Math.ceil(secs * 1000);
    }
  }
  return null;
}

/**
 * Wraps any async function with exponential backoff + jitter retry logic
 * specifically for 429 rate-limit errors from any AI provider.
 *
 * @param fn       - The async function to call (e.g. a model API call)
 * @param label    - Human-readable label for logging (e.g. "Step 1 / openai")
 * @param options  - Override maxRetries or baseDelayMs
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  label = "AI call",
  options?: { maxRetries?: number; baseDelayMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? RATE_LIMIT_RETRY_MAX;
  const baseDelay = options?.baseDelayMs ?? RATE_LIMIT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRateLimitError(err)) {
        // Not a rate-limit error — rethrow immediately, no retry
        throw err;
      }

      if (attempt >= maxRetries) {
        // Exhausted all retries
        break;
      }

      // Calculate delay: exponential backoff + random jitter
      const retryAfterMs = extractRetryAfterMs(err);
      const backoff = Math.min(baseDelay * Math.pow(2, attempt), RATE_LIMIT_MAX_DELAY_MS);
      const jitter = Math.floor(Math.random() * 500);
      const delayMs = retryAfterMs ?? (backoff + jitter);

      console.warn(
        `[callWithRetry] 429 rate limit on "${label}" — attempt ${attempt + 1}/${maxRetries + 1}. ` +
        `Retrying in ${(delayMs / 1000).toFixed(1)}s…`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted — throw a clear error with context
  const baseMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[Rate Limit] "${label}" thất bại sau ${maxRetries + 1} lần thử (429 Too Many Requests). ` +
    `Kiểm tra quota/limit của provider hoặc thử lại sau. Chi tiết: ${baseMsg}`,
  );
}

// ─── Responses → Chat Completions adapter ──────────────────────────────────
// Tất cả code trong project dùng client.responses.create() (OpenAI Responses API).
// Các provider khác (Gemini, Groq, HuggingFace) không support Responses API.
// Proxy này tự động map responses.create() → chat.completions.create() và ngược lại.
// callWithRetry() bảo vệ lời gọi khỏi 429.

type ResponsesParams = {
  model?: string;
  input?: string | { role: string; content: string }[];
  instructions?: string;
  max_output_tokens?: number;
};

type ResponsesResult = {
  id: string;
  output_text: string;
  usage?: { input_tokens: number; output_tokens: number };
};

function createResponsesAdapter(client: OpenAI) {
  return {
    create: async (params: ResponsesParams): Promise<ResponsesResult> => {
      // Build messages array
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];

      if (params.instructions) {
        messages.push({ role: "system", content: params.instructions });
      }

      if (typeof params.input === "string") {
        messages.push({ role: "user", content: params.input });
      } else if (Array.isArray(params.input)) {
        for (const msg of params.input) {
          messages.push({ role: msg.role as "user" | "assistant", content: msg.content });
        }
      }

      // Resolve model — params.model luôn được caller truyền vào; fallback async chỉ dùng khi không có
      const resolvedModel = params.model || (await getAIModel());

      // Gọi Chat Completions với retry tự động cho 429
      const completion = await callWithRetry(
        () =>
          client.chat.completions.create({
            model: resolvedModel,
            messages,
            max_tokens: params.max_output_tokens ?? 1000,
          }),
        `responses.create (adapter / ${resolvedModel})`,
      );

      return {
        id: completion.id,
        output_text: completion.choices?.[0]?.message?.content || "",
        usage: completion.usage
          ? {
              input_tokens: completion.usage.prompt_tokens,
              output_tokens: completion.usage.completion_tokens,
            }
          : undefined,
      };
    },
  };
}

// ─── Get AI client với Responses adapter ───────────────────────────────────
// Tất cả code dùng getOpenAIClient() sẽ tự động nhận được client có .responses.create()
// hoạt động trên mọi provider (OpenAI, Gemini, Groq, OpenRouter, HuggingFace).

export async function getAIClient(useResponsesAdapter = true): Promise<OpenAI> {
  const { label, apiKeyKey, baseUrlKey, baseUrl: defaultUrl } = await getProviderInfo();

  const apiKey = await getConfig(apiKeyKey);
  if (!apiKey) {
    throw new Error(`Missing ${label} API Key. Vào Settings → Config để thêm.`);
  }

  // Đọc base URL từ config riêng của provider, fallback về hardcode default
  const customBaseUrl = await getConfig(baseUrlKey);
  const baseURL = customBaseUrl || defaultUrl;

  const rawClient = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders:
      baseURL.includes("openrouter.ai")
        ? { "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": process.env.APP_NAME || "CrawlEngine" }
        : undefined,
  });

  // Nếu là OpenAI, không cần adapter (native Responses API support)
  if (baseURL.includes("api.openai.com") && !customBaseUrl) {
    return rawClient;
  }

  // Proxy: gắn .responses adapter vào client
  (rawClient as any).responses = createResponsesAdapter(rawClient);
  return rawClient;
}

export async function getAIModel(): Promise<string> {
  const { modelKey, defaultModel } = await getProviderInfo();
  return (await getConfig(modelKey)) || defaultModel;
}

export async function isAIConfigured(): Promise<boolean> {
  const { apiKeyKey } = await getProviderInfo();
  return Boolean(await getConfig(apiKeyKey));
}

// ─── Universal AI caller (Chat Completions — hoạt động trên mọi provider) ──
// callWithRetry() bảo vệ khỏi 429 rate limit.
export async function callAI(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  options?: { maxTokens?: number; model?: string },
): Promise<string> {
  // Kiểm tra quota trước khi gọi AI
  const provider = await getActiveProvider();
  const quotaExhausted = await isAiQuotaExhausted(provider);
  if (quotaExhausted) {
    throw new Error(
      `⚠️ ${provider} đã hết hạn mức API. Vào Settings → API Keys để kiểm tra và cập nhật key.`,
    );
  }

  const client = await getAIClient(false);
  const model = options?.model || (await getAIModel());

  const response = await callWithRetry(
    () =>
      client.chat.completions.create({
        model,
        messages,
        max_tokens: options?.maxTokens ?? 1000,
      }),
    `callAI (${model})`,
  );

  return response.choices?.[0]?.message?.content || "";
}

// ─── Backward compatibility aliases ────────────────────────────────────────
export const getOpenAIClient = getAIClient;
export const getOpenAIModel = getAIModel;
export const isOpenAIConfigured = isAIConfigured;
