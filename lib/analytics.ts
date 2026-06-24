import type { Competitor, Post } from "@prisma/client";
import { contentPillars } from "@/lib/constants";

import { prisma } from "@/lib/prisma";
import { hasPublicYoutubeApiKey } from "@/lib/publicYoutubeData";
import type { AnalyticsFilters, Platform, SortBy, SourceType } from "@/lib/types";
import { daysAgo } from "@/lib/utils";

export type PostWithCompetitor = Post & { competitor: Competitor };

function toCompetitorSummary(competitor: Competitor) {
  return {
    id: competitor.id,
    name: competitor.name,
    platform: competitor.platform,
    source: competitor.source,
    segmentation: competitor.segmentation,
    category: competitor.category,
    topicDescription: competitor.topicDescription,
    channelUrl: competitor.channelUrl,
    avatarUrl: competitor.avatarUrl
  };
}

function cleanFilter<T extends string>(value?: T | "all") {
  return !value || value === "all" ? undefined : value;
}

function sortOrder(sortBy?: SortBy) {
  if (sortBy === "views") return { views: "desc" as const };
  if (sortBy === "comments") return { comments: "desc" as const };
  if (sortBy === "newest") return { publishedAt: "desc" as const };
  return { engagementRate: "desc" as const };
}

export async function getFilteredPosts(filters: AnalyticsFilters = {}, limit?: number): Promise<PostWithCompetitor[]> {
  const platform = cleanFilter(filters.platform);
  const source = cleanFilter(filters.source);
  const days = filters.days ?? 90;
  const startDate = daysAgo(days);

  const platformCondition = platform
    ? platform.includes(",")
      ? { in: platform.split(",") as Platform[] }
      : platform
    : undefined;

  return prisma.post.findMany({
    where: {
      ...(platformCondition ? { platform: platformCondition } : {}),
      ...(filters.contentPillar ? { contentPillar: filters.contentPillar } : {}),
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.promotionType ? { promotionType: filters.promotionType } : {}),
      publishedAt: { gte: startDate },
      competitor: {
        ...(source ? { source } : {})
      }
    },
    include: { competitor: true },
    orderBy: sortOrder(filters.sortBy),
    ...(limit ? { take: limit } : {})
  });
}

export async function getCompetitors(filters: Pick<AnalyticsFilters, "platform" | "source"> = {}) {
  const platform = cleanFilter(filters.platform);
  const source = cleanFilter(filters.source);
  return prisma.competitor.findMany({
    where: {
      ...(platform ? { platform } : {}),
      ...(source ? { source } : {})
    },
    orderBy: [{ platform: "asc" }, { source: "asc" }, { name: "asc" }]
  });
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {});
}

