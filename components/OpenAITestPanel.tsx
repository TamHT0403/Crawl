"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Bot, Loader2, Send } from "lucide-react";

type OpenAIResponse = {
  ok?: boolean;
  outputText?: string;
  responseId?: string;
  model?: string;
  usage?: unknown;
  error?: string;
  setup?: string;
  requestId?: string;
};

const defaultPrompt =
  "Phân tích giúp tôi một ý tưởng video YouTube cho Kolia Phan về: Vì sao dữ liệu CPI và lãi suất Fed có thể ảnh hưởng đến giá vàng. Hãy đề xuất hook, flow 5 phần, CTA trung lập và lưu ý pháp lý.";

export function OpenAITestPanel({ configured, model }: { configured: boolean; model: string }) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [result, setResult] = useState<OpenAIResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/openai/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const payload = (await response.json()) as OpenAIResponse;
        setResult(payload);
      } catch (error) {
        setResult({ error: error instanceof Error ? error.message : "Không thể gọi API route." });
      }
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-kolia-mint text-kolia-green">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-kolia-ink">OpenAI API test</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Model: <span className="font-semibold text-kolia-ink">{model}</span>
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="mt-5 rounded border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Chưa có `OPENAI_API_KEY` trong `.env`. Thêm key, sau đó restart dev server trước khi test.
              </p>
            </div>
          </div>
        ) : null}

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-slate-700">Prompt kiểm tra</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={10}
            className="mt-2 w-full rounded border border-kolia-line p-3 text-sm leading-6 outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={isPending || !prompt.trim()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded bg-kolia-green px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Gửi prompt
        </button>
      </section>

      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-kolia-ink">Kết quả Responses API</h2>
        <p className="mt-1 text-sm text-slate-500">API key chỉ được dùng ở server, không expose ra frontend.</p>

        {result ? (
          result.error ? (
            <div className="mt-5 rounded border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
              <p className="font-bold">Lỗi khi gọi OpenAI API</p>
              <p className="mt-2">{result.error}</p>
              {result.setup ? <p className="mt-2">{result.setup}</p> : null}
              {result.requestId ? <p className="mt-2 text-xs">Request ID: {result.requestId}</p> : null}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded bg-kolia-mint p-4 text-sm leading-7 text-kolia-ink whitespace-pre-wrap">
                {result.outputText}
              </div>
              <div className="rounded border border-kolia-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <p>Response ID: {result.responseId}</p>
                <p>Model: {result.model}</p>
              </div>
            </div>
          )
        ) : (
          <div className="mt-5 rounded border border-dashed border-kolia-line p-10 text-center text-sm leading-6 text-slate-500">
            Nhập prompt và bấm Gửi prompt để kiểm tra OpenAI Responses API.
          </div>
        )}
      </section>
    </div>
  );
}
