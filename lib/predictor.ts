/**
 * Predictive Performance Scoring Engine
 *
 * Dùng AI + historical data để dự đoán hiệu suất content trước khi đăng.
 */

import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import { getFilteredPosts } from "@/lib/analytics";
import type { PredictiveScore, Platform } from "@/lib/types";

/**
 * Dự đoán hiệu suất content dựa trên historical data + AI
 */
export async function predictPerformance(options: {
  platform: Platform;
  title: string;
  script: string;
  mainTopic: string;
  toneOfVoice: string;
  contentType: string;
}): Promise<PredictiveScore> {
  // Lấy historical data để tính baseline
  const similarPosts = await getFilteredPosts({
    platform: options.platform,
    days: 90,
    sortBy: "engagement",
  });

  const platformPosts = similarPosts.filter((p) => p.platform === options.platform);
  const avgViews = platformPosts.length > 0
    ? platformPosts.reduce((s, p) => s + p.views, 0) / platformPosts.length
    : 0;
  const avgEngagement = platformPosts.length > 0
    ? platformPosts.reduce((s, p) => s + p.engagementRate, 0) / platformPosts.length
    : 0;

  // Nếu chưa configure OpenAI → dùng statistical baseline
  if (!await isOpenAIConfigured()) {
    return statisticalPrediction(options, avgViews, avgEngagement, platformPosts.length);
  }

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `Dự đoán hiệu suất content cho nền tảng ${options.platform}:

**Thông tin content**:
- Tiêu đề: ${options.title}
- Chủ đề: ${options.mainTopic}
- Giọng điệu: ${options.toneOfVoice}
- Loại: ${options.contentType}

**Historical data (90 ngày)**:
- Số bài tham khảo: ${platformPosts.length}
- Views trung bình: ${Math.round(avgViews)}
- Engagement rate trung bình: ${(avgEngagement * 100).toFixed(2)}%

Trả về JSON:
{
  "predictedViews": number,
  "predictedEngagement": number (0-1),
  "viralityProbability": number (0-1),
  "bestPostingTime": "string (ví dụ: 08:00-10:00 GMT+7)",
  "confidenceLevel": "high|medium|low",
  "suggestedHashtags": ["tag1", "tag2", ...]
}`;

    const response = await client.responses.create({
      model,
      input: prompt,
      instructions: `Bạn là chuyên gia phân tích content performance cho nền tảng ${options.platform}. Trả lời JSON thuần, không markdown.`,
      max_output_tokens: 500,
    });

    try {
      const jsonMatch = response.output_text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as PredictiveScore;
      }
    } catch {
      // fallback
    }
  } catch (error) {
    console.warn("[predictor] AI prediction failed, using statistical baseline:", error);
  }

  return statisticalPrediction(options, avgViews, avgEngagement, platformPosts.length);
}

function statisticalPrediction(
  options: { platform: Platform; mainTopic: string; contentType: string },
  avgViews: number,
  avgEngagement: number,
  sampleSize: number
): PredictiveScore {
  // Platform multipliers
  const platformMultiplier: Record<string, number> = {
    youtube: 1.0,
    tiktok: 1.3,
    facebook: 0.7,
  };

  const multiplier = platformMultiplier[options.platform] ?? 1.0;
  const baseViews = Math.max(Math.round(avgViews * multiplier), 100);
  const variance = 0.7 + Math.random() * 0.6; // ±30%

  return {
    predictedViews: Math.round(baseViews * variance),
    predictedEngagement: Math.min(avgEngagement * multiplier * variance, 0.5),
    viralityProbability: Math.min(avgEngagement * 2, 1),
    bestPostingTime: options.platform === "youtube"
      ? "08:00-10:00 GMT+7"
      : options.platform === "tiktok"
        ? "19:00-22:00 GMT+7"
        : "11:00-13:00 GMT+7",
    confidenceLevel: sampleSize > 20 ? "medium" : sampleSize > 5 ? "low" : "low",
    suggestedHashtags: generateHashtags(options.mainTopic, options.platform),
  };
}

function generateHashtags(mainTopic: string, platform: Platform): string[] {
  const topicTag = mainTopic.replace(/\s+/g, "");
  const base = [`#${topicTag}`, "#dautu", "#taichinh"];
  if (platform === "youtube") base.push("#taiChinh", "#dauTuThongMinh");
  if (platform === "tiktok") base.push("#tietKiem", "#hocDauTu");
  if (platform === "facebook") base.push("#chienLuocDauTu", "#quanTriTaiChinh");
  return base;
}