export function aggregatePosts(posts: PostWithCompetitor[], field: keyof Post) {
  const grouped = groupBy(posts, (post) => String(post[field] ?? "Khác"));
  return Object.entries(grouped)
    .map(([name, group]) => ({
      name,
      count: group.length,
      avgEngagement: average(group.map((post) => post.engagementRate)),
      avgVirality: average(group.map((post) => post.viralityScore)),
      totalViews: group.reduce((sum, post) => sum + post.views, 0)
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.count - a.count);
}

export function competitorSummaries(posts: PostWithCompetitor[], competitors: Competitor[]) {
  const grouped = groupBy(posts, (post) => post.competitorId);
  return competitors
    .map((competitor) => {
      const group = grouped[competitor.id] ?? [];
      const sortedByDate = group.slice().sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      return {
        competitor: toCompetitorSummary(competitor),
        postCount: group.length,
        avgEngagement: average(group.map((post) => post.engagementRate)),
        avgVirality: average(group.map((post) => post.viralityScore)),
        totalViews: group.reduce((sum, post) => sum + post.views, 0),
        totalInteractions: group.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0),
        topPillar: aggregatePosts(group, "contentPillar")[0]?.name ?? "Chưa có dữ liệu",
        latestPublishedAt: sortedByDate[0]?.publishedAt.toISOString() ?? null
      };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement || b.postCount - a.postCount);
}

/**
 * Lấy top N bài viết có tỷ lệ tương tác cao nhất, không phân chia theo đối thủ.
 */
function topPostsPerCompetitor(posts: PostWithCompetitor[], _unused = 5, maxTotal = 100): PostWithCompetitor[] {
  return posts
    .slice()
    .sort((a, b) => b.engagementRate - a.engagementRate || b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, maxTotal);
}

function platformEffectiveness(posts: PostWithCompetitor[]) {
  const platforms: Platform[] = ["youtube", "tiktok", "facebook"];
  const grouped = groupBy(posts, (post) => post.platform);
  const totalPosts = Math.max(posts.length, 1);

  const rows = platforms.map((platform) => {
    const group = grouped[platform] ?? [];
    const postShare = (group.length / totalPosts) * 100;
    const avgEngagement = average(group.map((post) => post.engagementRate)) * 100;
    const totalInteractions = group.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0);
    const avgVirality = average(group.map((post) => post.viralityScore));

    return {
      platform,
      postCount: group.length,
      postShare: Number(postShare.toFixed(1)),
      avgEngagement: Number(avgEngagement.toFixed(2)),
      totalInteractions,
      avgVirality: Number(avgVirality.toFixed(1))
    };
  });

  const avgShare = average(rows.map((row) => row.postShare));
  const avgEngagement = average(rows.map((row) => row.avgEngagement));

  return rows.map((row) => {
    const decision =
      row.postShare >= avgShare && row.avgEngagement >= avgEngagement
        ? "Ưu tiên mở rộng"
        : row.postShare >= avgShare && row.avgEngagement < avgEngagement
          ? "Cần tối ưu chất lượng"
          : row.postShare < avgShare && row.avgEngagement >= avgEngagement
            ? "Cơ hội thử nghiệm"
            : "Theo dõi thêm";
    const insight =
      decision === "Ưu tiên mở rộng"
        ? "Nền tảng đang có cả độ phủ nội dung và hiệu quả tương tác tốt, nên ưu tiên nhân rộng tuyến nội dung thắng."
        : decision === "Cần tối ưu chất lượng"
          ? "Sản lượng nội dung cao nhưng tỷ lệ tương tác chưa tương xứng, cần rà lại hook, định dạng và lời kêu gọi hành động."
          : decision === "Cơ hội thử nghiệm"
            ? "Số bài chưa nhiều nhưng tín hiệu tương tác tốt, phù hợp để thử thêm ngân sách nội dung và lịch đăng đều hơn."
            : "Tín hiệu hiện tại còn mỏng, nên tiếp tục theo dõi trước khi tăng nguồn lực.";

    return { ...row, decision, insight };
  });
}

export async function getOverviewAnalytics(filters: AnalyticsFilters = {}) {
  const [posts, competitors] = await Promise.all([
    getFilteredPosts(filters),
    getCompetitors({ platform: filters.platform, source: filters.source })
  ]);

  const totalInteractions = posts.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0);
  const platformPostCounts = aggregatePosts(posts, "platform").map((item) => ({
    platform: item.name,
    posts: item.count
  }));
  const avgEngagementByPlatform = aggregatePosts(posts, "platform").map((item) => ({
    platform: item.name,
    engagement: Number((item.avgEngagement * 100).toFixed(2))
  }));

  return {
    totalCompetitors: competitors.length,
    totalPosts: posts.length,
    avgEngagement: average(posts.map((post) => post.engagementRate)),
    avgVirality: average(posts.map((post) => post.viralityScore)),
    totalInteractions,
    topPosts: topPostsPerCompetitor(posts, 20, 200),
    topPillars: aggregatePosts(posts, "contentPillar").slice(0, 8),
    topFormats: aggregatePosts(posts, "format").slice(0, 8),
    topTopics: aggregatePosts(posts, "mainTopic").slice(0, 8),
    platformPostCounts,
    avgEngagementByPlatform,
    platformEffectiveness: platformEffectiveness(posts),
    competitorSummaries: competitorSummaries(posts, competitors),
    weeklyActivities: posts
      .slice()
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 14)
  };
}

