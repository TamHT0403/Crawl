import { platformLabels, sourceLabels } from "@/lib/constants";
import { aggregatePosts, competitorSummaries, getCompetitors, getFilteredPosts } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";
import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import type { AnalyticsFilters, Platform, SourceType } from "@/lib/types";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";

/**
 * Generate AI-powered executive summary từ dữ liệu crawl
 */
async function aiExecutiveSummary(
  postsCount: number,
  competitorsCount: number,
  platformLabel: string,
  sourceLabel: string,
  topPillarName: string,
  topFormatName: string,
  days: number,
  topPosts: Array<{ title: string; contentPillar: string; engagementRate: number; competitor: { name: string } }>,
  competitorSummariesData: Array<{ competitor: { name: string }; postCount: number; avgEngagement: number }>
): Promise<string> {
  if (!await isOpenAIConfigured()) {
    // Fallback: template summary
    return `Trong ${days} ngày, hệ thống ghi nhận ${formatNumber(postsCount)} bài/video từ ${formatNumber(
      competitorsCount
    )} đối thủ trên ${platformLabel.toLowerCase()}, nguồn ${sourceLabel.toLowerCase()}. Trụ cột nội dung nổi bật là ${
      topPillarName || "chưa đủ dữ liệu"
    }, trong khi định dạng triển khai hiệu quả nhất là ${topFormatName || "chưa đủ dữ liệu"}.`;
  }

  try {
    const competitorActivity = competitorSummariesData
      .slice(0, 5)
      .map((c) => `${c.competitor.name}: ${c.postCount} bài, engagement ${formatPercent(c.avgEngagement)}`)
      .join("\n");

    const topPostRefs = topPosts
      .slice(0, 5)
      .map((p) => `- "${p.title}" (${p.competitor.name}) — ${p.contentPillar}, engagement ${formatPercent(p.engagementRate)}`)
      .join("\n");

    const prompt = `Phân tích dữ liệu nghiên cứu đối thủ trong ${days} ngày qua:

**Tổng quan**: ${formatNumber(postsCount)} bài từ ${formatNumber(competitorsCount)} đối thủ, ${platformLabel}, ${sourceLabel}.

**Hoạt động đối thủ**:
${competitorActivity}

**Bài viết nổi bật**:
${topPostRefs}

**Trụ cột nội dung chính**: ${topPillarName}
**Định dạng hiệu quả**: ${topFormatName}

Viết executive summary (tiếng Việt có dấu, 3-5 câu) bao gồm:
1. Bức tranh tổng quan về hoạt động nội dung đối thủ
2. Phát hiện chính đáng chú ý
3. Gợi ý chiến lược cho Kolia
4. Lưu ý pháp lý: không khuyến nghị đầu tư cá nhân`;

    const client = await getOpenAIClient();
    const model = await getOpenAIModel();
    const response = await client.responses.create({
      model,
      input: prompt,
      instructions: "Bạn là chuyên gia phân tích content intelligence. Trả lời bằng tiếng Việt có dấu, súc tích, trung lập.",
      max_output_tokens: 500,
    });

    return response.output_text;
  } catch (error) {
    console.warn("[reports] AI executive summary failed, using template:", error);
    return `Trong ${days} ngày, hệ thống ghi nhận ${formatNumber(postsCount)} bài/video từ ${formatNumber(
      competitorsCount
    )} đối thủ trên ${platformLabel.toLowerCase()}, nguồn ${sourceLabel.toLowerCase()}. Trụ cột nội dung nổi bật là ${
      topPillarName || "chưa đủ dữ liệu"
    }, trong khi định dạng triển khai hiệu quả nhất là ${topFormatName || "chưa đủ dữ liệu"}.`;
  }
}

