import { YoutubeTranscript, TranscriptResponse } from "youtube-transcript";
import { getOpenAIClient, getOpenAIModel, isOpenAIConfigured } from "@/lib/openai";

/**
 * Format time in seconds to [MM:SS]
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const padMins = String(mins).padStart(2, "0");
  const padSecs = String(secs).padStart(2, "0");
  return `[${padMins}:${padSecs}]`;
}

/**
 * Fetch and format YouTube video transcript.
 * Supports auto-translation via OpenAI if the transcript is not in Vietnamese.
 */
export async function fetchAndFormatTranscript(
  videoId: string,
  options: {
    format?: "plain_text" | "timestamps";
    autoTranslate?: boolean;
    onLog?: (msg: string) => void;
  } = {}
): Promise<string> {
  const format = options.format || "plain_text";
  const autoTranslate = options.autoTranslate !== false;
  const onLog = options.onLog;

  let transcriptItems: TranscriptResponse[] = [];
  let isVietnameseFetched = false;

  // Step 1: Thử lấy phụ đề tiếng Việt trước
  try {
    onLog?.(`📡 Đang tải phụ đề tiếng Việt trực tiếp cho video ${videoId}...`);
    transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, { lang: "vi" });
    isVietnameseFetched = true;
    onLog?.(`✅ Đã tải phụ đề tiếng Việt thành công.`);
  } catch {
    onLog?.(`⚠️ Không tìm thấy phụ đề tiếng Việt trực tiếp. Thử lấy phụ đề mặc định...`);
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
      onLog?.(`✅ Đã tải phụ đề mặc định.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog?.(`❌ Lỗi tải phụ đề từ YouTube: ${msg}`);
      throw new Error(`Không thể tải phụ đề cho video ${videoId}: ${msg}`);
    }
  }

  if (!transcriptItems || transcriptItems.length === 0) {
    return "";
  }

  // Step 2: Định dạng dữ liệu (Timestamps hoặc Plain Text)
  let formattedText = "";
  if (format === "timestamps") {
    formattedText = transcriptItems
      .map((item) => `${formatTime(item.offset / 1000)} ${item.text}`)
      .join("\n");
  } else {
    // plain_text: Ghép nối các dòng phụ đề lại
    formattedText = transcriptItems.map((item) => item.text).join(" ");
  }

  // Step 3: Dịch tự động bằng OpenAI nếu cần thiết
  if (autoTranslate && !isVietnameseFetched && await isOpenAIConfigured()) {
    try {
      onLog?.(`🤖 Phát hiện phụ đề không phải tiếng Việt. Đang dịch tự động qua OpenAI...`);
      const client = await getOpenAIClient();
      const model = await getOpenAIModel();

      // Cắt bớt văn bản nếu quá dài để tránh quá tải token (khoảng 6000 từ)
      const inputSnippet = formattedText.slice(0, 15000);

      const response = await client.responses.create({
        model,
        input: inputSnippet,
        instructions: `Bạn là trợ lý dịch thuật chuyên nghiệp mảng tài chính/marketing. 
Hãy dịch đoạn phụ đề video YouTube sau đây sang tiếng Việt tự nhiên, giữ nguyên cấu trúc dòng hoặc mốc thời gian nếu có. 
Không thêm lời bình luận, chỉ trả về nội dung đã dịch.`,
        max_output_tokens: 4000,
      });

      if (response.output_text?.trim()) {
        formattedText = response.output_text.trim();
        onLog?.(`✅ Đã dịch phụ đề sang tiếng Việt thành công.`);
      }
    } catch (error) {
      onLog?.(`⚠️ Lỗi dịch tự động bằng OpenAI, giữ nguyên ngôn ngữ gốc: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return formattedText;
}
