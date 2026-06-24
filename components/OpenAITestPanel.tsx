"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Bot, Loader2, Send } from "lucide-react";

type AIResponse = {
  ok?: boolean;
  outputText?: string;
  provider?: string;
  model?: string;
  error?: string;
  setup?: string;
};

const defaultPrompt =
  "Phân tích giúp tôi một ý tưởng video YouTube cho Kolia Phan về: Vì sao dữ liệu CPI và lãi suất Fed có thể ảnh hưởng đến giá vàng. Hãy đề xuất hook, flow 5 phần, CTA trung lập và lưu ý pháp lý.";

type ProviderInfo = {
  id: string;
  label: string;
  defaultModel: string;
  chatOnly: boolean;
};

export function OpenAITestPanel({
  configured,
  model,
  provider,
  providerList,
}: {
  configured: boolean;
  model: string;
  provider: string;
  providerList: ProviderInfo[];
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [result, setResult] = useState<AIResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentProvider = providerList.find(p => p.id === provider);
  const providerLabel = currentProvider?.label || provider;

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/openai/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const payload = (await response.json()) as AIResponse;
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
            <h2 className="font-bold text-kolia-ink">AI API Test</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Provider: <span className="font-semibold text-kolia-ink">{providerLabel}</span>
              &nbsp;·&nbsp; Model: <span className="font-semibold text-kolia-ink">{model}</span>
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="mt-5 rounded border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <div className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Chưa cấu hình API Key cho <strong>{providerLabel}</strong>.{' '}
                Vào Settings → Config để thêm key.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded border border-kolia-line bg-slate-50 p-3 text-xs text-slate-500 leading-relaxed">
          <p className="font-semibold text-slate-700 mb-1">Providers hỗ trợ:</p>
          {providerList.map((p) => (
            <span key={p.id} className={`inline-block mr-2 mb-1 px-2 py-0.5 rounded text-[10px] ${p.id === provider ? 'bg-kolia-green text-white' : 'bg-slate-200 text-slate-600'}`}>
              {p.label}
            </span>
          ))}
        </div>

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
        <h2 className="text-lg font-bold text-kolia-ink">Kết quả</h2>
        <p className="mt-1 text-sm text-slate-500">API key chỉ được dùng ở server, không expose ra frontend.</p>

        {result ? (
          result.error ? (
            <div className="mt-5 rounded border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
              <p className="font-bold">Lỗi khi gọi AI API</p>
              <p className="mt-2">{result.error}</p>
              {result.setup ? <p className="mt-2">{result.setup}</p> : null}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="rounded bg-kolia-mint p-4 text-sm leading-7 text-kolia-ink whitespace-pre-wrap">
                {result.outputText}
              </div>
              <div className="rounded border border-kolia-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <p>Provider: {result.provider}</p>
                <p>Model: {result.model}</p>
              </div>
            </div>
          )
        ) : (
          <div className="mt-5 rounded border border-dashed border-kolia-line p-10 text-center text-sm leading-6 text-slate-500">
            Nhập prompt và bấm Gửi prompt để kiểm tra AI API.
          </div>
        )}
      </section>
    </div>
  );
}