export async function generateReport(filters: AnalyticsFilters = {}) {
  const posts = await getFilteredPosts(filters);
  const competitors = await getCompetitors({ platform: filters.platform, source: filters.source });
  const summaries = competitorSummaries(posts, competitors);
  const topPillars = aggregatePosts(posts, "contentPillar").slice(0, 6);
  const topFormats = aggregatePosts(posts, "format").slice(0, 6);
  const topTopics = aggregatePosts(posts, "mainTopic").slice(0, 6);
  const topPosts = posts.slice(0, 12);
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodEnd.getDate() - (filters.days ?? 90));
  const platformLabel =
    filters.platform && filters.platform !== "all" ? platformLabels[filters.platform as Platform] : "Tất cả nền tảng";
  const sourceLabel =
    filters.source && filters.source !== "all" ? sourceLabels[filters.source as SourceType] : "Tất cả nguồn";

  const contentGaps = [
    "Đối thủ trong nước lặp lại nhiều ở cập nhật thị trường; Kolia nên tạo tuyến giải thích dữ liệu bằng framework rõ ràng.",
    "Nội dung cảnh báo rủi ro có engagement tốt nhưng thường thiếu ví dụ định lượng.",
    "Có khoảng trống cho webinar/recap trung lập: không khuyến nghị mua bán, chỉ hướng dẫn tự xây kịch bản."
  ];
  const suggestedContentLines = [
    "Series TikTok '60 giây hiểu một biến động thị trường'.",
    "YouTube long-form 'Kịch bản vàng tuần này: dữ liệu, xác suất, rủi ro'.",
    "Facebook carousel 'Checklist tránh FOMO trước tin nóng'.",
    "Mini case study giao dịch: đúng quy trình, kiểm soát rủi ro, không thần thánh hóa lợi nhuận."
  ];
  const suggestedPrograms = [
    "Webinar hàng quý: đọc dữ liệu Fed/CPI và ảnh hưởng đến vàng, crypto, chứng khoán.",
    "Minigame cộng đồng: dự đoán kịch bản thị trường kèm giải thích luận điểm.",
    "Lead magnet: checklist quản trị vốn cho người mới."
  ];

  const summary = await aiExecutiveSummary(
    posts.length,
    competitors.length,
    platformLabel,
    sourceLabel,
    topPillars[0]?.name ?? "chưa đủ dữ liệu",
    topFormats[0]?.name ?? "chưa đủ dữ liệu",
    filters.days ?? 90,
    topPosts,
    summaries
  );

  const report = {
    executiveSummary: summary,
    periodStart,
    periodEnd,
    platformLabel,
    sourceLabel,
    competitorActivity: summaries,
    totalPostsByCompetitor: summaries.map((item) => ({
      name: item.competitor.name,
      posts: item.postCount,
      avgEngagement: item.avgEngagement
    })),
    topPillars,
    topFormats,
    topTopics,
    topPosts,
    contentGaps,
    suggestedContentLines,
    suggestedPrograms,
    legalNote:
      "Nội dung chỉ phục vụ mục đích nghiên cứu marketing, không phải khuyến nghị đầu tư cá nhân."
  };

  await prisma.insightReport.create({
    data: {
      platform: filters.platform && filters.platform !== "all" ? filters.platform : "all",
      periodStart,
      periodEnd,
      summary,
      topFormats: JSON.stringify(topFormats),
      topTopics: JSON.stringify(topTopics),
      contentGaps: JSON.stringify(contentGaps),
      suggestedContentLines: JSON.stringify(suggestedContentLines),
      suggestedPrograms: JSON.stringify(suggestedPrograms)
    }
  });

  return report;
}

export function reportToMarkdown(report: Awaited<ReturnType<typeof generateReport>>) {
  const lines = [
    "# Kolia Competitor Intelligence Report",
    "",
    `**Giai đoạn:** ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`,
    `**Nền tảng:** ${report.platformLabel}`,
    `**Nguồn đối thủ:** ${report.sourceLabel}`,
    "",
    "## Executive summary",
    report.executiveSummary,
    "",
    "## Đối thủ đang làm gì",
    ...report.totalPostsByCompetitor.map(
      (item) => `- ${item.name}: ${item.posts} bài/video, tỷ lệ tương tác bình quân ${formatPercent(item.avgEngagement)}`
    ),
    "",
    "## Trụ cột nội dung hiệu quả",
    ...report.topPillars.map((item) => `- ${item.name}: ${item.count} bài, tỷ lệ tương tác bình quân ${formatPercent(item.avgEngagement)}`),
    "",
    "## Định dạng/chủ đề hiệu quả",
    ...report.topFormats.map((item) => `- ${item.name}: điểm lan tỏa bình quân ${item.avgVirality.toFixed(1)}`),
    "",
    "## Top bài viết/video",
    ...report.topPosts.map(
      (post) =>
        `- [${post.title}](${post.postUrl}) - ${post.competitor.name}, trụ cột: ${post.contentPillar}, hook: ${post.hookType}`
    ),
    "",
    "## Content gap cho Kolia",
    ...report.contentGaps.map((item) => `- ${item}`),
    "",
    "## Gợi ý tuyến bài tiếp theo",
    ...report.suggestedContentLines.map((item) => `- ${item}`),
    "",
    "## Gợi ý chương trình/minigame/webinar",
    ...report.suggestedPrograms.map((item) => `- ${item}`),
    "",
    `> ${report.legalNote}`
  ];
  return lines.join("\n");
}
