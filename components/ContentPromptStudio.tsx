"use client";

import { useState, useRef, useCallback, useTransition, useEffect } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Code,
  Copy,
  Eye,
  Loader2,
  MessagesSquare,
  Music2,
  Sparkles,
  TrendingUp,
  Youtube,
  Zap,
  AlertTriangle,
  Star,
  Hash,
} from "lucide-react";
import type { Platform } from "@/lib/types";
import type { MarketSnapshot } from "@/lib/marketData";
import type { TrendIntelligence } from "@/lib/trendIntelligence";

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════════

type GapData = {
  commonTopics: string[];
  repeatedTopics: string[];
  underusedHighEngagement: string[];
  gaps: string[];
  suggestions: string[];
};

type FormulaData = {
  title: string;
  competitor: string;
  format: string;
  sourceUrl: string;
  formula: string;
  vietnamized: string;
};

type LessonPost = {
  title: string;
  competitor: string;
  platform: Platform;
  contentPillar: string;
  hookType: string;
  toneOfVoice: string;
  mainTopic: string;
  sourceUrl: string;
  // Engagement metrics
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  engagementRate?: number;
  viralityScore?: number;
  captionPreview?: string;
};

type StepEvent = {
  step: number;
  stepName: string;
  output: string;
  prompt?: string;
  durationMs: number;
};

type OutputMode = "video" | "post";

type ProResult = {
  items: Array<{
    id: string;
    script: string;
    title: string;
    platform: string;
    contentType: string;
    outputMode?: OutputMode;
    toneOfVoice: string;
    mainTopic: string;
    status: string;
    createdAt: string;
    hookScore?: number;
    retentionRisks?: string[];
    alternativeHooks?: string[];
    seoTitle?: string;
    seoDescription?: string;
    hashtags?: string[];
    qualityChecklist?: Record<string, unknown>;
    titleVariants?: string[];
    researchBrief?: string;
    outline?: string;
    blueprint?: string;
    // QA Gate
    qaGateFailed?: boolean;
    qaGateWarning?: boolean;
    qaGateReason?: string | null;
  }>;
  totalGenerated: number;
};

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const STEP_NAMES = ["Deep Research", "Angle & Blueprint", "Scene Outline", "Script Writer", "QA & Optimize"];

const STEP_DESCRIPTIONS = [
  "Web search + phân tích đối thủ thông minh, chỉ lấy data liên quan nhất...",
  "Chọn góc nhìn độc đáo + thesis statement + hook word-for-word...",
  "Thiết kế từng cảnh/đoạn chi tiết với data points cụ thể...",
  "Viết kịch bản word-for-word, sẵn sàng quay/đăng ngay...",
  "Đánh giá chất lượng khách quan, hook score, SEO, retention risks...",
];

const platformOptions: Array<{
  value: Platform;
  label: string;
  icon: typeof Youtube;
  intent: string;
}> = [
  {
    value: "youtube",
    label: "YouTube",
    icon: Youtube,
    intent:
      "Kịch bản video phân tích có luận điểm, timeline rõ, title và thumbnail đủ dùng cho production.",
  },
  {
    value: "tiktok",
    label: "TikTok",
    icon: Music2,
    intent:
      "Kịch bản video ngắn, mở hook nhanh, dễ dựng, có CTA theo dõi/cộng đồng.",
  },
  {
    value: "facebook",
    label: "Facebook",
    icon: MessagesSquare,
    intent:
      "Bài fanpage/carousel/livestream post có góc nhìn chuyên gia và CTA mềm.",
  },
];



