import type { Credentials, OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import type { generateReport } from "@/lib/reports";
import { formatDate, formatNumber, formatPercent } from "@/lib/utils";
import { getConfig } from "@/lib/config";

export const googleDocsScopes = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file"
];

type Report = Awaited<ReturnType<typeof generateReport>>;

type GoogleDocBlock = {
  text: string;
  style: "TITLE" | "HEADING_1" | "HEADING_2" | "NORMAL_TEXT";
};

export async function getGoogleConfig() {
  const [clientId, clientSecret, redirectUri] = await Promise.all([
    getConfig("google_client_id"),
    getConfig("google_client_secret"),
    getConfig("google_redirect_uri"),
  ]);
  const missingEnv = [
    !clientId ? "google_client_id" : "",
    !clientSecret ? "google_client_secret" : ""
  ].filter(Boolean);

  return {
    configured: missingEnv.length === 0,
    missingEnv,
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
    redirectUri: redirectUri ?? "http://localhost:3000/api/google/oauth/callback"
  };
}

async function createOAuthClient() {
  const config = await getGoogleConfig();
  if (!config.configured) {
    throw new Error(`Thiếu cấu hình Google OAuth: ${config.missingEnv.join(", ")}`);
  }
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

async function getStoredGoogleTokens(): Promise<Credentials | null> {
  const row = await prisma.setting.findUnique({ where: { key: "googleOAuthTokens" } });
  if (!row?.value) return null;

  try {
    return JSON.parse(row.value) as Credentials;
  } catch {
    return null;
  }
}

async function saveGoogleTokens(tokens: Credentials) {
  const existing = await getStoredGoogleTokens();
  const merged = {
    ...existing,
    ...tokens,
    refresh_token: tokens.refresh_token ?? existing?.refresh_token
  };
  const value = JSON.stringify(merged);

  // Save under both keys so both Google Docs and YouTube publish can use them
  await prisma.setting.upsert({
    where: { key: "googleOAuthTokens" },
    create: { key: "googleOAuthTokens", value },
    update: { value }
  });
  await prisma.setting.upsert({
    where: { key: "youtube_tokens" },
    create: { key: "youtube_tokens", value },
    update: { value }
  });
}

export async function getGoogleAuthUrl(state: string) {
  const client = await createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: googleDocsScopes,
    state
  });
}

export async function handleGoogleOAuthCallback(code: string) {
  const client = await createOAuthClient();
  const { tokens } = await client.getToken(code);
  await saveGoogleTokens(tokens);
}

export async function getGoogleStatus() {
  const config = await getGoogleConfig();
  const tokens = await getStoredGoogleTokens();
  return {
    configured: config.configured,
    missingEnv: config.missingEnv,
    connected: Boolean(tokens?.refresh_token || tokens?.access_token),
    authUrl: "/api/google/oauth/start",
    scopes: googleDocsScopes
  };
}

async function getAuthorizedGoogleClient(): Promise<OAuth2Client> {
  const client = await createOAuthClient();
  const tokens = await getStoredGoogleTokens();
  if (!tokens?.refresh_token && !tokens?.access_token) {
    throw new Error("Google Drive chưa được kết nối. Vui lòng cấp quyền OAuth trước khi xuất Google Docs.");
  }

  client.setCredentials(tokens);
  client.on("tokens", (newTokens) => {
    void saveGoogleTokens(newTokens);
  });
  return client;
}

