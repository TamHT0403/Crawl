"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Globe,
  Play,
  PlugZap,
  Radio,
  Save,
  Trash2,
  Users,
  Cloud,
  Monitor,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Loader2,
  Settings2,
} from "lucide-react";
import { TikTokAccountManager } from "@/components/TikTokAccountManager";
import { FacebookAccountManager } from "@/components/FacebookAccountManager";
import type {
  CrawlProvider,
  PlaywrightProviderConfig,
  ApifyProviderConfig,
  SocialCrawlerProviderConfig,
  PlatformCrawlConfig,
  PublicSettings,
} from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────

type CompetitorForm = {
  id?: string;
  name: string;
  platform: string;
  source: string;
  segmentation: string;
  category: string;
  topicDescription: string;
  channelUrl: string;
  avatarUrl: string;
};

type CompetitorRow = {
  id: string;
  name: string;
  platform: string;
  source: string;
  segmentation: string | null;
  category: string;
  topicDescription: string | null;
  channelUrl: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

const emptyCompetitor: CompetitorForm = {
  name: "",
  platform: "youtube",
  source: "trong_nuoc",
  segmentation: "",
  category: "other",
  topicDescription: "",
  channelUrl: "",
  avatarUrl: "",
};

// ─── Provider card component ───────────────────────────────────────────────

type ProviderCardProps = {
  id: CrawlProvider;
  title: string;
  description: string;
  badge?: string;
  icon: React.ReactNode;
  isActive: boolean;
  isConfigured: boolean;
  onClick: () => void;
};

function ProviderCard({
  id,
  title,
  description,
  badge,
  icon,
  isActive,
  isConfigured,
  onClick,
}: ProviderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all duration-200 ${
        isActive
          ? "border-kolia-green bg-gradient-to-br from-kolia-mint/40 to-white shadow-md"
          : "border-kolia-line bg-white hover:border-kolia-green/50 hover:shadow-sm"
      }`}
    >
      {/* Active indicator */}
      {isActive && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-kolia-green px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <CheckCircle2 className="h-3 w-3" /> Active
        </span>
      )}

      {/* Badge (e.g. "Khuyên dùng") */}
      {badge && !isActive && (
        <span className="absolute right-3 top-3 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          {badge}
        </span>
      )}

      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          isActive ? "bg-kolia-green text-white" : "bg-slate-100 text-slate-500"
        }`}
      >
        {icon}
      </div>

      <div>
        <p className="text-sm font-bold text-kolia-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>

      {/* Config status */}
      <div className="mt-1 flex items-center gap-1">
        {isConfigured ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Đã cấu hình
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <AlertCircle className="h-3 w-3" /> Chưa cấu hình
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-kolia-line bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

// ─── Input field ───────────────────────────────────────────────────────────

const inputClass =
  "mt-1.5 h-10 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none transition focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {hint && <span className="ml-2 text-xs text-slate-400">{hint}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        placeholder={placeholder}
      />
    </label>
  );
}

// ─── Save button ───────────────────────────────────────────────────────────

function SaveButton({
  onClick,
  disabled,
  isPending,
  children = "Lưu cấu hình",
}: {
  onClick: () => void;
  disabled?: boolean;
  isPending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isPending}
      className="inline-flex items-center gap-2 rounded-lg bg-kolia-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-kolia-ink/90 disabled:opacity-60"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Save className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}

// ─── Playwright config panel ───────────────────────────────────────────────

