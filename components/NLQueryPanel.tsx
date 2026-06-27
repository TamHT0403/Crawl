"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Send, Bot, User, XCircle } from "lucide-react";


type Message = {
  role: "user" | "assistant";
  content: string;
  confidence?: "high" | "medium" | "low";
  suggestedActions?: string[];
  timeMs?: number;
  source?: string;
};

const SUGGESTED_QUESTIONS = [
  "Tổng quan hệ thống đang theo dõi những gì?",
  "Đối thủ nào có engagement cao nhất?",
  "Nền tảng nào đang hoạt động hiệu quả?",
  "Content gap nào Kolia nên khai thác?",
  "Trụ cột nội dung nào đang hiệu quả?",
  "Top bài viết có tương tác cao nhất?",
];

// Lightweight custom markdown parser to support bold, list items, and basic paragraphs
function parseMarkdownToHtml(text: string): string {
  if (!text) return "";
  
  // Escape HTML entities to prevent XSS
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/_(.*?)_/g, "<em>$1</em>");

  // Code inline
  html = html.replace(/`(.*?)`/g, "<code class='bg-slate-100 px-1 py-0.5 rounded text-xs font-mono'>$1</code>");

  // Process lists and paragraphs line by line
  const lines = html.split("\n");
  let inList = false;
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const listContent = trimmed.slice(2);
      return `<li class="ml-4 list-disc text-slate-700">${listContent}</li>`;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      const listContent = trimmed.replace(/^\d+\.\s/, "");
      return `<li class="ml-4 list-decimal text-slate-700">${listContent}</li>`;
    }
    if (trimmed.startsWith("### ")) {
      return `<h4 class="text-sm font-bold mt-2 mb-1 text-slate-800">${trimmed.slice(4)}</h4>`;
    }
    if (trimmed.startsWith("## ")) {
      return `<h3 class="text-base font-bold mt-3 mb-1 text-slate-800">${trimmed.slice(3)}</h3>`;
    }
    if (trimmed.startsWith("# ")) {
      return `<h2 class="text-lg font-bold mt-4 mb-2 text-slate-800">${trimmed.slice(2)}</h2>`;
    }
    return trimmed ? `<p class="mb-2 text-slate-700">${trimmed}</p>` : '<div class="h-1"></div>';
  });

  const parsed = processedLines.join("\n");
  return parsed || text; // Fallback to raw text if parsing somehow clears it
}

export function NLQueryPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 **Chào bạn!** Tôi là trợ lý phân tích dữ liệu đối thủ.\n\nHãy hỏi tôi bất cứ điều gì về dữ liệu crawl từ YouTube, TikTok, Facebook.\n\n*Ví dụ:*\n- *\"Đối thủ nào đang dẫn đầu về engagement?\"*\n- *\"Nên làm content gì cho TikTok?\"*\n- *\"YouTube đã kết nối chưa?\"*",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [isPending, setIsPending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Client-side cache (simple key-value store)
  const clientCacheRef = useRef<Record<string, Message>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingStep]);

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsPending(false);
      setLoadingStep("");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Đã hủy yêu cầu phân tích.",
          confidence: "low",
        },
      ]);
    }
  };

  const ask = async (q: string) => {
    if (!q.trim() || isPending) return;
    const questionText = q.trim();

    setMessages((prev) => [...prev, { role: "user", content: questionText }]);
    setQuestion("");
    setIsPending(true);
    setLoadingStep("Đang chuẩn bị truy vấn...");

    // Check client-side cache
    const cacheKey = questionText.toLowerCase().trim();
    if (clientCacheRef.current[cacheKey]) {
      const cached = clientCacheRef.current[cacheKey];
      setLoadingStep("Đọc từ bộ nhớ đệm...");
      setTimeout(() => {
        setMessages((prev) => [...prev, cached]);
        setIsPending(false);
        setLoadingStep("");
      }, 300);
      return;
    }

    // Set up abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setLoadingStep("Đang phân tích dữ liệu...");

      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionText }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Lỗi mạng: ${response.status}`);
      }

      setLoadingStep("Đang trả lời...");

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.answer ?? "❌ Không có phản hồi từ server.",
        confidence: data.confidence ?? "low",
        suggestedActions: data.suggestedActions ?? [],
        timeMs: data._meta?.timeMs,
        source: data._meta?.source,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Write to client cache
      clientCacheRef.current[cacheKey] = assistantMessage;

    } catch (err: any) {
      if (err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ Lỗi kết nối hoặc xử lý, vui lòng thử lại.", confidence: "low" },
      ]);
    } finally {
      setIsPending(false);
      setLoadingStep("");
      abortControllerRef.current = null;
    }
  };


  const confidenceBadge = (c?: string) => {
    if (c === "high") return <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Chính xác cao</span>;
    if (c === "medium") return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Trung bình</span>;
    return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Tham khảo</span>;
  };

  return (
    <div className="flex flex-col overflow-hidden rounded border border-kolia-line bg-white shadow-sm">
      {/* Chat Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: "600px" }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kolia-mint">
                <Bot className="h-4 w-4 text-kolia-green" />
              </div>
            )}
            <div className={`max-w-[85%] ${msg.role === "user" ? "order-1" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                  msg.role === "user"
                    ? "bg-kolia-ink text-white"
                    : "bg-slate-50 text-slate-700"
                }`}
              >
                <div
                  className="prose prose-sm break-words [&_p]:!text-inherit [&_li]:!text-inherit [&_h2]:!text-inherit [&_h3]:!text-inherit [&_h4]:!text-inherit"
                  dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(msg.content) }}
                />
              </div>
              {msg.role === "assistant" && (
                <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
                  {msg.confidence && confidenceBadge(msg.confidence)}
                  {msg.timeMs !== undefined && (
                    <span className="text-[10px] text-slate-400">
                      ⚡ {msg.timeMs}ms ({msg.source})
                    </span>
                  )}
                  {msg.suggestedActions?.map((action, ai) => (
                    <button
                      key={ai}
                      type="button"
                      onClick={() => ask(action)}
                      className="rounded bg-kolia-amber/50 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-kolia-amber transition-colors"
                    >
                      {action.length > 40 ? action.slice(0, 40) + "..." : action}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kolia-green">
                <User className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
        ))}
        {isPending && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-kolia-mint">
              <Loader2 className="h-4 w-4 animate-spin text-kolia-green" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-400">
              <span>{loadingStep}</span>
              <button
                type="button"
                onClick={cancelRequest}
                className="ml-2 text-slate-400 hover:text-red-500 transition-colors"
                title="Hủy yêu cầu"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions */}
      <div className="border-t border-kolia-line bg-slate-50 px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((sq) => (
            <button
              key={sq}
              type="button"
              onClick={() => ask(sq)}
              disabled={isPending}
              className="rounded-full border border-kolia-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-kolia-mint hover:text-kolia-green disabled:opacity-50 transition-colors"
            >
              {sq}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-kolia-line p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask(question)}
            placeholder="Hỏi bất cứ điều gì về dữ liệu đối thủ..."
            disabled={isPending}
            className="min-w-0 flex-1 rounded-lg border border-kolia-line px-4 py-2.5 text-sm outline-none focus:border-kolia-green focus:ring-1 focus:ring-kolia-green disabled:opacity-50"
          />
          {isPending ? (
            <button
              type="button"
              onClick={cancelRequest}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              Hủy
            </button>
          ) : (
            <button
              type="button"
              onClick={() => ask(question)}
              disabled={!question.trim() || isPending}
              className="flex items-center gap-2 rounded-lg bg-kolia-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              Gửi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