function reportBlocks(report: Report): GoogleDocBlock[] {
  const competitorLines = report.totalPostsByCompetitor
    .slice(0, 12)
    .map((item) => `• ${item.name}: ${formatNumber(item.posts)} bài/video, tỷ lệ tương tác bình quân ${formatPercent(item.avgEngagement)}`)
    .join("\n");
  const pillarLines = report.topPillars
    .map((item) => `• ${item.name}: ${item.count} bài, tỷ lệ tương tác bình quân ${formatPercent(item.avgEngagement)}`)
    .join("\n");
  const formatLines = report.topFormats
    .map((item) => `• ${item.name}: điểm lan tỏa bình quân ${item.avgVirality.toFixed(1)}`)
    .join("\n");
  const topPostLines = report.topPosts
    .slice(0, 12)
    .map(
      (post) =>
        `• ${post.title}\n  Đối thủ: ${post.competitor.name}. Trụ cột: ${post.contentPillar}. Hook: ${post.hookType}.\n  Link gốc: ${post.postUrl}`
    )
    .join("\n");

  return [
    { style: "TITLE", text: "Kolia Competitor Intelligence Report" },
    {
      style: "NORMAL_TEXT",
      text: `Giai đoạn: ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}\nNền tảng: ${report.platformLabel}\nNguồn đối thủ: ${report.sourceLabel}`
    },
    { style: "HEADING_1", text: "Executive summary" },
    { style: "NORMAL_TEXT", text: report.executiveSummary },
    { style: "HEADING_1", text: "Đối thủ đang làm gì" },
    { style: "NORMAL_TEXT", text: competitorLines || "Chưa có dữ liệu trong phạm vi đã chọn." },
    { style: "HEADING_1", text: "Trụ cột nội dung hiệu quả" },
    { style: "NORMAL_TEXT", text: pillarLines || "Chưa có dữ liệu trong phạm vi đã chọn." },
    { style: "HEADING_1", text: "Định dạng và chủ đề đáng chú ý" },
    { style: "NORMAL_TEXT", text: formatLines || "Chưa có dữ liệu trong phạm vi đã chọn." },
    { style: "HEADING_1", text: "Bài viết/video nổi bật" },
    { style: "NORMAL_TEXT", text: topPostLines || "Chưa có dữ liệu trong phạm vi đã chọn." },
    { style: "HEADING_1", text: "Khoảng trống nội dung cho Kolia" },
    { style: "NORMAL_TEXT", text: report.contentGaps.map((item) => `• ${item}`).join("\n") },
    { style: "HEADING_1", text: "Gợi ý tuyến nội dung tiếp theo" },
    { style: "NORMAL_TEXT", text: report.suggestedContentLines.map((item) => `• ${item}`).join("\n") },
    { style: "HEADING_1", text: "Gợi ý chương trình/minigame/webinar" },
    { style: "NORMAL_TEXT", text: report.suggestedPrograms.map((item) => `• ${item}`).join("\n") },
    { style: "HEADING_2", text: "Lưu ý pháp lý" },
    { style: "NORMAL_TEXT", text: report.legalNote }
  ];
}

function buildBatchUpdateRequests(blocks: GoogleDocBlock[]) {
  const fullText = blocks.map((block) => block.text).join("\n\n");
  const requests: object[] = [
    {
      insertText: {
        location: { index: 1 },
        text: fullText
      }
    }
  ];

  let cursor = 1;
  for (const block of blocks) {
    const startIndex = cursor;
    const endIndex = cursor + block.text.length;
    if (block.style !== "NORMAL_TEXT") {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex, endIndex },
          paragraphStyle: { namedStyleType: block.style },
          fields: "namedStyleType"
        }
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex, endIndex },
          textStyle: { bold: true },
          fields: "bold"
        }
      });
    }
    cursor = endIndex + 2;
  }

  return requests;
}

export async function createGoogleDocsReport(report: Report) {
  const auth = await getAuthorizedGoogleClient();
  const docs = google.docs({ version: "v1", auth });
  const title = `Kolia Competitor Intelligence Report - ${formatDate(new Date())}`;
  const created = await docs.documents.create({
    requestBody: { title }
  });
  const documentId = created.data.documentId;

  if (!documentId) {
    throw new Error("Google Docs API không trả về documentId.");
  }

  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: buildBatchUpdateRequests(reportBlocks(report))
    }
  });

  return {
    documentId,
    title,
    url: `https://docs.google.com/document/d/${documentId}/edit`
  };
}