function buildDomesticGap(posts: PostWithCompetitor[]) {
  const domesticPosts = posts.filter((post) => post.competitor.source === "trong_nuoc");
  const pillarStats = aggregatePosts(domesticPosts, "contentPillar");
  const overallAvg = average(domesticPosts.map((post) => post.engagementRate));
  const counts = pillarStats.map((item) => item.count).sort((a, b) => a - b);
  const medianCount = counts[Math.floor(counts.length / 2)] ?? 0;

  const overused = pillarStats
    .filter((item) => item.count > medianCount && item.avgEngagement <= overallAvg)
    .slice(0, 4)
    .map((item) => `${item.name} đang xuất hiện dày nhưng hiệu quả chỉ quanh mức trung bình.`);

  const underusedHighEngagement = pillarStats
    .filter((item) => item.count <= Math.max(2, medianCount) && item.avgEngagement >= overallAvg)
    .slice(0, 4)
    .map((item) => `${item.name} có tương tác tốt nhưng chưa nhiều bên khai thác sâu.`);

  const missingPillars = contentPillars
    .filter((pillar) => !pillarStats.some((item) => item.name === pillar))
    .slice(0, 4)
    .map((pillar) => `${pillar} gần như chưa xuất hiện trong tập dữ liệu hiện tại.`);

  return {
    commonTopics: pillarStats.slice(0, 5).map((item) => item.name),
    repeatedTopics: overused.length ? overused : ["Cập nhật thị trường và tin nóng đang bị lặp lại ở nhiều page/kênh."],
    underusedHighEngagement: underusedHighEngagement.length
      ? underusedHighEngagement
      : ["Case study giao dịch và cảnh báo rủi ro có thể tạo khác biệt nếu Kolia kể bằng dữ liệu rõ ràng."],
    gaps: [
      ...missingPillars,
      "Tuyến giáo dục trung lập về quản trị rủi ro cho người mới còn thiếu chiều sâu.",
      "Tuyến so sánh trước/sau quyết định đầu tư có thể giúp Kolia nổi bật mà không khuyến nghị cá nhân."
    ].slice(0, 6),
    suggestions: [
      "Chuỗi bài 'Giải thích thị trường trong 5 phút' cho vàng, crypto và VN-Index.",
      "Mini case study: một quyết định đúng quy trình dù kết quả ngắn hạn chưa đẹp.",
      "Livestream/Webinar quý: đọc dữ liệu vĩ mô và tự xây kịch bản.",
      "Minigame dự đoán kịch bản thị trường kèm checklist quản trị rủi ro."
    ]
  };
}

