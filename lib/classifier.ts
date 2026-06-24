import type { ClassifiedPost, Platform, RawPostInput } from "@/lib/types";
import { calculateEngagementRate, calculateViralityScore } from "@/lib/utils";

const includesAny = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const hasNumberHook = (text: string) => /(\d+[%x]?|\d{2,}|\btop\s?\d+\b)/i.test(text);

export function classifyPost(postTitle: string, caption: string, platform: Platform): ClassifiedPost {
  const title = postTitle.trim();
  const text = `${postTitle} ${caption}`.toLowerCase();

  let mainTopic = "Thị trường tài chính";
  if (includesAny(text, ["vàng", "gold", "xau", "xauusd", "giá vàng", "silver", "bạc"])) mainTopic = "Vàng";
  if (includesAny(text, ["bitcoin", "crypto", "eth", "btc", "binance", "altcoin"])) mainTopic = "Crypto";
  if (includesAny(text, ["fed", "lãi suất", "cpi", "gdp", "inflation", "recession", "vĩ mô", "macro"])) mainTopic = "Vĩ mô";
  if (includesAny(text, ["cổ phiếu", "chứng khoán", "vnindex", "vn-index", "stock", "equity"])) mainTopic = "Chứng khoán";
  if (includesAny(text, ["bất động sản", "real estate", "property"])) mainTopic = "Bất động sản";
  if (includesAny(text, ["rsi", "trendline", "price action", "indicator", "breakout", "elliott", "fibonacci"])) mainTopic = "Phân tích kỹ thuật";
  if (includesAny(text, ["tâm lý", "kỷ luật", "fomo", "sợ hãi", "hoảng loạn", "mindset"])) mainTopic = "Tâm lý đầu tư";

  let contentPillar = "Cập nhật thị trường";
  if (includesAny(text, ["fed", "lãi suất", "cpi", "gdp", "inflation", "vĩ mô", "macro", "suy thoái"])) {
    contentPillar = "Phân tích vĩ mô";
  }
  if (includesAny(text, ["rsi", "trendline", "price action", "indicator", "breakout", "elliott", "fibonacci", "nến"])) {
    contentPillar = "Phân tích kỹ thuật";
  }
  if (includesAny(text, ["là gì", "người mới", "cơ bản", "a-z", "học đầu tư", "beginner", "giải thích"])) {
    contentPillar = "Giáo dục đầu tư cơ bản";
  }
  if (includesAny(text, ["case study", "backtest", "giao dịch này", "trade này", "từ lỗ sang lãi"])) {
    contentPillar = "Case study giao dịch";
  }
  if (includesAny(text, ["tâm lý", "kỷ luật", "fomo", "sợ hãi", "lòng tham", "mindset"])) {
    contentPillar = "Tâm lý đầu tư";
  }
  if (includesAny(text, ["livestream", "live", "webinar", "zoom"])) {
    contentPillar = "Livestream/Webinar";
  }
  if (includesAny(text, ["khóa học", "course", "học viên"])) {
    contentPillar = "Bán khóa học";
  }
  if (includesAny(text, ["tham gia room", "room vip", "room vàng", "cộng đồng chuyên sâu"])) {
    contentPillar = "Bán room cộng đồng";
  }
  if (includesAny(text, ["minigame", "bình luận", "comment", "quà tặng", "giveaway"])) {
    contentPillar = "Minigame/Community engagement";
  }
  if (includesAny(text, ["sách", "book", "review", "tài liệu", "ebook"])) {
    contentPillar = "Review sách/tài liệu";
  }
  if (includesAny(text, ["tin nóng", "breaking", "vừa xảy ra", "khẩn", "cập nhật nhanh"])) {
    contentPillar = "Tin nóng";
  }
  if (includesAny(text, ["đừng", "cẩn thận", "rủi ro", "sập", "hoảng loạn", "mất tiền", "bẫy"])) {
    contentPillar = "Cảnh báo rủi ro";
  }
  if (includesAny(text, ["tư duy", "tài chính cá nhân", "thói quen", "kỷ luật tiền bạc"])) {
    contentPillar = "Phát triển tư duy tài chính";
  }

  let promotionType = "Không bán hàng";
  if (includesAny(text, ["khóa học", "course", "đăng ký học"])) promotionType = "Bán khóa học";
  if (includesAny(text, ["tham gia room", "room vip", "room vàng", "cộng đồng chuyên sâu"])) promotionType = "Bán room";
  if (includesAny(text, ["webinar", "nhận vé", "đăng ký webinar"])) promotionType = "Webinar";
  if (includesAny(text, ["livestream", "live tối nay", "live lúc"])) promotionType = "Livestream";
  if (includesAny(text, ["minigame", "giveaway", "quà tặng"])) promotionType = "Minigame";
  if (includesAny(text, ["ebook", "checklist", "template", "tài liệu miễn phí"])) promotionType = "Lead magnet";
  if (includesAny(text, ["combo", "ưu đãi", "giảm giá", "limited offer"])) promotionType = "Combo/ưu đãi";
  if (includesAny(text, ["inbox", "tư vấn", "để lại số điện thoại"])) promotionType = "CTA tư vấn";
  if (includesAny(text, ["tham gia cộng đồng", "group", "community"])) promotionType = "CTA tham gia cộng đồng";
  if (includesAny(text, ["follow", "theo dõi kênh", "subscribe", "đăng ký kênh"])) promotionType = "CTA theo dõi kênh";

  let toneOfVoice = "Chuyên gia";
  if (includesAny(text, ["đừng", "cẩn thận", "rủi ro", "sập", "hoảng loạn", "bẫy", "mất tiền"])) toneOfVoice = "Cảnh báo";
  if (includesAny(text, ["dễ hiểu", "giải thích", "người mới", "cơ bản", "a-z"])) toneOfVoice = "Giáo dục dễ hiểu";
  if (includesAny(text, ["ngay", "khẩn", "chỉ còn", "đừng bỏ lỡ", "fomo", "cơ hội cuối"])) toneOfVoice = "Gấp gáp/FOMO";
  if (includesAny(text, ["bình tĩnh", "trấn an", "không hoảng loạn", "kiên nhẫn"])) toneOfVoice = "Trấn an";
  if (includesAny(text, ["sai lầm", "sự thật", "không như bạn nghĩ", "phản biện", "myth"])) toneOfVoice = "Phản biện";
  if (includesAny(text, ["hành trình", "truyền cảm hứng", "tự do tài chính", "thành công"])) toneOfVoice = "Truyền cảm hứng";
  if (includesAny(text, ["cộng đồng", "cùng nhau", "anh chị em", "bình luận"])) toneOfVoice = "Cộng đồng";
  if (includesAny(text, ["đăng ký ngay", "mua ngay", "ưu đãi", "combo"])) toneOfVoice = "Bán hàng trực tiếp";
  if (promotionType !== "Không bán hàng" && toneOfVoice === "Chuyên gia") toneOfVoice = "Bán hàng mềm";

  let hookType = "Dự đoán xu hướng";
  if (/^\s*(vì sao|tại sao|how|why|what|làm sao|có nên|điều gì|\?)/i.test(title) || title.includes("?")) hookType = "Câu hỏi gây tò mò";
  if (includesAny(text, ["đừng", "cẩn thận", "rủi ro", "sập", "bẫy", "mất tiền"])) hookType = "Cảnh báo rủi ro";
  if (hasNumberHook(text)) hookType = "Con số cụ thể";
  if (includesAny(text, ["tin nóng", "breaking", "vừa xảy ra", "khẩn"])) hookType = "Tin nóng";
  if (includesAny(text, ["ngược đám đông", "trái chiều", "không như bạn nghĩ", "sự thật"])) hookType = "Góc nhìn trái chiều";
  if (includesAny(text, ["case study", "backtest", "ví dụ thực tế", "trade này"])) hookType = "Case study";
  if (includesAny(text, ["giúp bạn", "cách để", "bí quyết", "lộ trình", "framework"])) hookType = "Lời hứa kết quả";
  if (includesAny(text, ["sai lầm", "vấn đề", "đau đầu", "mắc kẹt"])) hookType = "Vấn đề phổ biến của nhà đầu tư";
  if (includesAny(text, ["trước/sau", "before after", "so sánh"])) hookType = "So sánh trước/sau";

  let format = "other";
  if (platform === "youtube") {
    format = includesAny(text, ["short", "60s", "1 phút", "#shorts"]) ? "short_video" : "long_video";
  }
  if (platform === "tiktok") format = "short_video";
  if (platform === "facebook") {
    format = includesAny(text, ["reel", "video ngắn"]) ? "reel" : "text_post";
    if (includesAny(text, ["carousel", "slide", "album"])) format = "carousel";
    if (includesAny(text, ["infographic", "ảnh", "image"])) format = "image_post";
  }
  if (includesAny(text, ["livestream", "live", "webinar"])) format = "livestream";

  return {
    contentPillar,
    promotionType,
    toneOfVoice,
    hookType,
    format,
    mainTopic
  };
}

export function enrichRawPost(rawPost: RawPostInput): RawPostInput & ClassifiedPost & { engagementRate: number; viralityScore: number } {
  const classified = classifyPost(rawPost.title, rawPost.caption, rawPost.platform);
  const format = rawPost.format ?? classified.format;
  const engagementRate = calculateEngagementRate(rawPost, rawPost.platform);
  const viralityScore = calculateViralityScore(rawPost);
  return {
    ...rawPost,
    ...classified,
    format,
    engagementRate,
    viralityScore
  };
}
