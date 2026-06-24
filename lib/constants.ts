import type { Platform, SortBy, SourceType } from "@/lib/types";

export const platformLabels: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook"
};

export const sourceLabels: Record<SourceType, string> = {
  trong_nuoc: "Trong nước",
  nuoc_ngoai: "Nước ngoài"
};

export const contentPillars = [
  "Cập nhật thị trường",
  "Phân tích vĩ mô",
  "Phân tích kỹ thuật",
  "Giáo dục đầu tư cơ bản",
  "Case study giao dịch",
  "Tâm lý đầu tư",
  "Câu chuyện chuyên gia/KOL",
  "Livestream/Webinar",
  "Bán khóa học",
  "Bán room cộng đồng",
  "Minigame/Community engagement",
  "Review sách/tài liệu",
  "Tin nóng",
  "Cảnh báo rủi ro",
  "Phát triển tư duy tài chính"
];

export const promotionTypes = [
  "Không bán hàng",
  "Bán khóa học",
  "Bán room",
  "Webinar",
  "Livestream",
  "Minigame",
  "Lead magnet",
  "Combo/ưu đãi",
  "CTA tư vấn",
  "CTA tham gia cộng đồng",
  "CTA theo dõi kênh"
];

export const toneOfVoices = [
  "Chuyên gia",
  "Cảnh báo",
  "Giáo dục dễ hiểu",
  "Gấp gáp/FOMO",
  "Trấn an",
  "Phản biện",
  "Truyền cảm hứng",
  "Cộng đồng",
  "Bán hàng trực tiếp",
  "Bán hàng mềm"
];

export const hookTypes = [
  "Câu hỏi gây tò mò",
  "Cảnh báo rủi ro",
  "Con số cụ thể",
  "Tin nóng",
  "Góc nhìn trái chiều",
  "Case study",
  "Lời hứa kết quả",
  "Vấn đề phổ biến của nhà đầu tư",
  "So sánh trước/sau",
  "Dự đoán xu hướng"
];

export const formatLabels: Record<string, string> = {
  short_video: "Short video",
  long_video: "Long video",
  livestream: "Livestream",
  carousel: "Carousel",
  image_post: "Image post",
  text_post: "Text post",
  reel: "Reel",
  other: "Khác"
};

export const sortLabels: Record<SortBy, string> = {
  engagement: "Tỷ lệ tương tác cao nhất",
  views: "Lượt xem cao nhất",
  comments: "Bình luận cao nhất",
  newest: "Mới nhất"
};

export const platformOptions = [
  { value: "all", label: "Tất cả nền tảng" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" }
];

export const timeRangeOptions = [
  { value: "7", label: "7 ngày" },
  { value: "30", label: "30 ngày" },
  { value: "90", label: "90 ngày" },
  { value: "3650", label: "Khoảng tùy chỉnh" }
];
