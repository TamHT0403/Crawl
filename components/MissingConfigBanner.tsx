"use client";

import { AlertCircle, ExternalLink, Settings, X } from "lucide-react";
import { useState } from "react";

type MissingConfigBannerProps = {
  /** Tên config bị thiếu (vd: google_client_id) */
  configKey?: string;
  /** Label hiển thị (vd: Google Client ID) */
  label?: string;
  /** Hướng dẫn chi tiết */
  message?: string;
  /** Có thể đóng được không */
  dismissable?: boolean;
};

const SETTINGS_URL = "/settings";

/**
 * Banner hiển thị khi thiếu cấu hình, kèm link đến Settings UI
 */
export function MissingConfigBanner({
  configKey,
  label,
  message,
  dismissable = true,
}: MissingConfigBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const displayLabel = label ?? configKey ?? "Cấu hình";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200">
          <AlertCircle className="h-5 w-5 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-amber-900">⚠️ Thiếu cấu hình: {displayLabel}</h3>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            {message ?? `"${configKey}" chưa được cấu hình. Bạn cần nhập giá trị này để tính năng hoạt động.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={SETTINGS_URL}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-900"
            >
              <Settings className="h-4 w-4" />
              Đi đến Settings
              <ExternalLink className="h-3 w-3" />
            </a>
            {configKey && (
              <span className="rounded bg-amber-200/60 px-3 py-1.5 font-mono text-xs text-amber-800">
                {configKey}
              </span>
            )}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-amber-700 hover:text-amber-900">
              📖 Cách cấu hình chi tiết
            </summary>
            <div className="mt-2 rounded-lg bg-white/60 p-3 text-xs leading-6 text-amber-800">
              <p><strong>Bước 1:</strong> Click nút <strong>"Đi đến Settings"</strong> bên trên.</p>
              <p><strong>Bước 2:</strong> Tìm đúng mục theo category (Google/OpenAI/Facebook...).</p>
              <p><strong>Bước 3:</strong> Click nút <strong>"Sửa"</strong> và nhập giá trị.</p>
              <p><strong>Bước 4:</strong> Click icon <strong>💾 Save</strong> để lưu.</p>
              {configKey && (
                <p className="mt-2 text-amber-600">
                  ⚡ Mã cấu hình: <code className="rounded bg-amber-200 px-1">{configKey}</code>
                  {configKey === "google_client_id" && " — lấy từ Google Cloud Console → APIs & Services → Credentials"}
                  {configKey === "google_client_secret" && " — lấy từ Google Cloud Console → APIs & Services → Credentials"}
                  {configKey === "openai_api_key" && " — lấy từ https://platform.openai.com/api-keys"}
                  {configKey === "youtube_api_key" && " — lấy từ Google Cloud Console → APIs & Services → Credentials"}
                  {configKey === "telegram_bot_token" && " — lấy từ @BotFather trên Telegram"}
                </p>
              )}
            </div>
          </details>
        </div>
        {dismissable && (
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 text-amber-500 hover:bg-amber-200/50 hover:text-amber-700">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
