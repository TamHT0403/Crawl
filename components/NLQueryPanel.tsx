"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Loader2, Send, Bot, User, Sparkles, BarChart3, Target, TrendingUp } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  confidence?: "high" | "medium" | "low";
  suggestedActions?: string[];
};

const SUGGESTED_QUESTIONS = [
  "Tổng quan hệ thống đang theo dõi những gì?",
  "Đối thủ nào có engagement cao nhất?",
  "Nền tảng nào đang hoạt động hiệu quả?",
  "Content gap nào Kolia nên khai thác?",
  "Trụ cột nội dung nào đang hiệu quả?",
  "Top bài viết có tương tác cao nhất?",
];

export function NLQueryPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 **Chào bạn!** Tôi là trợ lý phân tích dữ liệu đối thủ.\n\nHãy hỏi tôi bất cứ điều gì về dữ liệu crawl từ YouTube, TikTok, Facebook.\n\n*Ví dụ:*\n- *\"Đối thủ nào đang dẫn đầu về engagement?\"*\n- *\"Nên làm content gì cho TikTok?\"*\n- *\"YouTube đã kết nối chưa?\"*",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [isPending, startTransition] = useTransition();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ask = (q: string) => {
    if (!q.trim() || isPending) return;
    const questionText = q.trim();

    setMessages((prev) => [...prev, { role: "user", content: questionText }]);
    setQuestion("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: questionText }),
        });
        const data = await response.json();

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer || "❌ Không thể trả lời câu hỏi này.",
            confidence: data.confidence,
            suggestedActions: data.suggestedActions,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "❌ Lỗi kết nối, vui lòng thử lại.", confidence: "low" },
        ]);
      }
    });
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
            <div className={`max-w-[80%] ${msg.role === "user" ? "order-1" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                  msg.role === "user"
                    ? "bg-kolia-ink text-white"
                    : "bg-slate-50 text-slate-700"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
              {msg.role === "assistant" && (
                <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
                  {msg.confidence && confidenceBadge(msg.confidence)}
                  {msg.suggestedActions?.map((action, ai) => (
                    <button
                      key={ai}
                      type="button"
                      onClick={() => ask(action)}
                      className="rounded bg-kolia-amber/50 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-kolia-amber"
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
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-400">
              Đang phân tích dữ liệu...
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
              className="rounded-full border border-kolia-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-kolia-mint hover:text-kolia-green disabled:opacity-50"
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
          <button
            type="button"
            onClick={() => ask(question)}
            disabled={!question.trim() || isPending}
            className="flex items-center gap-2 rounded-lg bg-kolia-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Gửi
          </button>
        </div>
      </div>
    </div>
  );
}