function formulaForPost(post: PostWithCompetitor) {
  const isShort = post.format === "short_video" || post.format === "reel";
  const formula = isShort
    ? "Hook mở vấn đề → Căng thẳng thị trường → Giải thích đơn giản → Bằng chứng trực quan → Lưu ý rủi ro và lời mời theo dõi"
    : "Luận điểm chính → Bối cảnh dữ liệu → Khung phân tích → Bằng chứng/case → Kịch bản hành động → Lưu ý rủi ro → Lời mời tham gia học tập";
  const timeline = isShort
    ? [
        {
          time: "0-3s",
          title: "Mở vấn đề",
          script: `Đặt câu hỏi hoặc cảnh báo trực diện xoay quanh ${post.mainTopic.toLowerCase()}, dùng ${post.hookType.toLowerCase()} để kéo sự chú ý ngay từ câu đầu.`,
          role: "Tạo lý do để người xem dừng lại và hiểu vấn đề có liên quan trực tiếp tới quyết định đầu tư."
        },
        {
          time: "3-12s",
          title: "Căng thẳng thị trường",
          script: "Nêu một biến động, dữ kiện vĩ mô hoặc tín hiệu kỹ thuật đang khiến nhà đầu tư phân vân.",
          role: "Biến chủ đề thành bối cảnh có tính thời sự, không chỉ là kiến thức rời rạc."
        },
        {
          time: "12-35s",
          title: "Giải thích trọng tâm",
          script: `Tách vấn đề thành một nguyên tắc dễ hiểu: ${post.contentPillar.toLowerCase()} liên quan gì tới hành vi thị trường.`,
          role: "Giúp người xem nắm được logic phân tích thay vì chỉ nghe kết luận."
        },
        {
          time: "35-50s",
          title: "Bằng chứng trực quan",
          script: "Đưa chart, con số, ví dụ trước/sau hoặc một case ngắn để chứng minh luận điểm.",
          role: "Tăng độ tin cậy và giảm cảm giác đây là nhận định cảm tính."
        },
        {
          time: "50-60s",
          title: "Lưu ý rủi ro và CTA",
          script: "Nhắc người xem tự kiểm tra khẩu vị rủi ro, sau đó mời theo dõi hoặc tham gia buổi live để học thêm.",
          role: "Giữ tinh thần giáo dục, không biến nội dung thành khuyến nghị đầu tư cá nhân."
        }
      ]
    : [
        {
          time: "0:00-1:30",
          title: "Mở luận điểm",
          script: `Giới thiệu thesis chính của video: vì sao ${post.mainTopic.toLowerCase()} đang đáng chú ý trong bối cảnh hiện tại.`,
          role: "Định vị video như một bài phân tích có luận điểm, không phải bản tin rời rạc."
        },
        {
          time: "1:30-4:00",
          title: "Bối cảnh dữ liệu",
          script: "Trình bày dữ liệu nền như Fed, CPI, dòng tiền, cấu trúc giá hoặc hành vi nhà đầu tư.",
          role: "Cho người xem biết luận điểm được đặt trên dữ liệu nào."
        },
        {
          time: "4:00-8:00",
          title: "Khung phân tích",
          script: `Dùng framework 3-5 bước để giải thích ${post.contentPillar.toLowerCase()} và các biến số cần theo dõi.`,
          role: "Biến video thành tài sản giáo dục có thể áp dụng lại."
        },
        {
          time: "8:00-12:00",
          title: "Case/chart minh họa",
          script: "Đưa chart, backtest, case study hoặc so sánh trước/sau để kiểm chứng framework.",
          role: "Tăng tính thuyết phục và giúp người xem nhìn được quy trình phân tích."
        },
        {
          time: "12:00-16:00",
          title: "Kịch bản thị trường",
          script: "Nêu các kịch bản nếu dữ liệu thuận lợi, trung tính hoặc tiêu cực; không chốt một hướng duy nhất.",
          role: "Giữ lập trường trung lập và giúp người xem tự xây kịch bản."
        },
        {
          time: "16:00-18:00",
          title: "Lưu ý rủi ro và CTA mềm",
          script: "Tổng kết điều cần theo dõi, nhắc giới hạn của phân tích và mời xem webinar hoặc tải checklist.",
          role: "Chuyển đổi nhẹ nhàng sang cộng đồng/học tập mà không tạo cảm giác bán hàng trực diện."
        }
      ];

  return {
    title: post.title,
    competitor: post.competitor.name,
    format: post.format,
    sourceUrl: post.postUrl,
    formula,
    timeline,
    vietnamized: isShort
      ? "Kolia có thể Việt hóa bằng cách mở với một rủi ro quen thuộc của nhà đầu tư cá nhân, giải thích bằng dữ liệu vàng/crypto/VN-Index, rồi chốt bằng lời mời theo dõi buổi phân tích thị trường."
      : "Kolia có thể Việt hóa thành video phân tích chuyên sâu: luận điểm vĩ mô, dữ liệu kiểm chứng, kịch bản thị trường và lưu ý pháp lý rõ ràng."
  };
}

