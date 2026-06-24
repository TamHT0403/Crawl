import { filtersFromUrl } from "@/lib/apiFilters";
import { getFilteredPosts } from "@/lib/analytics";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const filters = filtersFromUrl(request.url);
  const posts = await getFilteredPosts(filters);
  const rows = [
    [
      "platform",
      "competitor",
      "source",
      "title",
      "contentPillar",
      "promotionType",
      "toneOfVoice",
      "hookType",
      "format",
      "mainTopic",
      "views",
      "likes",
      "comments",
      "shares",
      "engagementRate",
      "viralityScore",
      "postUrl"
    ],
    ...posts.map((post) => [
      post.platform,
      post.competitor.name,
      post.competitor.source,
      post.title,
      post.contentPillar,
      post.promotionType,
      post.toneOfVoice,
      post.hookType,
      post.format,
      post.mainTopic,
      post.views,
      post.likes,
      post.comments,
      post.shares,
      post.engagementRate,
      post.viralityScore,
      post.postUrl
    ])
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=kolia-competitor-posts.csv"
    }
  });
}
