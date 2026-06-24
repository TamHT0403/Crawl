import { Eye, MessageCircle, RadioTower, Users } from "lucide-react";
import { AddYoutubeCompetitorButton } from "@/components/AddYoutubeCompetitorButton";
import { ContentGapPanel } from "@/components/ContentGapPanel";
import { ContentOpportunityChart } from "@/components/ContentOpportunityChart";
import { CompetitorTable } from "@/components/CompetitorTable";
import { FilterBar } from "@/components/FilterBar";
import { MetricCard } from "@/components/MetricCard";
import { PlatformTabs } from "@/components/PlatformTabs";
import { PostTable } from "@/components/PostTable";
import { TopPostCard } from "@/components/TopPostCard";
import { ViralFormulaCard } from "@/components/ViralFormulaCard";
import { getPlatformAnalytics } from "@/lib/analytics";
import { platformLabels } from "@/lib/constants";
import type { AnalyticsFilters, Platform } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export async function PlatformTrackerView({
  platform,
  filters,
  title,
  subtitle
}: {
  platform: Platform;
  filters: AnalyticsFilters;
  title: string;
  subtitle: string;
}) {
  const analytics = await getPlatformAnalytics(platform, filters);
  const ctaPosts = analytics.posts.filter((post) => post.promotionType !== "Không bán hàng").slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">{platformLabels[platform]}</p>
          <h1 className="mt-2 text-3xl font-bold text-kolia-ink">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {platform === "youtube" ? <AddYoutubeCompetitorButton /> : null}
          <PlatformTabs active={platform} />
        </div>
      </div>

      <FilterBar filters={filters} lockPlatform={platform} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Đối thủ đang theo dõi" value={formatNumber(analytics.totalCompetitors)} detail={`Chỉ tính các kênh thuộc ${platformLabels[platform]} trong danh sách đã import.`} icon={<Users className="h-5 w-5" />} />
        <MetricCard title="Nội dung đã thu thập" value={formatNumber(analytics.totalPosts)} detail="Chỉ bao gồm nội dung đã publish, không lấy video đang chờ phát hoặc chưa công khai." icon={<RadioTower className="h-5 w-5" />} />
        <MetricCard title="Lượt xem bình quân / nội dung" value={formatNumber(analytics.avgViewsPerPost)} detail="Đánh giá quy mô tiếp cận trung bình của mỗi nội dung trong phạm vi lọc." icon={<Eye className="h-5 w-5" />} />
        <MetricCard title="Tổng tương tác ghi nhận" value={formatNumber(analytics.totalInteractions)} detail="Tổng like, comment và share để nhận diện chủ đề/kênh cần nghiên cứu sâu hơn." icon={<MessageCircle className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <ContentOpportunityChart data={analytics.topPillars} />
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Nội dung có tỷ lệ người xem tương tác cao</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Tỷ lệ tương tác = (like + comment + share) / lượt xem. Không dùng điểm lan tỏa nội bộ ở phần này.
          </p>
          <div className="mt-4 space-y-3">
            {analytics.topPosts.slice(0, 4).map((post, index) => (
              <TopPostCard key={post.id} post={post} rank={index + 1} />
            ))}
          </div>
        </section>
      </div>

      {platform === "youtube" ? (
        <YouTubeAnalysis analytics={analytics} />
      ) : platform === "tiktok" ? (
        <TikTokAnalysis analytics={analytics} />
      ) : (
        <FacebookAnalysis analytics={analytics} ctaPosts={ctaPosts} />
      )}

      <CompetitorTable summaries={analytics.competitorSummaries} lockPlatform={platform} />
      <PostTable posts={analytics.topPosts} title={`Bảng nội dung nổi bật trên ${platformLabels[platform]} theo trụ cột nội dung, link gốc và phân loại`} />
    </div>
  );
}