function buildForeignFormula(posts: PostWithCompetitor[]) {
  const foreignYoutube = posts.filter((post) => post.platform === "youtube" && post.competitor.source === "nuoc_ngoai");
  const topShort = foreignYoutube
    .filter((post) => post.format === "short_video")
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .slice(0, 4)
    .map(formulaForPost);
  const topLong = foreignYoutube
    .filter((post) => post.format !== "short_video")
    .sort((a, b) => b.viralityScore - a.viralityScore)
    .slice(0, 4)
    .map(formulaForPost);

  return {
    viralPatterns: [
      "Mở bằng một căng thẳng thị trường rõ ràng: Fed, CPI, nhịp giảm mạnh, breakout hoặc sai lầm phổ biến của nhà đầu tư.",
      "Đơn giản hóa luận điểm bằng framework 3-5 bước thay vì dồn quá nhiều chỉ báo vào cùng một video.",
      "Luôn có bằng chứng trực quan: chart, so sánh trước/sau, backtest hoặc dữ liệu vĩ mô.",
      "Kết thúc bằng lời mời học tiếp: theo dõi kênh, tải checklist, xem webinar; không ép người xem ra quyết định đầu tư."
    ],
    shortForm: topShort.length ? topShort : foreignYoutube.slice(0, 2).map(formulaForPost),
    longForm: topLong.length ? topLong : foreignYoutube.slice(0, 2).map(formulaForPost),
    koliaFormats: [
      "Video ngắn 60 giây: 'Một dữ kiện vĩ mô ảnh hưởng giá vàng như thế nào?'",
      "Video phân tích 12-18 phút: luận điểm vĩ mô → dữ liệu → kịch bản → rủi ro.",
      "Tổng hợp sau livestream: 5 biểu đồ quan trọng trong tuần, mời tham gia cộng đồng học tập.",
      "Carousel Facebook: khung đọc tin nóng mà không rơi vào FOMO."
    ]
  };
}

export async function getContentGapAnalytics(filters: AnalyticsFilters = {}) {
  const posts = await getFilteredPosts({ ...filters, platform: filters.platform ?? "all" });
  return {
    domestic: buildDomesticGap(posts),
    foreign: buildForeignFormula(posts)
  };
}

export async function getPlatformAnalytics(platform: Platform, filters: AnalyticsFilters = {}) {
  const scopedFilters = { ...filters, platform };
  const [posts, competitors] = await Promise.all([
    getFilteredPosts(scopedFilters),
    getCompetitors({ platform, source: filters.source })
  ]);
  const domesticGap = buildDomesticGap(posts);
  const foreignFormula = buildForeignFormula(posts);
  const totalViews = posts.reduce((sum, post) => sum + post.views, 0);
  const totalInteractions = posts.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0);

  return {
    platform,
    totalCompetitors: competitors.length,
    totalPosts: posts.length,
    avgEngagement: average(posts.map((post) => post.engagementRate)),
    totalViews,
    totalInteractions,
    avgViewsPerPost: posts.length ? totalViews / posts.length : 0,
    competitorSummaries: competitorSummaries(posts, competitors),
    topPosts: topPostsPerCompetitor(posts, 20, 500),
    topPillars: aggregatePosts(posts, "contentPillar").slice(0, 10),
    topFormats: aggregatePosts(posts, "format").slice(0, 10),
    topPromotionTypes: aggregatePosts(posts, "promotionType").slice(0, 10),
    topTopics: aggregatePosts(posts, "mainTopic").slice(0, 10),
    topByPillar: contentPillars
      .map((pillar) => ({
        pillar,
        posts: posts.filter((post) => post.contentPillar === pillar).slice(0, 3)
      }))
      .filter((item) => item.posts.length > 0),
    domesticGap,
    foreignFormula,
    posts
  };
}

export function parseAnalyticsFilters(searchParams: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const getValue = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    platform: getValue("platform") as Platform | "all" | undefined,
    days: Number(getValue("days") ?? 90),
    source: getValue("source") as SourceType | "all" | undefined,
    contentPillar: getValue("contentPillar") || undefined,
    format: getValue("format") || undefined,
    promotionType: getValue("promotionType") || undefined,
    sortBy: (getValue("sortBy") as SortBy | undefined) ?? "engagement"
  };
}
