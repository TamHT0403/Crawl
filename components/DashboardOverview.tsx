import type { ReactNode } from "react";
import { Activity, BarChart3, Compass, LineChart, RadioTower, Target, Users, Zap } from "lucide-react";
import { CompetitorTable } from "@/components/CompetitorTable";
import { ContentPillarChart } from "@/components/ContentPillarChart";
import { FilterBar } from "@/components/FilterBar";
import { PlatformEffectivenessBubbleChart } from "@/components/PlatformEffectivenessBubbleChart";
import { PostTable } from "@/components/PostTable";
import { TopPostCard } from "@/components/TopPostCard";
import { getContentGapAnalytics, getOverviewAnalytics } from "@/lib/analytics";
import { platformLabels } from "@/lib/constants";
import type { AnalyticsFilters, Platform } from "@/lib/types";
import { formatNumber, formatPercent } from "@/lib/utils";

type DashboardOverviewProps = {
  filters: AnalyticsFilters;
};

export async function DashboardOverview({ filters }: DashboardOverviewProps) {
  const [overview, contentGap] = await Promise.all([
    getOverviewAnalytics(filters),
    getContentGapAnalytics(filters)
  ]);

  const leadingPlatform = overview.platformEffectiveness
    .slice()
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.totalInteractions - a.totalInteractions)[0];
  const mostActivePlatform = overview.platformEffectiveness
    .slice()
    .sort((a, b) => b.postCount - a.postCount)[0];
  const watchlist = overview.competitorSummaries
    .slice()
    .sort((a, b) => b.totalInteractions - a.totalInteractions || b.avgVirality - a.avgVirality)
    .slice(0, 5);
  const researchPriorities = buildResearchPriorities(overview, contentGap);

  return (
    <div className="space-y-6">
      <section className="border-b border-kolia-line pb-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Social intelligence overview</p>
            <h1 className="mt-2 max-w-4xl text-3xl font-bold leading-tight text-kolia-ink">
              Bức tranh nghiên cứu đối thủ trên YouTube, TikTok và Facebook
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
              Dashboard này giúp đội marketing nhìn nhanh đối thủ đang tạo nội dung gì, nền tảng nào đang có lực kéo,
              trụ cột nội dung nào đáng học hỏi và khoảng trống nào Kolia có thể khai thác theo hướng giáo dục đầu tư
              trung lập, minh bạch.
            </p>
          </div>
          <div className="grid min-w-[260px] gap-2 rounded border border-kolia-line bg-white p-4 text-sm shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Nền tảng hiệu quả nhất</span>
              <strong className="text-kolia-green">{leadingPlatform ? platformName(leadingPlatform.platform) : "Chưa có dữ liệu"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Nền tảng đăng nhiều nhất</span>
              <strong className="text-kolia-ink">{mostActivePlatform ? platformName(mostActivePlatform.platform) : "Chưa có dữ liệu"}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Trụ cột nổi bật</span>
              <strong className="max-w-[150px] truncate text-right text-kolia-gold">{overview.topPillars[0]?.name ?? "Chưa có dữ liệu"}</strong>
            </div>
          </div>
        </div>
      </section>

      <FilterBar filters={filters} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Đối thủ đang theo dõi"
          value={formatNumber(overview.totalCompetitors)}
          detail="Tổng số kênh/page trong phạm vi lọc, gồm nguồn trong nước và nước ngoài."
          icon={<Users className="h-5 w-5" />}
        />
        <MetricCard
          title="Nội dung đã thu thập"
          value={formatNumber(overview.totalPosts)}
          detail="Bài viết/video đã được chuẩn hóa theo nền tảng, định dạng, chủ đề và lời kêu gọi hành động."
          icon={<RadioTower className="h-5 w-5" />}
        />
        <MetricCard
          title="Tỷ lệ tương tác bình quân"
          value={formatPercent(overview.avgEngagement)}
          detail="Đo sức hút tương đối của nội dung dựa trên lượt thích, bình luận, chia sẻ và lượt xem."
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <MetricCard
          title="Tổng tương tác ghi nhận"
          value={formatNumber(overview.totalInteractions)}
          detail="Tín hiệu tổng hợp để nhận diện đối thủ và chủ đề đang kéo được sự chú ý thị trường."
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      <PlatformEffectivenessBubbleChart data={overview.platformEffectiveness} />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-kolia-mint text-kolia-green">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-kolia-ink">Nhận định nhanh cho người làm research</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Các điểm dưới đây được rút từ sản lượng nội dung, tương tác và phân bố chủ đề trong tập dữ liệu hiện tại.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {researchPriorities.map((item) => (
              <div key={item.title} className="rounded border border-kolia-line bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 text-kolia-green" />
                  <h3 className="font-bold text-kolia-ink">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Đối thủ cần theo dõi sát</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Ưu tiên theo tổng tương tác, điểm lan tỏa và mức độ đều đặn nội dung.
          </p>
          <div className="mt-4 space-y-3">
            {watchlist.map((item, index) => (
              <div key={item.competitor.id} className="rounded border border-kolia-line bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-kolia-gold">#{index + 1} · {platformName(item.competitor.platform)}</p>
                    <a href={item.competitor.channelUrl} target="_blank" rel="noreferrer" className="mt-1 block font-bold text-kolia-ink hover:text-kolia-green">
                      {item.competitor.name}
                    </a>
                  </div>
                  <span className="rounded bg-white px-2 py-1 text-xs font-bold text-kolia-green">
                    {formatPercent(item.avgEngagement)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-white p-2">
                    <p className="font-bold text-kolia-ink">{formatNumber(item.postCount)}</p>
                    <p className="text-slate-500">bài/video</p>
                  </div>
                  <div className="rounded bg-white p-2">
                    <p className="font-bold text-kolia-ink">{formatNumber(item.totalInteractions)}</p>
                    <p className="text-slate-500">tương tác</p>
                  </div>
                  <div className="rounded bg-white p-2">
                    <p className="font-bold text-kolia-gold">{item.avgVirality.toFixed(1)}</p>
                    <p className="text-slate-500">lan tỏa</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Trụ cột đang nổi bật: <strong>{item.topPillar}</strong>
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <ContentPillarChart data={overview.topPillars} />
        <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-kolia-ink">Nội dung thắng cần phân tích sâu</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Mở từng link để bóc tách hook, cấu trúc lập luận, bằng chứng và lời kêu gọi hành động.
          </p>
          <div className="mt-4 space-y-3">
            {overview.topPosts.slice(0, 4).map((post, index) => (
              <TopPostCard key={post.id} post={post} rank={index + 1} />
            ))}
          </div>
        </section>
      </div>

      <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-kolia-amber text-kolia-gold">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-kolia-ink">Khoảng trống có thể chuyển thành tuyến nội dung Kolia</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Tập trung vào chủ đề có tín hiệu tương tác tốt nhưng chưa bị nhiều đối thủ khai thác sâu.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <InsightList title="Chủ đề bị lặp lại nhiều" items={contentGap.domestic.repeatedTopics.slice(0, 3)} />
          <InsightList title="Tín hiệu tốt nhưng còn ít bên làm" items={contentGap.domestic.underusedHighEngagement.slice(0, 3)} />
          <InsightList title="Hướng Kolia nên thử nghiệm" items={contentGap.domestic.suggestions.slice(0, 3)} />
        </div>
      </section>

      <CompetitorTable summaries={overview.competitorSummaries} />

      <PostTable
        posts={overview.topPosts}
        title="Top bài viết/video cần lưu vào thư viện nghiên cứu, kèm link gốc và phân loại nội dung"
      />
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-kolia-ink">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded bg-kolia-mint text-kolia-green">{icon}</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
    </section>
  );
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded border border-kolia-line bg-slate-50 p-4">
      <h3 className="font-bold text-kolia-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-green" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildResearchPriorities(
  overview: Awaited<ReturnType<typeof getOverviewAnalytics>>,
  contentGap: Awaited<ReturnType<typeof getContentGapAnalytics>>
) {
  const topPlatform = overview.platformEffectiveness
    .slice()
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.totalInteractions - a.totalInteractions)[0];
  const highPotentialPillar = overview.topPillars[0];
  const topFormat = overview.topFormats[0];
  const topTopic = overview.topTopics[0];
  const domesticGap = contentGap.domestic.underusedHighEngagement[0] ?? contentGap.domestic.gaps[0];

  return [
    {
      title: "Nền tảng có lực kéo",
      body: topPlatform
        ? `${platformName(topPlatform.platform)} đang có tỷ lệ tương tác bình quân ${topPlatform.avgEngagement.toFixed(2)}%. Đây là nơi nên bóc tách cách mở vấn đề, nhịp đăng và cách dẫn người xem sang cộng đồng/học tập.`
        : "Chưa đủ dữ liệu để kết luận nền tảng có lực kéo rõ ràng.",
      icon: LineChart
    },
    {
      title: "Trụ cột cần học công thức",
      body: highPotentialPillar
        ? `${highPotentialPillar.name} đang đứng đầu theo hiệu quả tương tác. Nên lưu lại các ví dụ tốt để chuẩn hóa hook, luận điểm và bằng chứng thị trường.`
        : "Chưa có trụ cột nội dung nổi bật trong phạm vi lọc hiện tại.",
      icon: Zap
    },
    {
      title: "Định dạng đáng ưu tiên",
      body: topFormat
        ? `${topFormat.name} đang cho tín hiệu hiệu quả tốt. Kolia nên thử nghiệm cùng chủ đề giáo dục đầu tư, tránh diễn đạt như khuyến nghị cá nhân.`
        : "Chưa có đủ dữ liệu để xác định định dạng ưu tiên.",
      icon: BarChart3
    },
    {
      title: "Khoảng trống có thể khai thác",
      body: domesticGap
        ? domesticGap
        : topTopic
          ? `${topTopic.name} là chủ đề đang có tín hiệu, cần so sánh thêm với nội dung hiện có của Kolia để tìm góc triển khai khác biệt.`
          : "Cần thu thập thêm dữ liệu để xác định khoảng trống nội dung rõ ràng.",
      icon: Target
    }
  ];
}

function platformName(platform: string) {
  return platformLabels[platform as Platform] ?? platform;
}