function YouTubeAnalysis({ analytics }: { analytics: Awaited<ReturnType<typeof getPlatformAnalytics>> }) {
  const shortCount = analytics.posts.filter((post) => post.format === "short_video").length;
  const longCount = analytics.posts.filter((post) => post.format === "long_video").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Tách video ngắn và video phân tích dài</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded bg-kolia-mint p-4">
              <p className="text-2xl font-bold text-kolia-green">{formatNumber(shortCount)}</p>
              <p className="text-sm text-slate-600">Video ngắn</p>
            </div>
            <div className="rounded bg-kolia-amber p-4">
              <p className="text-2xl font-bold text-kolia-gold">{formatNumber(longCount)}</p>
              <p className="text-sm text-slate-600">Video dài</p>
            </div>
          </div>
        </section>
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Cấu trúc nội dung tạo sức hút từ kênh nước ngoài</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            {analytics.foreignFormula.viralPatterns.map((pattern) => (
              <li key={pattern} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-gold" />
                {pattern}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ContentGapPanel domestic={analytics.domesticGap} />

      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-kolia-ink">Kịch bản video và cấu trúc nội dung có thể học từ YouTube nước ngoài</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Phân tích dựa trên tiêu đề, mô tả, định dạng và chỉ số tương tác; không phải transcript đầy đủ của video.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {analytics.foreignFormula.shortForm.slice(0, 2).map((formula) => (
            <ViralFormulaCard key={formula.sourceUrl} formula={formula} label="Video ngắn" />
          ))}
          {analytics.foreignFormula.longForm.slice(0, 2).map((formula) => (
            <ViralFormulaCard key={formula.sourceUrl} formula={formula} label="Video phân tích dài" />
          ))}
        </div>
      </section>
    </div>
  );
}

function TikTokAnalysis({ analytics }: { analytics: Awaited<ReturnType<typeof getPlatformAnalytics>> }) {
  const tiktokLines = [
    "Tuyến giải thích thị trường vàng dễ hiểu trong 60s.",
    "Tuyến tâm lý nhà đầu tư: FOMO, sợ hãi, kỷ luật vốn.",
    "Tuyến cảnh báo sai lầm phổ biến khi trade vàng/crypto.",
    "Tuyến reaction tin nóng Fed, CPI, BTC, XAU.",
    "Tuyến mini case study: một quyết định giao dịch và bài học rút ra."
  ];

  return (
    <div className="space-y-6">
      <ContentGapPanel domestic={analytics.domesticGap} />
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-kolia-ink">Gợi ý tuyến TikTok cho Kolia</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {tiktokLines.map((line) => (
            <div key={line} className="rounded border border-kolia-line bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-700">
              {line}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-kolia-ink">Video hiệu quả theo từng trụ cột nội dung và công thức triển khai</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {analytics.topByPillar.slice(0, 8).map((group) => (
            <div key={group.pillar} className="rounded border border-kolia-line bg-slate-50 p-4">
              <h3 className="font-bold text-kolia-green">{group.pillar}</h3>
              <div className="mt-3 space-y-3">
                {group.posts.map((post) => (
                  <a key={post.id} href={post.postUrl} target="_blank" rel="noreferrer" className="block rounded bg-white p-3 text-sm hover:text-kolia-green">
                    <span className="font-semibold text-kolia-ink">{post.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Công thức: {post.hookType} → {post.mainTopic} → giải thích ngắn → lời mời theo dõi
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FacebookAnalysis({
  analytics,
  ctaPosts
}: {
  analytics: Awaited<ReturnType<typeof getPlatformAnalytics>>;
  ctaPosts: Awaited<ReturnType<typeof getPlatformAnalytics>>["posts"];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Nhóm lời kêu gọi hành động được dùng nhiều nhất</h2>
          <div className="mt-4 space-y-3">
            {analytics.topPromotionTypes.slice(0, 6).map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded bg-slate-50 px-4 py-3 text-sm">
                <span className="font-semibold text-slate-700">{item.name}</span>
                <span className="font-bold text-kolia-green">{formatNumber(item.count)} bài</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Bài có CTA bán khóa học/room/webinar</h2>
          <div className="mt-4 space-y-3">
            {ctaPosts.map((post) => (
              <a key={post.id} href={post.postUrl} target="_blank" rel="noreferrer" className="block rounded border border-kolia-line p-3 text-sm hover:bg-kolia-mint">
                <span className="font-semibold text-kolia-ink">{post.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{post.competitor.name} · {post.promotionType}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
      <ContentGapPanel domestic={analytics.domesticGap} />
    </div>
  );
}