function PlaywrightConfigPanel({
  config,
  onChange,
  platform,
}: {
  config: PlaywrightProviderConfig;
  onChange: (c: PlaywrightProviderConfig) => void;
  platform: "tiktok" | "facebook";
}) {
  const engines =
    platform === "tiktok"
      ? [
          { value: "cloakbrowser", label: "CloakBrowser — stealth, khuyên dùng" },
          { value: "playwright", label: "Playwright Chromium" },
          { value: "msedge", label: "Microsoft Edge" },
        ]
      : [
          { value: "playwright", label: "Playwright Chromium" },
          { value: "cloakbrowser", label: "CloakBrowser — stealth, chống captcha" },
          { value: "msedge", label: "Microsoft Edge" },
        ];

  const delayStatus =
    config.scrollDelayMin < 1200
      ? "danger"
      : config.scrollDelayMin < 2000
        ? "warn"
        : "safe";

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Trình duyệt</span>
        <select
          value={config.browserEngine}
          onChange={(e) =>
            onChange({
              ...config,
              browserEngine: e.target.value as PlaywrightProviderConfig["browserEngine"],
            })
          }
          className={inputClass}
        >
          {engines.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-kolia-line bg-slate-50 p-3">
        <input
          type="checkbox"
          checked={config.headless}
          onChange={(e) => onChange({ ...config, headless: e.target.checked })}
          className="h-4 w-4 accent-kolia-green"
        />
        <div>
          <p className="text-sm font-semibold text-slate-700">Chạy ẩn (headless)</p>
          <p className="text-xs text-slate-400">Không hiện cửa sổ trình duyệt khi crawl</p>
        </div>
      </label>

      {/* Scroll speed */}
      <div className="rounded-xl border border-kolia-line bg-slate-50 p-4">
        <h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
          Tốc độ scroll
        </h4>
        <p className="mt-1 text-xs text-slate-400">
          Delay giữa mỗi lần scroll. Quá nhanh sẽ bị phát hiện automation.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Tối thiểu (ms)</span>
            <input
              type="number"
              min={400}
              max={10000}
              step={100}
              value={config.scrollDelayMin}
              onChange={(e) => onChange({ ...config, scrollDelayMin: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Tối đa (ms)</span>
            <input
              type="number"
              min={400}
              max={10000}
              step={100}
              value={config.scrollDelayMax}
              onChange={(e) => onChange({ ...config, scrollDelayMax: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
        </div>
        {delayStatus === "danger" && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <strong className="block">⚠️ Cảnh báo: delay quá nhanh!</strong>
            Delay {config.scrollDelayMin}ms dễ bị phát hiện. Khả năng cao bị khoá tài khoản.
          </div>
        )}
        {delayStatus === "warn" && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            ⚠️ Delay {config.scrollDelayMin}ms ở mức trung bình. Khuyên dùng từ 2000ms.
          </div>
        )}
        {delayStatus === "safe" && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            ✅ Delay {config.scrollDelayMin}–{config.scrollDelayMax}ms — an toàn.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Apify config panel ────────────────────────────────────────────────────

function ApifyConfigPanel({
  config,
  onChange,
  platform,
  hasToken,
}: {
  config: ApifyProviderConfig;
  onChange: (c: ApifyProviderConfig) => void;
  platform: "tiktok" | "facebook";
  hasToken: boolean;
}) {
  const defaultGroupActor = "apify/facebook-groups-scraper";
  const defaultProfileActor = "apify/facebook-posts-scraper";
  const defaultActorId =
    platform === "tiktok" ? "clockworks/tiktok-scraper" : defaultGroupActor;

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
        <div className="text-xs text-blue-800">
          <p className="font-semibold">Crawl qua Apify Cloud</p>
          <p className="mt-1 leading-5">
            Apify chạy crawler trên hạ tầng cloud — không cần browser local, không lo bị block IP.
            Phù hợp khi crawl với volume lớn.
          </p>
          <a
            href="https://console.apify.com/account/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
          >
            Lấy API Token tại đây <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* API Token */}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Apify API Token</span>
        <input
          type="password"
          value={config.apiToken}
          onChange={(e) => onChange({ ...config, apiToken: e.target.value })}
          className={inputClass}
          placeholder={hasToken ? "●●●●●●●●●● (đã lưu, nhập để đổi)" : "apify_api_xxxxxxxxxxxxxxxx"}
        />
      </label>

      {/* Actor ID — Profile */}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Actor ID (Profile/Page)</span>
        <span className="ml-2 text-xs text-slate-400">
          — từ{" "}
          <a
            href="https://apify.com/store"
            target="_blank"
            rel="noopener noreferrer"
            className="text-kolia-green hover:underline"
          >
            Apify Store
          </a>
        </span>
        <input
          type="text"
          value={config.actorId}
          onChange={(e) => onChange({ ...config, actorId: e.target.value })}
          className={inputClass}
          placeholder={platform === "tiktok" ? "clockworks/tiktok-scraper" : defaultProfileActor}
        />
      </label>

      {/* Actor ID — Group (chỉ Facebook) */}
      {platform === "facebook" && (
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Actor ID (Group)</span>
          <span className="ml-2 text-xs text-slate-400">
            — dùng riêng cho Group Facebook
          </span>
          <input
            type="text"
            value={config.groupActorId}
            onChange={(e) => onChange({ ...config, groupActorId: e.target.value })}
            className={inputClass}
            placeholder={defaultGroupActor}
          />
          <p className="mt-1 text-xs text-slate-400">
            Để trống để dùng chung Actor ID bên trên. Code tự động detect group/profile từ URL.
          </p>
        </label>
      )}

      {/* Advanced settings */}
      <div className="rounded-xl border border-kolia-line bg-slate-50 p-4">
        <h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
          Cấu hình nâng cao
        </h4>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Max items</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={config.maxItems}
              onChange={(e) => onChange({ ...config, maxItems: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Timeout (s)</span>
            <input
              type="number"
              min={30}
              max={3600}
              step={30}
              value={config.timeoutSecs}
              onChange={(e) => onChange({ ...config, timeoutSecs: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Memory (MB)</span>
            <input
              type="number"
              min={128}
              max={32768}
              step={128}
              value={config.memoryMbytes}
              onChange={(e) => onChange({ ...config, memoryMbytes: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Timeout &gt; 120s sẽ dùng chế độ async (fire-and-wait). Memory cao hơn = nhanh hơn nhưng tốn phí.
        </p>
      </div>
    </div>
  );
}

// ─── Social Crawler config panel ────────────────────────────────────────────

function SocialCrawlerConfigPanel({
  config,
  onChange,
  hasKey,
}: {
  config: SocialCrawlerProviderConfig;
  onChange: (c: SocialCrawlerProviderConfig) => void;
  hasKey: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
        <Globe className="mt-0.5 h-5 w-5 shrink-0 text-purple-500" />
        <div className="text-xs text-purple-800">
          <p className="font-semibold">Crawl qua Social Crawler API</p>
          <p className="mt-1 leading-5">
            Social Crawler là third-party service chuyên crawl dữ liệu TikTok.
            Không cần browser local, không lo bị block IP, hỗ trợ date range filtering.
            Dùng chung API key cho tất cả platform.
          </p>
          <a
            href="https://social-crawler.public.rke.crawl.tmtco.org"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 font-semibold text-purple-600 hover:underline"
          >
            Mở Social Crawler Dashboard <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* API URL */}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">API Base URL</span>
        <input
          type="text"
          value={config.apiUrl}
          onChange={(e) => onChange({ ...config, apiUrl: e.target.value })}
          className={inputClass}
          placeholder="https://social-crawler.public.rke.crawl.tmtco.org"
        />
        <p className="mt-1 text-xs text-slate-400">
          Mặc định: https://social-crawler.public.rke.crawl.tmtco.org
        </p>
      </label>

      {/* API Key */}
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">API Key</span>
        <input
          type="password"
          value={config.apiKey}
          onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
          className={inputClass}
          placeholder={hasKey ? "•••••••••• (đã lưu, nhập để đổi)" : "Nhập API key..."}
        />
        <p className="mt-1 text-xs text-slate-400">
          API key dùng chung cho social-crawler service.
        </p>
      </label>

      {/* Advanced settings */}
      <div className="rounded-xl border border-kolia-line bg-slate-50 p-4">
        <h4 className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
          Cấu hình nâng cao
        </h4>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Max items</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={config.maxItems}
              onChange={(e) => onChange({ ...config, maxItems: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Timeout (s)</span>
            <input
              type="number"
              min={30}
              max={600}
              step={10}
              value={config.timeoutSecs}
              onChange={(e) => onChange({ ...config, timeoutSecs: Number(e.target.value) })}
              className="mt-1 h-9 w-full rounded-lg border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Platform provider tab content ─────────────────────────────────────────

function PlatformProviderTab({
  platform,
  providerConfig,
  settings,
  isPending,
  onSave,
  children,
}: {
  platform: "tiktok" | "facebook";
  providerConfig: PlatformCrawlConfig;
  settings: PublicSettings;
  isPending: boolean;
  onSave: (config: PlatformCrawlConfig, tab: string) => void;
  children?: React.ReactNode; // AccountManager slot
}) {
  const [localConfig, setLocalConfig] = useState<PlatformCrawlConfig>(providerConfig);
  const [saveStatus, setSaveStatus] = useState("");

  const isApifyConfigured = Boolean(
    localConfig.apify.apiToken && localConfig.apify.actorId
  );
  const isPlaywrightConfigured = true; // Playwright luôn "configured" (không cần key)
  const isSocialCrawlerConfigured = Boolean(localConfig.socialCrawler.apiKey);

  const hasToken = Boolean(providerConfig.apify.apiToken); // Có token đã lưu chưa
  const hasSocialCrawlerKey = Boolean(providerConfig.socialCrawler.apiKey); // Có API key đã lưu chưa

  const handleSave = () => {
    onSave(localConfig, platform);
    setSaveStatus("✅ Đã lưu");
    setTimeout(() => setSaveStatus(""), 3000);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        {/* Provider selector */}
        <SectionCard>
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="h-5 w-5 text-kolia-green" />
            <h2 className="text-base font-bold text-kolia-ink">Chọn Provider Crawl</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Mỗi provider có cách crawl khác nhau. Chỉ một provider được active tại một thời điểm.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <ProviderCard
              id="playwright"
              title="Playwright / Browser"
              description="Crawl bằng trình duyệt local. Phù hợp cho môi trường tự quản lý."
              badge={platform === "tiktok" ? "CloakBrowser" : undefined}
              icon={<Monitor className="h-5 w-5" />}
              isActive={localConfig.activeProvider === "playwright"}
              isConfigured={isPlaywrightConfigured}
              onClick={() =>
                setLocalConfig({ ...localConfig, activeProvider: "playwright" })
              }
            />
            <ProviderCard
              id="apify"
              title="Apify Cloud"
              description="Crawl qua hạ tầng cloud của Apify. Không cần browser local, ít bị block hơn."
              badge="Cloud"
              icon={<Cloud className="h-5 w-5" />}
              isActive={localConfig.activeProvider === "apify"}
              isConfigured={isApifyConfigured}
              onClick={() =>
                setLocalConfig({ ...localConfig, activeProvider: "apify" })
              }
            />
            <ProviderCard
              id="social-crawler"
              title="Social Crawler"
              description="Third-party service crawl TikTok. Đơn giản, nhanh, không cần cấu hình phức tạp."
              badge="Mới"
              icon={<Globe className="h-5 w-5" />}
              isActive={localConfig.activeProvider === "social-crawler"}
              isConfigured={isSocialCrawlerConfigured}
              onClick={() =>
                setLocalConfig({ ...localConfig, activeProvider: "social-crawler" })
              }
            />
          </div>
        </SectionCard>

        {/* Active provider config panel */}
        <SectionCard>
          <div className="flex items-center gap-2 mb-4">
            {localConfig.activeProvider === "playwright" ? (
              <>
                <Monitor className="h-5 w-5 text-slate-500" />
                <h2 className="text-base font-bold text-kolia-ink">Cấu hình Playwright</h2>
              </>
            ) : localConfig.activeProvider === "apify" ? (
              <>
                <Cloud className="h-5 w-5 text-blue-500" />
                <h2 className="text-base font-bold text-kolia-ink">Cấu hình Apify</h2>
              </>
            ) : (
              <>
                <Globe className="h-5 w-5 text-purple-500" />
                <h2 className="text-base font-bold text-kolia-ink">Cấu hình Social Crawler</h2>
              </>
            )}
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="rounded-full bg-kolia-mint px-2 py-0.5 text-[11px] font-semibold text-kolia-green capitalize">
              {platform}
            </span>
          </div>

          {localConfig.activeProvider === "playwright" ? (
            <PlaywrightConfigPanel
              config={localConfig.playwright}
              platform={platform}
              onChange={(playwright) => setLocalConfig({ ...localConfig, playwright })}
            />
          ) : localConfig.activeProvider === "apify" ? (
            <ApifyConfigPanel
              config={localConfig.apify}
              platform={platform}
              hasToken={hasToken}
              onChange={(apify) => setLocalConfig({ ...localConfig, apify })}
            />
          ) : (
            <SocialCrawlerConfigPanel
              config={localConfig.socialCrawler}
              hasKey={hasSocialCrawlerKey}
              onChange={(socialCrawler) => setLocalConfig({ ...localConfig, socialCrawler })}
            />
          )}

          <div className="mt-5 flex items-center gap-3 pt-3 border-t border-kolia-line">
            <SaveButton onClick={handleSave} isPending={isPending}>
              Lưu cấu hình
            </SaveButton>
            {saveStatus && (
              <span className="text-sm font-semibold text-kolia-green">{saveStatus}</span>
            )}
          </div>
        </SectionCard>

        {/* Extra config for facebook credentials */}
        {children}
      </div>

      {/* AccountManager column */}
      {platform === "facebook" ? (
        <FacebookAccountManager />
      ) : (
        <TikTokAccountManager />
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function SettingsDataSourceForm({
  competitors,
  settings,
}: {
  competitors: CompetitorRow[];
  settings: PublicSettings;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<CompetitorForm>(emptyCompetitor);
  const [status, setStatus] = useState("");

  // Legacy settings form (YouTube, general)
  const [legacyForm, setLegacyForm] = useState({
    youtubeApiKey: "",
    youtubeApiBaseUrl: settings.youtubeApiBaseUrl ?? "",
    metaGraphToken: "",
    facebookEmail: settings.facebookEmail ?? "",
    facebookPassword: "",
    facebookBaseUrl: settings.facebookBaseUrl ?? "",
    facebookLoginUrl: settings.facebookLoginUrl ?? "",
  });

  // ─── Tab state ─────────────────────────────────────────────────────
  const tabs = [
    { id: "competitors", label: "Đối thủ", icon: Users },
    { id: "youtube", label: "YouTube", icon: Play },
    { id: "tiktok", label: "TikTok", icon: Radio },
    { id: "facebook", label: "Facebook", icon: BarChart3 },
    { id: "general", label: "Chung", icon: Globe },
  ] as const;
  type TabId = (typeof tabs)[number]["id"];
  const [activeTab, setActiveTab] = useState<TabId>("competitors");

  const tabClass = (id: TabId) =>
    `inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition ${
      activeTab === id
        ? "bg-kolia-green text-white shadow-sm"
        : "bg-white text-slate-600 hover:bg-slate-100 border border-kolia-line"
    }`;

  const grouped = useMemo(
    () =>
      competitors.reduce<Record<string, CompetitorRow[]>>((acc, competitor) => {
        acc[competitor.platform] = acc[competitor.platform] ?? [];
        acc[competitor.platform].push(competitor);
        return acc;
      }, {}),
    [competitors]
  );

  // ─── Competitor CRUD ───────────────────────────────────────────────
  const selectCompetitor = (id: string) => {
    setSelectedId(id);
    const competitor = competitors.find((item) => item.id === id);
    if (competitor) {
      setForm({
        id: competitor.id,
        name: competitor.name,
        platform: competitor.platform,
        source: competitor.source,
        segmentation: competitor.segmentation ?? "",
        category: competitor.category,
        topicDescription: competitor.topicDescription ?? "",
        channelUrl: competitor.channelUrl,
        avatarUrl: competitor.avatarUrl ?? "",
      });
    } else {
      setForm(emptyCompetitor);
    }
  };

  const saveCompetitor = () => {
    startTransition(async () => {
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `/api/competitors/${form.id}` : "/api/competitors";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setStatus(form.id ? "Đã cập nhật đối thủ" : "Đã thêm đối thủ mới");
      router.refresh();
    });
  };

  const deleteCompetitor = () => {
    if (!form.id) return;
    startTransition(async () => {
      await fetch(`/api/competitors/${form.id}`, { method: "DELETE" });
      setForm(emptyCompetitor);
      setSelectedId("");
      setStatus("Đã xóa đối thủ");
      router.refresh();
    });
  };

  // ─── Legacy settings save (YouTube, general) ───────────────────────
  const saveLegacySettings = (tab?: string) => {
    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(legacyForm),
      });
      setLegacyForm((prev) => ({ ...prev, facebookPassword: "" }));
      setStatus("✅ Đã lưu cấu hình");
      setTimeout(() => setStatus(""), 3000);
      router.refresh();
    });
  };

  // ─── Provider config save ──────────────────────────────────────────
  const saveProviderConfig = (config: PlatformCrawlConfig, platform: string) => {
    startTransition(async () => {
      await fetch("/api/settings/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          activeProvider: config.activeProvider,
          playwright: config.playwright,
          apify: config.apify,
          socialCrawler: config.socialCrawler,
        }),
      });
      router.refresh();
    });
  };

  const testConnection = () => {
    startTransition(async () => {
      const response = await fetch("/api/settings/test", { method: "POST" });
      const result = await response.json();
      setStatus(
        result.checks
          .map((item: { name: string; status: string }) => `${item.name}: ${item.status}`)
          .join(" · ")
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* ─── Tab bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={tabClass(tab.id)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Tab: Đối thủ ─────────────────────────────────────────── */}
      {activeTab === "competitors" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <SectionCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-kolia-ink">Danh sách đối thủ đang theo dõi</h2>
                <p className="text-sm text-slate-500">
                  Seed sẵn theo YouTube, TikTok, Facebook; có thể thêm/sửa/xóa.
                </p>
              </div>
              <select
                value={selectedId}
                onChange={(e) => selectCompetitor(e.target.value)}
                className="h-10 rounded-lg border border-kolia-line px-3 text-sm"
              >
                <option value="">Thêm đối thủ mới</option>
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.platform} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              {Object.entries(grouped).map(([platform, rows]) => (
                <div key={platform} className="rounded-xl border border-kolia-line bg-slate-50 p-4">
                  <h3 className="font-bold capitalize text-kolia-ink">{platform}</h3>
                  <div className="mt-3 space-y-2">
                    {rows.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => selectCompetitor(c.id ?? "")}
                        className="block w-full rounded-lg border border-transparent bg-white p-3 text-left text-sm hover:border-kolia-green transition"
                      >
                        <span className="font-semibold text-kolia-ink">{c.name}</span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {c.source} · {c.category}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard>
            <h2 className="text-lg font-bold text-kolia-ink">
              {form.id ? "Sửa đối thủ" : "Thêm đối thủ"}
            </h2>
            <div className="mt-4 space-y-4">
              <Field
                label="Tên đối thủ"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Nền tảng</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className={inputClass}
                  >
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Nguồn</span>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className={inputClass}
                  >
                    <option value="trong_nuoc">Trong nước</option>
                    <option value="nuoc_ngoai">Nước ngoài</option>
                  </select>
                </label>
              </div>
              <Field
                label="Segmentation"
                value={form.segmentation}
                onChange={(v) => setForm({ ...form, segmentation: v })}
              />
              <Field
                label="Category"
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
              />
              <Field
                label="Topic description"
                value={form.topicDescription}
                onChange={(v) => setForm({ ...form, topicDescription: v })}
              />
              <Field
                label="Channel URL"
                value={form.channelUrl}
                onChange={(v) => setForm({ ...form, channelUrl: v })}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveCompetitor}
                  disabled={isPending || !form.name || !form.channelUrl}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-kolia-green px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" /> Lưu
                </button>
                <button
                  type="button"
                  onClick={deleteCompetitor}
                  disabled={isPending || !form.id}
                  className="inline-flex items-center justify-center rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {status && (
                <p className="rounded-lg bg-kolia-mint px-3 py-2 text-sm font-semibold text-kolia-green">
                  {status}
                </p>
              )}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ─── Tab: YouTube ─────────────────────────────────────────── */}
      {activeTab === "youtube" && (
        <SectionCard>
          <div className="flex items-center gap-2 mb-1">
            <Play className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-bold text-kolia-ink">YouTube Configuration</h2>
          </div>
          <p className="text-sm text-slate-500">API key và endpoint URL cho YouTube Data API v3.</p>
          <div className="mt-6 max-w-lg space-y-4">
            <Field
              label="YouTube API Key"
              type="password"
              value={legacyForm.youtubeApiKey}
              onChange={(v) => setLegacyForm({ ...legacyForm, youtubeApiKey: v })}
              placeholder={settings.hasYoutubeApiKey ? "Đã lưu key" : "Chưa cấu hình"}
            />
            <Field
              label="YouTube API Base URL"
              value={legacyForm.youtubeApiBaseUrl}
              onChange={(v) => setLegacyForm({ ...legacyForm, youtubeApiBaseUrl: v })}
              placeholder="https://www.googleapis.com/youtube/v3 (mặc định)"
            />
            <div className="flex items-center gap-3 pt-2">
              <SaveButton onClick={() => saveLegacySettings("youtube")} isPending={isPending} />
              {status && (
                <span className="text-sm font-semibold text-kolia-green">{status}</span>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ─── Tab: TikTok ──────────────────────────────────────────── */}
      {activeTab === "tiktok" && (
        <PlatformProviderTab
          platform="tiktok"
          providerConfig={settings.tiktokProvider}
          settings={settings}
          isPending={isPending}
          onSave={saveProviderConfig}
        />
      )}

      {/* ─── Tab: Facebook ────────────────────────────────────────── */}
      {activeTab === "facebook" && (
        <PlatformProviderTab
          platform="facebook"
          providerConfig={settings.facebookProvider}
          settings={settings}
          isPending={isPending}
          onSave={saveProviderConfig}
        >
          {/* Facebook credentials cho Playwright fallback */}
          <SectionCard>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-bold text-kolia-ink">Thông tin đăng nhập</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                Dùng cho Playwright
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Email/password cho Playwright. Nên dùng tài khoản phụ để tránh rủi ro khoá tài khoản chính.
            </p>
            <div className="max-w-lg space-y-4">
              <Field
                label="Facebook Email / SĐT"
                value={legacyForm.facebookEmail}
                onChange={(v) => setLegacyForm({ ...legacyForm, facebookEmail: v })}
                placeholder={settings.hasFacebookCredentials ? "Đã lưu email" : "Chưa cấu hình"}
              />
              <Field
                label="Facebook Password"
                type="password"
                value={legacyForm.facebookPassword}
                onChange={(v) => setLegacyForm({ ...legacyForm, facebookPassword: v })}
                placeholder={settings.hasFacebookCredentials ? "Đã lưu (nhập để đổi)" : "Chưa cấu hình"}
              />
              <Field
                label="Facebook Base URL"
                value={legacyForm.facebookBaseUrl}
                onChange={(v) => setLegacyForm({ ...legacyForm, facebookBaseUrl: v })}
                placeholder="https://www.facebook.com (mặc định)"
              />
              <Field
                label="Facebook Login URL"
                value={legacyForm.facebookLoginUrl}
                onChange={(v) => setLegacyForm({ ...legacyForm, facebookLoginUrl: v })}
                placeholder="https://www.facebook.com/login (mặc định)"
              />
              <SaveButton onClick={() => saveLegacySettings("facebook")} isPending={isPending}>
                Lưu thông tin đăng nhập
              </SaveButton>
            </div>
          </SectionCard>
        </PlatformProviderTab>
      )}

      {/* ─── Tab: Chung ───────────────────────────────────────────── */}
      {activeTab === "general" && (
        <SectionCard>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-5 w-5 text-kolia-green" />
            <h2 className="text-lg font-bold text-kolia-ink">Cấu hình chung</h2>
          </div>
          <p className="text-sm text-slate-500">Token và cấu hình dùng chung cho toàn hệ thống.</p>
          <div className="mt-6 max-w-lg space-y-4">
            <Field
              label="Meta Graph API Token"
              type="password"
              value={legacyForm.metaGraphToken}
              onChange={(v) => setLegacyForm({ ...legacyForm, metaGraphToken: v })}
              placeholder={settings.hasMetaGraphToken ? "Đã lưu token" : "Chưa cấu hình"}
            />
          </div>
          <div className="mt-8 flex items-center gap-3">
            <SaveButton onClick={() => saveLegacySettings("general")} isPending={isPending}>
              Lưu cấu hình
            </SaveButton>
            <button
              type="button"
              onClick={testConnection}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-kolia-line px-5 py-2.5 text-sm font-bold text-kolia-ink transition hover:bg-slate-50"
            >
              <PlugZap className="h-4 w-4" /> Test Connection
            </button>
          </div>
          {status && (
            <p className="mt-4 rounded-lg bg-kolia-mint p-3 text-sm font-semibold text-kolia-green">
              {status}
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}