function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ═══════════════════════════════════════════════════════════════════════════
//  COLLAPSIBLE SECTION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: typeof Eye;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="rounded border border-kolia-line bg-slate-50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-3 text-left text-sm font-bold text-kolia-ink hover:bg-slate-100"
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-kolia-green" />
          {title}
        </span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {isOpen && (
        <div className="border-t border-kolia-line p-4">{children}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  QUALITY METRICS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function QualityMetrics({
  outputMode,
  hookScore,
  qualityChecklist,
  retentionRisks,
  alternativeHooks,
  hashtags,
  seoTitle,
  seoDescription,
  titleVariants,
}: {
  outputMode: OutputMode;
  hookScore?: number;
  qualityChecklist?: Record<string, unknown>;
  retentionRisks?: string[];
  alternativeHooks?: string[];
  hashtags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  titleVariants?: string[];
}) {
  if (!hookScore && !alternativeHooks?.length) return null;

  const isVideoMode = outputMode === "video";

  const scoreColor =
    (hookScore ?? 0) >= 8
      ? "text-green-600 bg-green-50 border-green-200"
      : (hookScore ?? 0) >= 6
        ? "text-amber-600 bg-amber-50 border-amber-200"
        : "text-red-600 bg-red-50 border-red-200";

  return (
    <div className="space-y-4">
      {/* Hook Score + Quick Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {hookScore != null && (
          <div
            className={`rounded-lg border p-3 text-center ${scoreColor}`}
          >
            <div className="text-2xl font-extrabold">{hookScore}/10</div>
            <div className="mt-1 text-xs font-bold uppercase tracking-wider">
              Hook Score
            </div>
          </div>
        )}
        {Boolean(qualityChecklist?.estimatedDuration) && (
          <div className="rounded-lg border border-kolia-line bg-white p-3 text-center">
            <div className="text-2xl font-extrabold text-kolia-ink">
              {String(qualityChecklist?.estimatedDuration)}
            </div>
            <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              Thời lượng
            </div>
          </div>
        )}
        {Boolean(qualityChecklist?.hookStrength) && (
          <div className="rounded-lg border border-kolia-line bg-white p-3 text-center">
            <div className="text-2xl font-extrabold text-kolia-ink">
              {String(qualityChecklist?.hookStrength)}
            </div>
            <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              Hook Strength
            </div>
          </div>
        )}
        {qualityChecklist && (
          <div className="rounded-lg border border-kolia-line bg-white p-3">
            <div className="space-y-1 text-xs">
              {qualityChecklist.hasDataPoints != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasDataPoints ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Data Points</span>
                </div>
              )}
              {qualityChecklist.hasVisualCues != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasVisualCues ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Visual Cues</span>
                </div>
              )}
              {qualityChecklist.hasTimestamps != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasTimestamps ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Timestamps</span>
                </div>
              )}
              {qualityChecklist.hasBRollSuggestions != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasBRollSuggestions ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>B-Roll Cues</span>
                </div>
              )}
              {qualityChecklist.hasStrongHeadline != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasStrongHeadline ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Strong Headline</span>
                </div>
              )}
              {qualityChecklist.hasClearParagraphFlow != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasClearParagraphFlow ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Paragraph Flow</span>
                </div>
              )}
              {qualityChecklist.hasActionableTakeaways != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasActionableTakeaways ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Actionable Takeaways</span>
                </div>
              )}
              {qualityChecklist.hasRiskDisclaimer != null && (
                <div className="flex items-center gap-1.5">
                  {qualityChecklist.hasRiskDisclaimer ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>Risk Disclaimer</span>
                </div>
              )}
              {typeof qualityChecklist.readabilityLevel === "string" && qualityChecklist.readabilityLevel && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span>Readability: {qualityChecklist.readabilityLevel}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Title Variants */}
      {titleVariants && titleVariants.length > 0 && (
        <CollapsibleSection title="Title Variants (A/B Test)" icon={Star}>
          <ul className="space-y-2">
            {titleVariants.map((v, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm leading-6 text-slate-700"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-kolia-mint text-xs font-bold text-kolia-green">
                  {i + 1}
                </span>
                {v}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Alternative Hooks */}
      {alternativeHooks && alternativeHooks.length > 0 && (
        <CollapsibleSection title="Hook thay thế" icon={Zap} defaultOpen>
          <ul className="space-y-2">
            {alternativeHooks.map((hook, i) => (
              <li
                key={i}
                className="rounded border border-kolia-line bg-white p-3 text-sm leading-6 text-slate-700"
              >
                <span className="mr-2 font-bold text-kolia-green">
                  Hook {i + 1}:
                </span>
                {hook}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Retention Risks */}
      {retentionRisks && retentionRisks.length > 0 && (
        <CollapsibleSection
          title={`Retention Risks (${retentionRisks.length})`}
          icon={AlertTriangle}
        >
          <ul className="space-y-1">
            {retentionRisks.map((risk, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm leading-6 text-amber-800"
              >
                <AlertTriangle className="mt-1 h-3 w-3 shrink-0 text-amber-500" />
                {risk}
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* SEO + Hashtags */}
      {(seoTitle || hashtags?.length) && (
        <CollapsibleSection title={isVideoMode ? "SEO & Hashtags" : "SEO Social & Hashtags"} icon={Hash}>
          <div className="space-y-3 text-sm">
            {seoTitle && (
              <div>
                <span className="font-bold text-kolia-ink">SEO Title: </span>
                <span className="text-slate-600">{seoTitle}</span>
              </div>
            )}
            {seoDescription && (
              <div>
                <span className="font-bold text-kolia-ink">
                  SEO Description:{" "}
                </span>
                <span className="text-slate-600">{seoDescription}</span>
              </div>
            )}
            {hashtags && hashtags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-kolia-mint px-3 py-1 text-xs font-bold text-kolia-green"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  STEP PROGRESS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function StepProgress({
  steps,
  currentStep,
  isPending,
}: {
  steps: StepEvent[];
  currentStep: number;
  isPending: boolean;
}) {
  const [visiblePrompt, setVisiblePrompt] = useState<number | null>(null);

  return (
    <div className="mt-4 space-y-3">
      {STEP_NAMES.map((name, i) => {
        const stepNum = i + 1;
        const completed = steps.find((s) => s.step === stepNum);
        const isActive = isPending && currentStep === stepNum;
        const isPast = stepNum < currentStep || !!completed;
        const isFuture = !isActive && !isPast && !completed;
        const showPrompt = visiblePrompt === stepNum;

        return (
          <div key={stepNum}>
            <div
              className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
                isActive
                  ? "border-kolia-green bg-kolia-mint"
                  : isPast
                    ? "border-green-200 bg-green-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              {/* Step indicator */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isActive
                    ? "bg-kolia-green text-white"
                    : isPast
                      ? "bg-green-500 text-white"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {isPast ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  stepNum
                )}
              </div>

              {/* Step info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p
                    className={`text-sm font-bold ${
                      isFuture ? "text-slate-400" : "text-kolia-ink"
                    }`}
                  >
                    Bước {stepNum}: {name}
                  </p>
                  <div className="flex items-center gap-2">
                    {completed && completed.prompt && (
                      <button
                        type="button"
                        onClick={() => setVisiblePrompt(showPrompt ? null : stepNum)}
                        className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        <Code className="h-3 w-3" />
                        {showPrompt ? "Ẩn prompt" : "Xem raw prompt"}
                      </button>
                    )}
                    {completed && (
                      <span className="text-xs text-green-600">
                        {(completed.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
                <p
                  className={`mt-0.5 text-xs leading-5 ${
                    isFuture ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {isActive
                    ? STEP_DESCRIPTIONS[i]
                    : isPast
                      ? "Hoàn thành ✓"
                      : STEP_DESCRIPTIONS[i]}
                </p>
              </div>
            </div>

            {/* Raw Prompt */}
            {showPrompt && completed?.prompt && (
              <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                    📝 Raw Prompt — Bước {stepNum}: {completed.stepName}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(completed.prompt || "");
                    }}
                    className="flex items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100"
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </button>
                </div>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded border border-indigo-100 bg-white p-3 font-mono text-[11px] leading-6 text-slate-700">
                  {completed.prompt}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function ContentPromptStudio({
  configured,
  model,
  domestic,
  formulas,
  lessonPosts,
  marketSnapshot,
  trends,
  postCountByPlatform,
}: {
  configured: boolean;
  model: string;
  domestic: GapData;
  formulas: FormulaData[];
  lessonPosts: LessonPost[];
  marketSnapshot: MarketSnapshot | null;
  trends: TrendIntelligence | null;
  postCountByPlatform: Record<string, number>;
}) {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [sources, setSources] = useState<string[]>(["facebook", "youtube", "tiktok"]);
  
  const [dynamicDomestic, setDynamicDomestic] = useState<GapData>(domestic);
  const [dynamicFormulas, setDynamicFormulas] = useState<FormulaData[]>(formulas);
  const [dynamicLessonPosts, setDynamicLessonPosts] = useState<LessonPost[]>(lessonPosts);
  const [dynamicTrends, setDynamicTrends] = useState<TrendIntelligence | null>(trends);
  const [isDataLoading, setIsDataLoading] = useState(false);

  const [selectedGaps, setSelectedGaps] = useState<string[]>([]);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [marketContext, setMarketContext] = useState("");
  const [days, setDays] = useState(30);

  // Fetch data dynamically when sources or days change
  useEffect(() => {
    // Skip if all sources are selected initially and days is default 30, as props already have this data
    if (sources.length === 3 && 
        days === 30 &&
        dynamicDomestic.gaps.length === domestic.gaps.length && 
        dynamicLessonPosts.length === lessonPosts.length) {
      return;
    }

    setIsDataLoading(true);
    const platformParam = sources.length === 0 ? "none" : sources.join(",");
    fetch(`/api/prompt-studio?platform=${platformParam}&days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.domestic) setDynamicDomestic(data.domestic);
        if (data.formulas) setDynamicFormulas(data.formulas);
        if (data.lessonPosts) setDynamicLessonPosts(data.lessonPosts);
        if (data.trends !== undefined) setDynamicTrends(data.trends);
        setIsDataLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching filtered data:", err);
        setIsDataLoading(false);
      });
  }, [sources, days]);

  // Generation state (Auto mode)
  const [isPending, setIsPending] = useState(false);
  const [stepEvents, setStepEvents] = useState<StepEvent[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<ProResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Manual mode state
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [outputMode, setOutputMode] = useState<OutputMode>('video');
  const [sessionId] = useState<string>(() => `session-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [manualCurrentStep, setManualCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [manualPromptText, setManualPromptText] = useState<Record<number, string>>({});
  const [manualSystemInstruction, setManualSystemInstruction] = useState<Record<number, string>>({});
  const [manualResults, setManualResults] = useState<Record<number, { prompt: string; output: string; stepName: string; parsed?: Record<string, unknown> }>>({});
  const [manualLoading, setManualLoading] = useState<Record<number, boolean>>({});
  const [manualReset, setManualReset] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    // Auto-map default by platform but still allows user to override manually.
    setOutputMode(platform === "facebook" ? "post" : "video");
  }, [platform]);

  // ─── Manual Step Helpers ────────────────────────────────────────────────

  const loadManualStepPrompt = useCallback(async (stepNum: 1 | 2 | 3 | 4 | 5) => {
    // Don't reload if already have prompt for this step
    if (manualPromptText[stepNum]) return;

    setManualLoading(prev => ({ ...prev, [stepNum]: true }));
    setManualError(null);

    try {
      const body: Record<string, unknown> = {
        step: stepNum,
        platform,
        outputMode,
        mainTopic: selectedGaps[0] || "Thị trường tài chính",
        sessionId,
        marketContext: marketContext || undefined,
        // Preview-only: build prompt text without executing the AI model (zero token cost)
        previewOnly: true,
      };

      // Fallback context from local results if session cache miss
      if (stepNum >= 2 && manualResults[1]) body.researchBrief = manualResults[1].output;
      if (stepNum >= 3 && manualResults[2]) { body.blueprintRaw = manualResults[2].output; body.blueprintJSON = manualResults[2].parsed || {}; }
      if (stepNum >= 4 && manualResults[3]) { body.sceneOutlineRaw = manualResults[3].output; body.sceneOutlineJSON = manualResults[3].parsed || {}; }
      if (stepNum === 5 && manualResults[4]) body.fullScript = manualResults[4].output;

      const response = await fetch("/api/content/generate-pro/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.error) {
        setManualError(data.error);
        return;
      }

      // Parse prompt into system instruction and user prompt
      const promptText = data.prompt || "";
      const parts = promptText.split("📝 User Prompt");
      const sysInst = parts[0]?.replace("🧠 System Instruction:", "").trim() || "";
      const userPrompt = parts[1] ? "📝 User Prompt" + parts[1] : promptText;

      setManualPromptText(prev => ({ ...prev, [stepNum]: userPrompt }));
      setManualSystemInstruction(prev => ({ ...prev, [stepNum]: sysInst }));

      // Also store the result if the step already ran
      if (data.output) {
        setManualResults(prev => ({
          ...prev,
          [stepNum]: {
            prompt: data.prompt,
            output: data.output,
            stepName: data.stepName,
            parsed: data.parsed,
          },
        }));
      }
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Không thể tải prompt.");
    } finally {
      setManualLoading(prev => ({ ...prev, [stepNum]: false }));
    }
  }, [platform, outputMode, selectedGaps, marketContext, manualResults]);

  const executeManualStep = useCallback(async (stepNum: 1 | 2 | 3 | 4 | 5) => {
    setManualLoading(prev => ({ ...prev, [stepNum]: true }));
    setManualError(null);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        step: stepNum,
        platform,
        outputMode,
        mainTopic: selectedGaps[0] || "Thị trường tài chính",
        sessionId,
        marketContext: marketContext || undefined,
      };

      // Fallback context from local results if session cache miss
      if (stepNum >= 2 && manualResults[1]) body.researchBrief = manualResults[1].output;
      if (stepNum >= 3 && manualResults[2]) { body.blueprintRaw = manualResults[2].output; body.blueprintJSON = manualResults[2].parsed || {}; }
      if (stepNum >= 4 && manualResults[3]) { body.sceneOutlineRaw = manualResults[3].output; body.sceneOutlineJSON = manualResults[3].parsed || {}; }
      if (stepNum === 5 && manualResults[4]) body.fullScript = manualResults[4].output;

      // Pass user-edited prompt if changed
      const currentPrompt = manualPromptText[stepNum];
      const currentSysInst = manualSystemInstruction[stepNum];
      if (currentPrompt) {
        body.overriddenUserPrompt = currentPrompt;
        body.overriddenSystemInstruction = currentSysInst;
      }

      const response = await fetch("/api/content/generate-pro/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (data.error) {
        setManualError(data.error);
        return;
      }

      setManualResults(prev => ({
        ...prev,
        [stepNum]: {
          prompt: data.prompt,
          output: data.output,
          stepName: data.stepName,
          parsed: data.parsed,
        },
      }));

      // For step 1: save prompt text for editing
      if (!manualPromptText[stepNum]) {
        const promptText = data.prompt || "";
        const parts = promptText.split("📝 User Prompt");
        const sysInst = parts[0]?.replace("🧠 System Instruction:", "").trim() || "";
        const userPrompt = parts[1] ? "📝 User Prompt" + parts[1] : promptText;
        setManualPromptText(prev => ({ ...prev, [stepNum]: userPrompt }));
        setManualSystemInstruction(prev => ({ ...prev, [stepNum]: sysInst }));
      }

      // Assemble final result after step 5 completes
      if (stepNum === 5) {
        const step1Out = manualResults[1]?.output || "";
        const step3Out = manualResults[3]?.output || "";
        const step4Out = manualResults[4]?.output || "";
        const step5Metrics = data.parsed || {};

        // Extract title from blueprint (step 2)
        let title = selectedGaps[0] || "Phân tích thị trường";
        try {
          const bp = manualResults[2]?.parsed || {};
          if (bp?.title) title = bp.title as string;
        } catch { /* ignore */ }

        setResult({
          items: [{
            id: `manual-${Date.now()}`,
            platform,
            contentType: platform === "facebook" ? "post" : "script",
            title,
            script: step4Out,
            toneOfVoice: "Chuyên gia",
            mainTopic: selectedGaps[0] || "Thị trường tài chính",
            status: "draft",
            createdAt: new Date().toISOString(),
            hookScore: step5Metrics.hookScore as number | undefined,
            retentionRisks: step5Metrics.retentionRisks as string[] | undefined,
            alternativeHooks: step5Metrics.alternativeHooks as string[] | undefined,
            seoTitle: step5Metrics.seoTitle as string | undefined,
            seoDescription: step5Metrics.seoDescription as string | undefined,
            hashtags: step5Metrics.hashtags as string[] | undefined,
            qualityChecklist: step5Metrics.qualityChecklist as Record<string, unknown> | undefined,
            titleVariants: (manualResults[2]?.parsed?.titleVariants ?? step5Metrics.titleVariants) as string[] | undefined,
            researchBrief: step1Out,
            outline: step3Out,
            blueprint: manualResults[2]?.output,
          }],
          totalGenerated: 1,
        });
      }
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Không thể thực thi bước.");
    } finally {
      setManualLoading(prev => ({ ...prev, [stepNum]: false }));
    }
  }, [platform, outputMode, selectedGaps, marketContext, manualResults, manualPromptText, manualSystemInstruction, sessionId]);

  // Reset manual state when switching to manual mode — KHÔNG tự động gọi API
  useEffect(() => {
    if (mode === 'manual' && !manualReset) {
      setManualReset(true);
      setManualCurrentStep(1);
      setManualPromptText({});
      setManualSystemInstruction({});
      setManualResults({});
      setManualLoading({});
      setManualError(null);
      setResult(null);
    }
  }, [mode]);

  const toggle = (
    value: string,
    list: string[],
    setList: (next: string[]) => void
  ) => {
    setList(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value]
    );
  };

  // ─── SSE-based Generation ──────────────────────────────────────────────

  const submitPrompt = useCallback(async () => {
    // Reset state
    setResult(null);
    setError(null);
    setStepEvents([]);
    setCurrentStep(1);
    setIsPending(true);
    setCopied(false);

    // Abort previous request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/content/generate-pro", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          entries: [
            {
              platform,
              contentType: outputMode === "video" ? "script" : "post",
              outputMode,
              mainTopic: selectedGaps[0] || "Thị trường tài chính",
              toneOfVoice: "Chuyên gia",
            },
          ],
          gapIds: selectedGaps,
          lessonPostIds: dynamicLessonPosts
            .filter((p) => selectedLessons.includes(p.title))
            .map((p) => p.sourceUrl),
          marketContext: marketContext,
          marketSnapshot: marketSnapshot,
          count: 1,
        }),
        signal: controller.signal,
      });

      // Check if SSE response
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        // ─── SSE Mode ──────────────────────────────────────────
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            } else if (line === "" && eventType && eventData) {
              // Process complete event
              try {
                const parsed = JSON.parse(eventData);

                if (eventType === "step") {
                  const stepEvt: StepEvent = {
                    step: parsed.step,
                    stepName: parsed.stepName,
                    output: parsed.output,
                    prompt: parsed.prompt,
                    durationMs: parsed.durationMs,
                  };
                  setStepEvents((prev) => [...prev, stepEvt]);
                  setCurrentStep(parsed.step + 1);
                } else if (eventType === "complete") {
                  setResult(parsed);
                } else if (eventType === "error") {
                  setError(parsed.error || "Lỗi không xác định");
                }
              } catch {
                // Skip malformed JSON
              }
              eventType = "";
              eventData = "";
            }
          }
        }
      } else {
        // ─── JSON Fallback Mode ───────────────────────────────
        const payload = await response.json();
        if (payload.error) {
          setError(payload.error);
        } else if (payload.items?.[0]) {
          setResult(payload);
          // Simulate step completion for UI
          setStepEvents([
            { step: 1, stepName: "Deep Research", output: "", durationMs: 0 },
            { step: 2, stepName: "Angle & Blueprint", output: "", durationMs: 0 },
            { step: 3, stepName: "Scene Outline", output: "", durationMs: 0 },
            { step: 4, stepName: "Script Writer", output: "", durationMs: 0 },
            { step: 5, stepName: "QA & Optimize", output: "", durationMs: 0 },
          ]);
          setCurrentStep(6);
        } else {
          setError("Không thể tạo nội dung.");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(
          err instanceof Error ? err.message : "Không thể gọi Pro Engine."
        );
      }
    } finally {
      setIsPending(false);
    }
  }, [platform, outputMode, selectedGaps, selectedLessons, dynamicLessonPosts, marketContext, marketSnapshot]);

  const handleCopy = () => {
    const text =
      result?.items?.[0]?.script || "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const item = result?.items?.[0];

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <section className="border-b border-kolia-line pb-5">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">
          Content prompt studio
        </p>
        <h1 className="mt-2 max-w-4xl text-3xl font-bold leading-tight text-kolia-ink">
          Biến insight đối thủ thành kịch bản sản xuất nội dung đẳng cấp
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Engine 5 bước chuyên biệt: Deep Research → Angle Blueprint → Scene
          Outline → Script Writer → QA Agent. Mỗi bước là một AI agent riêng,
          chỉ nhận đúng data cần thiết — web search + smart context + word-for-word.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        {/* ─── Sidebar ───────────────────────────────────────────── */}
        <aside className="space-y-4">
          {/* Step 1: Platform */}
          <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-kolia-mint text-kolia-green">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-kolia-ink">
                  1. Chọn kênh triển khai
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Mỗi kênh có cấu trúc prompt và đầu ra khác nhau.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {platformOptions.map((item) => {
                const Icon = item.icon;
                const active = platform === item.value;
                const count = postCountByPlatform[item.value] || 0;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setPlatform(item.value);
                      setSources([item.value]);
                    }}
                    className={`rounded border p-3 text-left transition ${
                      active
                        ? "border-kolia-green bg-kolia-mint text-kolia-ink"
                        : count === 0
                          ? "border-kolia-line bg-slate-50 text-slate-400 opacity-60"
                          : "border-kolia-line bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-bold">
                      <Icon className="h-4 w-4" />
                      {item.label}
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                        count > 0 ? "bg-kolia-mint text-kolia-green" : "bg-slate-100 text-slate-400"
                      }`}>
                        {count} bài
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5">
                      {item.intent}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: Content Gaps */}
          <section className={`rounded border border-kolia-line bg-white p-5 shadow-sm transition ${isDataLoading ? "opacity-50 pointer-events-none" : ""}`}>
            <h2 className="font-bold text-kolia-ink">
              2. Chọn khoảng trống nội dung
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Ưu tiên các khoảng trống có khả năng tạo khác biệt cho Kolia.
            </p>
            <div className="mt-4 space-y-2">
              {[
                ...dynamicDomestic.gaps,
                ...dynamicDomestic.underusedHighEngagement,
                ...dynamicDomestic.suggestions,
              ]
                .slice(0, 10)
                .map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      toggle(item, selectedGaps, setSelectedGaps)
                    }
                    className={`flex w-full items-start gap-3 rounded border p-3 text-left text-sm leading-6 transition ${
                      selectedGaps.includes(item)
                        ? "border-kolia-green bg-kolia-mint text-kolia-ink"
                        : "border-kolia-line bg-slate-50 text-slate-600 hover:bg-white"
                    }`}
                  >
                    <span
                      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selectedGaps.includes(item)
                          ? "border-kolia-green bg-kolia-green text-white"
                          : "border-slate-300"
                      }`}
                    >
                      {selectedGaps.includes(item) ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </span>
                    <span>{item}</span>
                  </button>
                ))}
            </div>
          </section>

          {/* 🔥 Xu hướng đang nổi */}
          {dynamicTrends && (dynamicTrends.hotTopicsThisWeek.length > 0 || dynamicTrends.emergingTrends.length > 0) && (
            <section className={`rounded border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 shadow-sm transition ${isDataLoading ? "opacity-50 pointer-events-none" : ""}`}>
              <h2 className="font-bold text-kolia-ink flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" /> 🔥 Xu hướng đang nổi
              </h2>
              <p className="mt-1 text-sm text-slate-500">Phát hiện tự động từ dữ liệu crawl 7 ngày qua</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {dynamicTrends.hotTopicsThisWeek.slice(0, 4).map((topic) => (
                  <button
                    key={topic.topic}
                    type="button"
                    onClick={() => toggle(topic.topic, selectedGaps, setSelectedGaps)}
                    className={`rounded border p-3 text-left text-sm transition ${
                      selectedGaps.includes(topic.topic)
                        ? "border-orange-400 bg-orange-100 text-kolia-ink"
                        : "border-orange-100 bg-white text-slate-600 hover:bg-orange-50"
                    }`}
                  >
                    <div className="font-bold">{topic.topic}</div>
                    <div className="mt-1 flex gap-3 text-xs text-slate-500">
                      <span>{topic.postCount} bài/tuần</span>
                      <span>Eng: {(topic.avgEngagement * 100).toFixed(1)}%</span>
                    </div>
                  </button>
                ))}
              </div>
              {dynamicTrends.suggestedAngles.length > 0 && (
                <div className="mt-3 space-y-1">
                  {dynamicTrends.suggestedAngles.slice(0, 3).map((angle, i) => (
                    <p key={i} className="text-xs leading-5 text-slate-500">💡 {angle}</p>
                  ))}
                </div>
              )}
            </section>
          )}
        </aside>

        {/* ─── Main Content ──────────────────────────────────────── */}
        <main className="space-y-4">
          {/* Step 3: Lesson Posts with Engagement Data */}
          <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-kolia-ink">
                  3. Chọn bài học từ nội dung đối thủ
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Chọn các pattern đáng học: hook, chủ đề, tone, cách giải thích
                  hoặc công thức nội dung.
                </p>
              </div>
              <span className="rounded bg-kolia-amber px-3 py-2 text-xs font-bold text-kolia-gold">
                {selectedLessons.length} bài học đã chọn
              </span>
            </div>

            {/* Bộ lọc nguồn đối thủ & Thời gian */}
            <div className="mt-4 border-t border-b border-slate-100 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Hiển thị bài đối thủ từ:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {["youtube", "tiktok", "facebook"].map((src) => {
                      const isSelected = sources.includes(src);
                      const count = postCountByPlatform[src] || 0;
                      return (
                        <button
                          key={src}
                          type="button"
                          onClick={() => {
                            setSources((prev) => {
                              if (prev.includes(src)) {
                                if (prev.length === 1) return prev; // Keep at least one
                                return prev.filter((s) => s !== src);
                              } else {
                                return [...prev, src];
                              }
                            });
                          }}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                            isSelected
                              ? "border-kolia-green bg-kolia-mint text-kolia-green"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <span className="capitalize">{src === "youtube" ? "YouTube" : src === "tiktok" ? "TikTok" : "Facebook"}</span>
                          <span className={`rounded-full px-1.5 py-0.2 text-[9px] ${
                            isSelected ? "bg-white text-kolia-green" : "bg-slate-100 text-slate-500"
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                  <span className="text-xs font-bold text-slate-500">Thời gian phân tích:</span>
                  <div className="flex gap-1.5">
                    {[7, 14, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={`rounded px-2 py-1 text-xs font-bold transition ${
                          days === d
                            ? "bg-kolia-green text-white"
                            : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {d} ngày
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {isDataLoading && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-kolia-green" /> Đang cập nhật dữ liệu...
                </div>
              )}
            </div>

            <div className={`mt-4 grid gap-3 lg:grid-cols-2 transition ${isDataLoading ? "opacity-50 pointer-events-none" : ""}`}>
              {dynamicLessonPosts
                .filter((post) => sources.includes(post.platform))
                .sort((a, b) => {
                  if (selectedGaps.length === 0) return 0;
                  const aMatch = selectedGaps.some(g =>
                    a.mainTopic?.toLowerCase().includes(g.toLowerCase().slice(0, 15)) ||
                    a.contentPillar?.toLowerCase().includes(g.toLowerCase().slice(0, 15))
                  ) ? 1 : 0;
                  const bMatch = selectedGaps.some(g =>
                    b.mainTopic?.toLowerCase().includes(g.toLowerCase().slice(0, 15)) ||
                    b.contentPillar?.toLowerCase().includes(g.toLowerCase().slice(0, 15))
                  ) ? 1 : 0;
                  return bMatch - aMatch;
                })
                .slice(0, 8)
                .map((post) => (
                  <button
                    key={`${post.platform}-${post.title}`}
                    type="button"
                    onClick={() =>
                      toggle(post.title, selectedLessons, setSelectedLessons)
                    }
                    className={`rounded border p-4 text-left transition ${
                      selectedLessons.includes(post.title)
                        ? "border-kolia-green bg-kolia-mint"
                        : "border-kolia-line bg-slate-50 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold leading-6 text-kolia-ink">
                        {post.title}
                      </p>
                      {selectedLessons.includes(post.title) ? (
                        <Check className="h-4 w-4 shrink-0 text-kolia-green" />
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-kolia-gold">
                      {post.competitor} · {post.platform}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {post.hookType} · {post.contentPillar} ·{" "}
                      {post.toneOfVoice}
                    </p>
                    {/* Engagement metrics row */}
                    {(post.views != null && post.views > 0) && (
                      <div className="mt-2 flex flex-wrap gap-3 border-t border-kolia-line pt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {formatNumber(post.views ?? 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {((post.engagementRate ?? 0) * 100).toFixed(2)}%
                        </span>
                        {(post.viralityScore ?? 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3 text-amber-500" />
                            {(post.viralityScore ?? 0).toFixed(1)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                ))}
            </div>
          </section>

          {/* Market Context + Formula */}
          <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
              <div>
                <label className="block">
                  <span className="font-bold text-kolia-ink">
                    📊 Bối cảnh thị trường
                  </span>
                  <p className="text-xs text-slate-500 mt-1">Dữ liệu real-time đã tự động cập nhật. Bổ sung thêm context nếu cần.</p>
                </label>
                {/* Market Data Cards */}
                {marketSnapshot && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {marketSnapshot.gold && (
                      <div className="rounded border border-kolia-line bg-gradient-to-br from-yellow-50 to-white p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-yellow-600">Vàng XAU</div>
                        <div className="mt-1 text-lg font-extrabold text-kolia-ink">${marketSnapshot.gold.price.toLocaleString("en-US", {maximumFractionDigits: 0})}</div>
                        {marketSnapshot.gold.change24h != null && (
                          <div className={`text-xs font-bold ${marketSnapshot.gold.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {marketSnapshot.gold.change24h >= 0 ? "+" : ""}{marketSnapshot.gold.change24h.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    )}
                    {marketSnapshot.crypto?.btc && (
                      <div className="rounded border border-kolia-line bg-gradient-to-br from-orange-50 to-white p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-orange-600">Bitcoin</div>
                        <div className="mt-1 text-lg font-extrabold text-kolia-ink">${marketSnapshot.crypto.btc.price.toLocaleString("en-US", {maximumFractionDigits: 0})}</div>
                        <div className={`text-xs font-bold ${marketSnapshot.crypto.btc.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {marketSnapshot.crypto.btc.change24h >= 0 ? "+" : ""}{marketSnapshot.crypto.btc.change24h.toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {marketSnapshot.crypto?.eth && (
                      <div className="rounded border border-kolia-line bg-gradient-to-br from-indigo-50 to-white p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-indigo-600">Ethereum</div>
                        <div className="mt-1 text-lg font-extrabold text-kolia-ink">${marketSnapshot.crypto.eth.price.toLocaleString("en-US", {maximumFractionDigits: 0})}</div>
                        <div className={`text-xs font-bold ${marketSnapshot.crypto.eth.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {marketSnapshot.crypto.eth.change24h >= 0 ? "+" : ""}{marketSnapshot.crypto.eth.change24h.toFixed(1)}%
                        </div>
                      </div>
                    )}
                    {marketSnapshot.vnindex && (
                      <div className="rounded border border-kolia-line bg-gradient-to-br from-emerald-50 to-white p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">VN-Index</div>
                        <div className="mt-1 text-lg font-extrabold text-kolia-ink">{marketSnapshot.vnindex.price.toLocaleString("vi-VN")}</div>
                        <div className={`text-xs font-bold ${marketSnapshot.vnindex.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {marketSnapshot.vnindex.changePercent >= 0 ? "+" : ""}{marketSnapshot.vnindex.changePercent}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Fed & CPI badges */}
                {(marketSnapshot?.fedRate || marketSnapshot?.cpiLatest) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {marketSnapshot?.fedRate && (
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                        🏦 Fed Rate: {marketSnapshot.fedRate.rate}% ({(() => {
                          const parts = marketSnapshot.fedRate.date.split("-");
                          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : marketSnapshot.fedRate.date;
                        })()})
                      </span>
                    )}
                    {marketSnapshot?.cpiLatest && (
                      <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
                        📊 CPI: {marketSnapshot.cpiLatest.value} ({(() => {
                          const parts = marketSnapshot.cpiLatest.date.split("-");
                          return parts.length >= 2 ? `Tháng ${parts[1]}/${parts[0]}` : marketSnapshot.cpiLatest.date;
                        })()})
                      </span>
                    )}
                  </div>
                )}
                {/* News Headlines */}
                {marketSnapshot?.newsHeadlines && marketSnapshot.newsHeadlines.length > 0 && (
                  <div className="mt-2 rounded border border-kolia-line bg-slate-50 p-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">📰 Tin tức tài chính</div>
                    <div className="space-y-1">
                      {marketSnapshot.newsHeadlines.slice(0, 4).map((news, i) => (
                        <p key={i} className="text-xs leading-5 text-slate-600 truncate">
                          <span className="font-bold text-slate-400">[{news.source}]</span> {news.title}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <textarea
                  value={marketContext}
                  onChange={(event) => setMarketContext(event.target.value)}
                  rows={3}
                  placeholder="Bổ sung bối cảnh thêm nếu cần (dữ liệu thị trường đã tự động cập nhật ở trên)..."
                  className="mt-2 w-full rounded border border-kolia-line p-3 text-sm leading-6 outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
                />
              </div>
              <div className={`rounded border border-kolia-line bg-slate-50 p-4 transition ${isDataLoading ? "opacity-50 pointer-events-none" : ""}`}>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-kolia-green" />
                  <h3 className="font-bold text-kolia-ink">
                    Công thức tham chiếu
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {dynamicFormulas[0]?.formula ??
                    "Hook → Market tension → Simple explanation → Visual proof → CTA"}
                </p>
                {dynamicFormulas[0]?.sourceUrl ? (
                  <a
                    href={dynamicFormulas[0].sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-bold text-kolia-green"
                  >
                    Xem ví dụ đối thủ
                  </a>
                ) : null}
              </div>
            </div>
          </section>

          {/* ─── AI Generate Button ─────────────────────────────── */}
          <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-kolia-ink">
                  AI Content Generator Pro
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Engine 5 bước: Deep Research → Blueprint → Scene Outline →
                  Script Writer → QA Agent. Mỗi bước là AI agent riêng biệt.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center rounded-lg border border-kolia-line bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setOutputMode('video')}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      outputMode === 'video'
                        ? 'bg-white text-kolia-ink shadow-sm'
                        : 'text-slate-500 hover:text-kolia-ink'
                    }`}
                  >
                    Video Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutputMode('post')}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      outputMode === 'post'
                        ? 'bg-white text-kolia-ink shadow-sm'
                        : 'text-slate-500 hover:text-kolia-ink'
                    }`}
                  >
                    Post Mode
                  </button>
                </div>

                {/* Mode Toggle */}
                <div className="flex items-center rounded-lg border border-kolia-line bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => { setMode('auto'); setManualReset(false); }}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      mode === 'auto'
                        ? 'bg-white text-kolia-ink shadow-sm'
                        : 'text-slate-500 hover:text-kolia-ink'
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('manual'); }}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
                      mode === 'manual'
                        ? 'bg-white text-kolia-ink shadow-sm'
                        : 'text-slate-500 hover:text-kolia-ink'
                    }`}
                  >
                    Manual
                  </button>
                </div>

                {mode === 'auto' && (
                  <button
                    type="button"
                    onClick={submitPrompt}
                    disabled={!configured || isPending}
                    className="inline-flex items-center gap-2 rounded bg-kolia-ink px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {isPending
                      ? "Đang tạo (5 bước)..."
                      : outputMode === "video"
                        ? "✨ Tạo kịch bản video"
                        : "✨ Tạo bài post chuyên nghiệp"}
                  </button>
                )}
              </div>
            </div>

            {/* Auto Mode: Step Progress */}
            {mode === 'auto' && (isPending || stepEvents.length > 0) && (
              <StepProgress
                steps={stepEvents}
                currentStep={currentStep}
                isPending={isPending}
              />
            )}

            {/* Manual Mode */}
            {mode === 'manual' && (
              <div className="mt-4 space-y-5">
                {[1, 2, 3, 4, 5].map((stepNum) => {
                  const stepResult = manualResults[stepNum];
                  const isCurrent = manualCurrentStep === stepNum;
                  const isPast = stepNum < manualCurrentStep && !!stepResult;
                  const isLocked = stepNum > manualCurrentStep && !stepResult;
                  const isLoading = manualLoading[stepNum];

                  return (
                    <div
                      key={stepNum}
                      className={`rounded-lg border p-4 transition-all ${
                        isCurrent
                          ? 'border-kolia-green bg-kolia-mint/30'
                          : isPast
                            ? 'border-green-200 bg-green-50/50'
                            : isLocked
                              ? 'border-slate-200 bg-slate-50 opacity-50'
                              : stepResult
                                ? 'border-green-200 bg-green-50/50'
                                : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                            isPast || stepResult
                              ? 'bg-green-500 text-white'
                              : isCurrent
                                ? 'bg-kolia-green text-white'
                                : 'bg-slate-200 text-slate-500'
                          }`}>
                            {isPast || stepResult ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              stepNum
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-kolia-ink">
                            Bước {stepNum}: {STEP_NAMES[stepNum - 1]}
                          </h3>
                        </div>
                        {stepResult && (
                          <span className="text-xs text-green-600 font-semibold">
                            ✓ Hoàn thành
                          </span>
                        )}
                      </div>

                      {/* Prompt area */}
                      {isCurrent && (
                        <div className="mt-4 space-y-3">
                          {/* Chưa có prompt → hiển thị nút Generate Prompt */}
                          {!manualPromptText[stepNum] && !isLoading ? (
                            <div className="rounded border border-dashed border-indigo-200 bg-indigo-50/50 p-6 text-center">
                              <p className="text-sm text-indigo-600 font-semibold mb-2">
                                🪄 Bước này chưa có prompt
                              </p>
                              <p className="text-xs text-indigo-400 mb-4">
                                Bấm "Thực thi bước" để AI chạy bước này và sinh
                                prompt + kết quả. Sau đó bạn có thể chỉnh sửa
                                prompt và thực thi lại.
                              </p>
                              <button
                                type="button"
                                onClick={() => executeManualStep(stepNum as 1 | 2 | 3 | 4 | 5)}
                                disabled={!configured || isLoading}
                                className="inline-flex items-center gap-2 rounded bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4" />
                                )}
                                {isLoading ? "Đang chạy bước..." : "⚡ Thực thi bước"}
                              </button>
                              {manualError && (
                                <p className="mt-3 text-xs text-red-500">{manualError}</p>
                              )}
                            </div>
                          ) : (
                            <>
                              <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                                  📝 System Instruction
                                </span>
                                <textarea
                                  value={manualSystemInstruction[stepNum] || ''}
                                  onChange={(e) => setManualSystemInstruction(prev => ({ ...prev, [stepNum]: e.target.value }))}
                                  rows={6}
                                  className="mt-1 w-full rounded border border-indigo-200 bg-white p-3 text-xs leading-5 font-mono text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                />
                              </label>
                              <label className="block">
                                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                                  📝 User Prompt (có thể chỉnh sửa)
                                </span>
                                <textarea
                                  value={manualPromptText[stepNum] || ''}
                                  onChange={(e) => setManualPromptText(prev => ({ ...prev, [stepNum]: e.target.value }))}
                                  rows={10}
                                  className="mt-1 w-full rounded border border-indigo-200 bg-white p-3 text-xs leading-5 font-mono text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                />
                              </label>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => executeManualStep(stepNum as 1 | 2 | 3 | 4 | 5)}
                                  disabled={!configured || isLoading}
                                  className="inline-flex items-center gap-2 rounded bg-kolia-green px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Zap className="h-4 w-4" />
                                  )}
                                  {isLoading ? "Đang xử lý..." : stepResult ? "⚡ Thực thi lại" : "⚡ Thực thi"}
                                </button>
                                {manualError && <p className="text-xs text-red-500">{manualError}</p>}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Output */}
                      {stepResult && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-green-600">
                              📊 Kết quả bước {stepNum}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(stepResult.output);
                              }}
                              className="flex items-center gap-1 rounded border border-green-200 bg-white px-2 py-1 text-[10px] font-semibold text-green-600 hover:bg-green-50"
                            >
                              <Copy className="h-3 w-3" />
                              Copy
                            </button>
                          </div>
                          <div className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-green-100 bg-white p-3 font-mono text-[11px] leading-6 text-slate-700">
                            {stepResult.output}
                          </div>
                        </div>
                      )}

                      {/* Next Step Button */}
                      {isPast && stepNum < 5 && (
                        <button
                          type="button"
                          onClick={() => {
                            // Navigate only — user must explicitly click "Thực thi bước"
                            // to trigger an AI call. loadManualStepPrompt is NOT called here
                            // to avoid silent token consumption on nav clicks.
                            setManualCurrentStep((stepNum + 1) as 1 | 2 | 3 | 4 | 5);
                          }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded border border-kolia-green bg-white px-4 py-2 text-xs font-bold text-kolia-green hover:bg-kolia-mint"
                        >
                          Tiếp tục bước {stepNum + 1}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Show final result after step 5 */}
                      {stepNum === 5 && stepResult && (
                        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                          <p className="text-xs font-bold text-amber-700">✅ Đã hoàn thành tất cả 5 bước!</p>
                          <p className="mt-1 text-xs text-amber-600">Kết quả cuối cùng hiển thị bên dưới phần Đánh giá chất lượng.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-xs leading-5 text-slate-500">
              Model: <strong>{model}</strong> · Dữ liệu tham khảo:{" "}
              <strong>{lessonPosts.length} bài đối thủ</strong> ·{" "}
              {selectedGaps.length} gap · Engine 5 bước: web search + smart context + word-for-word script + QA agent
            </p>
          </section>

          {/* ─── Error Display ──────────────────────────────────── */}
          {error && (
            <section className="rounded border border-red-200 bg-red-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="font-bold text-red-800">Lỗi</p>
                  <p className="mt-1 text-sm leading-6 text-red-700">
                    {error}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ─── Result ──────────────────────────────────────────── */}
          {item && (
            <>
              {/* ─── QA Gate Banner ──────────────────────────────── */}
              {item.qaGateFailed && (
                <section className="rounded border-2 border-red-400 bg-red-50 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-2xl">🚫</span>
                    <div>
                      <h3 className="font-bold text-red-700">QA Gate: Nội dung chưa đạt ngưỡng tối thiểu</h3>
                      <p className="mt-1 text-sm text-red-600">{item.qaGateReason}</p>
                      <p className="mt-2 text-xs text-red-500">
                        Nội dung đã được lưu với trạng thái <code className="rounded bg-red-100 px-1 font-mono">qa_failed</code>.
                        Vui lòng chỉnh sửa hook và thêm data points cụ thể trước khi publish.
                      </p>
                    </div>
                  </div>
                </section>
              )}
              {item.qaGateWarning && !item.qaGateFailed && (
                <section className="rounded border border-amber-400 bg-amber-50 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-2xl">⚠️</span>
                    <div>
                      <h3 className="font-bold text-amber-700">QA Gate: Cần review trước khi publish</h3>
                      <p className="mt-1 text-sm text-amber-600">{item.qaGateReason}</p>
                      <p className="mt-2 text-xs text-amber-500">
                        Nội dung đã lưu với trạng thái <code className="rounded bg-amber-100 px-1 font-mono">qa_warning</code>.
                        Xem xét các Alternative Hooks bên dưới để cải thiện điểm hook.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {/* Quality Metrics */}
              <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 font-bold text-kolia-ink">
                  <Star className="h-5 w-5 text-kolia-green" />
                  Đánh giá chất lượng
                </h2>
                <QualityMetrics
                  outputMode={outputMode}
                  hookScore={item.hookScore}
                  qualityChecklist={item.qualityChecklist}
                  retentionRisks={item.retentionRisks}
                  alternativeHooks={item.alternativeHooks}
                  hashtags={item.hashtags}
                  seoTitle={item.seoTitle}
                  seoDescription={item.seoDescription}
                  titleVariants={item.titleVariants}
                />
              </section>

              {/* Research Brief (Step 1) */}
              {item.researchBrief && (
                <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
                  <CollapsibleSection
                    title="🔍 Step 1: Deep Research Brief"
                    icon={BarChart3}
                  >
                    <div className="whitespace-pre-wrap font-mono text-sm leading-7 text-slate-700">
                      {item.researchBrief}
                    </div>
                  </CollapsibleSection>
                </section>
              )}

              {/* Blueprint (Step 2) */}
              {item.blueprint && (
                <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
                  <CollapsibleSection
                    title="🎯 Step 2: Angle & Blueprint"
                    icon={Sparkles}
                  >
                    <div className="whitespace-pre-wrap font-mono text-sm leading-7 text-slate-700">
                      {item.blueprint}
                    </div>
                  </CollapsibleSection>
                </section>
              )}

              {/* Scene Outline (Step 3) */}
              {item.outline && (
                <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
                  <CollapsibleSection
                    title="📋 Step 3: Scene-by-Scene Outline"
                    icon={Clipboard}
                  >
                    <div className="whitespace-pre-wrap font-mono text-sm leading-7 text-slate-700">
                      {item.outline}
                    </div>
                  </CollapsibleSection>
                </section>
              )}

              {/* Main Script */}
              <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clipboard className="h-5 w-5 text-kolia-green" />
                    <h2 className="font-bold text-kolia-ink">
                      Kịch bản từ Pro Engine
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}{" "}
                    {copied ? "Đã copy!" : "Copy"}
                  </button>
                </div>
                <div className="mt-4 max-h-[800px] overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-4 font-mono text-sm leading-7 text-slate-700">
                  {item.script}
                </div>
              </section>

              {/* Completed Steps Summary (after generation) */}
              {stepEvents.length > 0 && !isPending && (
                <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
                  <h2 className="mb-3 font-bold text-kolia-ink">
                    ⚡ Pipeline hoàn thành
                  </h2>
                  <div className="flex flex-wrap gap-3">
                    {stepEvents.map((evt) => (
                      <div
                        key={evt.step}
                        className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700"
                      >
                        <Check className="h-3 w-3" />
                        {evt.stepName} ·{" "}
                        {(evt.durationMs / 1000).toFixed(1)}s
                      </div>
                    ))}
                    <div className="flex items-center gap-2 rounded-full border border-kolia-green bg-kolia-mint px-3 py-1.5 text-xs font-bold text-kolia-green">
                      Tổng:{" "}
                      {(
                        stepEvents.reduce(
                          (sum, e) => sum + e.durationMs,
                          0
                        ) / 1000
                      ).toFixed(1)}
                      s
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
