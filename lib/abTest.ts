/**
 * A/B Content Test Simulator
 *
 * So sánh 2 phiên bản content (title/hook) và dự đoán phiên bản nào hiệu quả hơn.
 */

import { isOpenAIConfigured, getOpenAIClient, getOpenAIModel } from "@/lib/openai";
import type { Platform } from "@/lib/types";

export type ABTestResult = {
  winner: "A" | "B" | "tie";
  winnerTitle: string;
  confidence: number; // 0-1
  reasons: string[];
  predictedAdvantage: string; // Ví dụ: "+23% engagement"
  suggestions: string[]; // Cải thiện cho version thua
};

export type ABTestInput = {
  platform: Platform;
  versionA: { title: string; hook?: string; mainTopic?: string };
  versionB: { title: string; hook?: string; mainTopic?: string };
  context?: string; // Market context
};

/**
 * So sánh A/B content và dự đoán kết quả
 */
export async function simulateABTest(input: ABTestInput): Promise<ABTestResult> {
  // Statistical baseline (no AI)
  if (!await isOpenAIConfigured()) {
    return statisticalABTest(input);
  }

  try {
    const client = await getOpenAIClient();
    const model = await getOpenAIModel();

    const prompt = `So sánh 2 phiên bản content cho ${input.platform}:

**Version A**:
- Tiêu đề: ${input.versionA.title}
- Hook: ${input.versionA.hook || "Không có"}
- Chủ đề: ${input.versionA.mainTopic || "Không rõ"}

**Version B**:
- Tiêu đề: ${input.versionB.title}
- Hook: ${input.versionB.hook || "Không có"}
- Chủ đề: ${input.versionB.mainTopic || "Không rõ"}

${input.context ? `**Bối cảnh**: ${input.context}` : ""}

**Nhiệm vụ**: Dự đoán version nào sẽ có engagement cao hơn trên ${input.platform}.

Trả về JSON:
{
  "winner": "A" | "B" | "tie",
  "winnerTitle": "tiêu đề version thắng",
  "confidence": 0.0-1.0,
  "reasons": ["lý do 1", "lý do 2", "lý do 3"],
  "predictedAdvantage": "dự đoán % lợi thế, ví dụ: +15% engagement",
  "suggestions": ["cải thiện 1", "cải thiện 2"]
}`;

    const response = await client.responses.create({
      model,
      input: prompt,
      instructions: "Bạn là chuyên gia A/B testing content. Trả lời JSON thuần, không markdown.",
      max_output_tokens: 500,
    });

    const jsonMatch = response.output_text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        winner: parsed.winner || "tie",
        winnerTitle: parsed.winnerTitle || (parsed.winner === "A" ? input.versionA.title : input.versionB.title),
        confidence: parsed.confidence || 0.5,
        reasons: parsed.reasons || [],
        predictedAdvantage: parsed.predictedAdvantage || "Không rõ",
        suggestions: parsed.suggestions || [],
      };
    }
  } catch (error) {
    console.warn("[ab-test] AI failed, using statistical:", error);
  }

  return statisticalABTest(input);
}

function statisticalABTest(input: ABTestInput): ABTestResult {
  // Simple heuristic: compare title length, question marks, number hooks
  const scoreA = scoreTitle(input.versionA.title, input.platform);
  const scoreB = scoreTitle(input.versionB.title, input.platform);

  if (scoreA > scoreB) {
    return {
      winner: "A",
      winnerTitle: input.versionA.title,
      confidence: 0.6 + Math.min(Math.abs(scoreA - scoreB) * 0.05, 0.3),
      reasons: [
        scoreA > scoreB ? "Version A có cấu trúc title tối ưu hơn" : "",
        input.versionA.title.length < input.versionB.title.length
          ? "Title A ngắn gọn hơn, dễ đọc hơn"
          : "",
        input.versionA.hook ? "Version A có hook được định nghĩa rõ ràng" : "",
      ].filter(Boolean),
      predictedAdvantage: `+${Math.round(Math.abs(scoreA - scoreB) * 5)}% engagement`,
      suggestions: [
        "Thêm số liệu cụ thể vào title",
        "Sử dụng câu hỏi để tăng tò mò",
        "Đảm bảo title dưới 60 ký tự",
      ],
    };
  }

  if (scoreB > scoreA) {
    return {
      winner: "B",
      winnerTitle: input.versionB.title,
      confidence: 0.6 + Math.min(Math.abs(scoreB - scoreA) * 0.05, 0.3),
      reasons: [
        "Version B có cấu trúc title tối ưu hơn",
        input.versionB.title.length < input.versionA.title.length
          ? "Title B ngắn gọn hơn, dễ đọc hơn"
          : "",
        input.versionB.hook ? "Version B có hook được định nghĩa rõ ràng" : "",
      ].filter(Boolean),
      predictedAdvantage: `+${Math.round(Math.abs(scoreB - scoreA) * 5)}% engagement`,
      suggestions: [
        "Thêm số liệu cụ thể vào title",
        "Sử dụng câu hỏi để tăng tò mò",
        "Đảm bảo title dưới 60 ký tự",
      ],
    };
  }

  return {
    winner: "tie",
    winnerTitle: "Cả hai phiên bản tương đương",
    confidence: 0.5,
    reasons: ["Cả hai version có cấu trúc title tương tự nhau"],
    predictedAdvantage: "Không có sự khác biệt đáng kể",
    suggestions: ["Thử nghiệm với hook khác nhau", "Thêm con số cụ thể", "Thay đổi độ dài title"],
  };
}

function scoreTitle(title: string, platform: Platform): number {
  let score = 50;

  // Length score
  const len = title.length;
  if (platform === "youtube") {
    if (len >= 30 && len <= 60) score += 15;
    else if (len < 20 || len > 80) score -= 10;
  } else if (platform === "tiktok") {
    if (len >= 20 && len <= 50) score += 15;
    else if (len > 70) score -= 10;
  } else {
    if (len >= 25 && len <= 55) score += 15;
  }

  // Question hook
  if (/\?/.test(title)) score += 10;

  // Number hook
  if (/\d+/.test(title)) score += 12;

  // Emotional words
  if (/đừng|cẩn thận|ngay|khẩn|bất ngờ|sốc|tại sao|cách/i.test(title)) score += 8;

  // Urgency
  if (/ngay|bây giờ|còn|cơ hội cuối/i.test(title)) score += 5;

  // Power words
  if (/bí quyết|chiến lược|framework|hệ thống|tuyệt đỉnh/i.test(title)) score += 5;

  return score;
}
