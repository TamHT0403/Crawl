"use client";

import { useEffect, useState } from "react";
import { CheckCircle, ExternalLink, Loader2, LogOut, Youtube, AlertCircle, RefreshCw } from "lucide-react";

type YouTubeStatus = {
  configured: boolean;
  connected: boolean;
  authUrl: string;
  channels: Array<{ id: string; name: string; thumbnail: string }>;
  error?: string;
};

export function YouTubeIntegration() {
  const [status, setStatus] = useState<YouTubeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/auth");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ configured: false, connected: false, authUrl: "", channels: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleConnect = () => {
    if (!status?.authUrl) return;
    setConnecting(true);
    // Open OAuth popup
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popup = window.open(
      status.authUrl,
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=1`
    );

    // Listen for postMessage from popup, and fallback to polling
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "youtube-oauth-success") {
        window.removeEventListener("message", onMessage);
        clearInterval(pollTimer);
        setConnecting(false);
        fetchStatus();
        setMessage({ type: "success", text: "✅ Đã kết nối YouTube thành công!" });
      }
    };
    window.addEventListener("message", onMessage);

    // Poll fallback: khi popup đóng mà chưa nhận được message
    const pollTimer = setInterval(() => {
      if (popup?.closed) {
        clearInterval(pollTimer);
        window.removeEventListener("message", onMessage);
        setConnecting(false);
        fetchStatus();
      }
    }, 500);
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/youtube/auth", {
        method: "DELETE",
      });
      setMessage({ type: "success", text: "✅ Đã ngắt kết nối YouTube." });
      fetchStatus();
    } catch {
      setMessage({ type: "error", text: "❌ Không thể ngắt kết nối." });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-kolia-green" />
      </div>
    );
  }

  const isConfigured = status?.configured;
  const isConnected = status?.connected;
  const channels = status?.channels ?? [];

  return (
    <section className="rounded-xl border border-kolia-line bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isConnected ? "bg-red-100" : isConfigured ? "bg-amber-100" : "bg-slate-100"}`}>
            <Youtube className={`h-5 w-5 ${isConnected ? "text-red-600" : isConfigured ? "text-amber-600" : "text-slate-400"}`} />
          </div>
          <div>
            <h2 className="text-base font-bold text-kolia-ink">YouTube Integration</h2>
            <p className="text-xs text-slate-500">Đăng bài tự động lên kênh YouTube</p>
          </div>
        </div>

        {/* Status badge */}
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isConnected
            ? "bg-green-100 text-green-700"
            : isConfigured
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-500"
        }`}>
          {isConnected ? "🟢 Đã kết nối" : isConfigured ? "🟡 Chưa cấp quyền" : "⚪ Chưa cấu hình"}
        </span>
      </div>

      {/* Progress steps */}
      <div className="mt-6 space-y-3">
        {/* Step 1: API Keys */}
        <div className={`flex items-center gap-3 rounded-lg border p-3 ${isConfigured ? "border-green-200 bg-green-50" : "border-kolia-line bg-slate-50"}`}>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isConfigured ? "bg-green-200 text-green-700" : "bg-slate-200 text-slate-500"}`}>
            {isConfigured ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <span className="text-xs font-bold">1</span>
            )}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${isConfigured ? "text-green-700" : "text-slate-500"}`}>
              Cấu hình Google OAuth
            </p>
            <p className="text-xs text-slate-500">
              {isConfigured
                ? "Client ID + Client Secret đã được cấu hình ✅"
                : "Cần nhập Google Client ID và Secret ở mục 🔑 Google / YouTube bên trên"}
            </p>
          </div>
        </div>

        {/* Step 2: OAuth Consent */}
        <div className={`flex items-center gap-3 rounded-lg border p-3 ${isConnected ? "border-green-200 bg-green-50" : isConfigured ? "border-amber-200 bg-amber-50" : "border-kolia-line bg-slate-50"}`}>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isConnected ? "bg-green-200 text-green-700" : isConfigured ? "bg-amber-200 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
            {isConnected ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <span className="text-xs font-bold">2</span>
            )}
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${isConnected ? "text-green-700" : isConfigured ? "text-amber-700" : "text-slate-500"}`}>
              Cấp quyền truy cập YouTube
            </p>
            <p className="text-xs text-slate-500">
              {isConnected
                ? `Đã kết nối ${channels.length} kênh YouTube ✅`
                : isConfigured
                ? "Click nút bên cạnh để đăng nhập Google và cấp quyền"
                : "Hoàn thành bước 1 trước"}
            </p>
          </div>
          {isConfigured && !isConnected && (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Youtube className="h-4 w-4" />
              )}
              {connecting ? "Đang kết nối..." : "Kết nối YouTube"}
            </button>
          )}
        </div>
      </div>

      {/* Connected channels */}
      {isConnected && channels.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Kênh đã kết nối</p>
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center gap-3 rounded-lg border border-kolia-line bg-slate-50 p-3">
              {ch.thumbnail ? (
                <img src={ch.thumbnail} alt={ch.name} className="h-10 w-10 rounded-full" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <Youtube className="h-5 w-5 text-red-600" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-kolia-ink">{ch.name}</p>
                <p className="text-xs text-slate-500">Sẵn sàng đăng bài tự động</p>
              </div>
              <a
                href={`https://youtube.com/channel/${ch.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-red-600"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ))}
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Ngắt kết nối
          </button>
        </div>
      )}

      {/* Not configured */}
      {!isConfigured && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-5 text-amber-800">
            Cần cấu hình <strong>Google Client ID</strong> và <strong>Google Client Secret</strong> ở mục <strong>🔑 Google / YouTube</strong> bên trên trước.
            Sau đó quay lại đây để kết nối.
          </p>
        </div>
      )}

      {/* Error detail */}
      {isConfigured && !isConnected && status?.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-red-800">Lỗi kết nối</p>
              <p className="mt-1 text-xs leading-5 text-red-700">{status.error}</p>
              <details className="mt-2" open>
                <summary className="cursor-pointer text-xs font-semibold text-red-600 hover:text-red-800">
                  🔧 Cách khắc phục
                </summary>
                <div className="mt-2 space-y-2 text-xs leading-5 text-red-700">
                  <p className="font-semibold">1️⃣ Bật YouTube Data API:</p>
                  <a
                    href="https://console.developers.google.com/apis/api/youtube.googleapis.com/overview?project=800511119751"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    <ExternalLink className="h-3 w-3" /> Bật YouTube Data API v3
                  </a>
                  <p className="font-semibold">2️⃣ Thêm email vào Test users:</p>
                  <a
                    href="https://console.cloud.google.com/apis/credentials/consent?project=youtubeautomation-499702"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    <ExternalLink className="h-3 w-3" /> Mở OAuth consent screen
                  </a>
                  <p className="font-semibold">3️⃣ Đợi 2-3 phút rồi F5 lại trang</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`mt-4 flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
          message.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-current opacity-60 hover:opacity-100">
            <span className="text-lg leading-none">&times;</span>
          </button>
        </div>
      )}

      {/* Refresh */}
      <div className="mt-4 flex items-center justify-between border-t border-kolia-line pt-3">
        <button onClick={fetchStatus} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-kolia-ink">
          <RefreshCw className="h-3 w-3" /> Kiểm tra lại trạng thái
        </button>
        {isConnected && (
          <span className="text-xs text-green-600">✅ Có thể đăng bài từ Content Library</span>
        )}
      </div>
    </section>
  );
}
