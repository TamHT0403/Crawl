# 🤖 Phân Tích Động Cơ Sinh Nội Dung AI PRO & Brand Voice Engine

Tài liệu này phân tích chi tiết mã nguồn quy trình sản xuất nội dung AI 4 bước, cách học giọng thương hiệu (Brand Voice Style Transfer) và công cụ dịch ngôn ngữ tự nhiên sang SQL để hỏi đáp dữ liệu.

---

## 🚀 Động Cơ Sinh Kịch Bản AI Đa Bước (PRO Content Generator)

Công cụ sinh nội dung PRO tại [lib/content-generator-pro.ts](file:///d:/CrawlFacebook/lib/content-generator-pro.ts) sử dụng mô hình thiết kế chuỗi tuần tự (Sequential Chain) thông qua 4 bước gọi OpenAI API độc lập nhằm đảm bảo chất lượng kịch bản:

### Bước 1: RESEARCH (Nghiên cứu thị trường và đối thủ)
*   **Prompt**: Gửi kèm danh sách các bài viết có tương tác cao nhất của đối thủ, phân tích khoảng trống nội dung và snapshot dữ liệu thị trường tài chính thực tế (`fetchMarketSnapshot` từ `lib/marketData.ts`).
*   **Mục tiêu**: Bắt AI phân tích các góc nhìn đối thủ đã làm tốt, tìm ra "lỗ hổng kiến thức" mà thị trường đang thèm khát để lập đề cương nghiên cứu (`researchBrief`).

### Bước 2: OUTLINE (Thiết lập cấu trúc dàn ý)
*   **Prompt**: Nạp đề cương từ Bước 1 cùng cấu trúc định dạng nền tảng chuẩn mực:
    *   **YouTube**: Sử dụng cấu trúc chia đoạn thời gian cụ thể (`YOUTUBE_STRUCTURE`): từ Hook gây tranh luận (00:00 - 01:30) đến Bối cảnh dữ liệu vĩ mô (01:30 - 04:00), Framework phân tích, Case study và Kết luận kèm CTA.
    *   **TikTok**: Sử dụng cấu trúc giật gân ngắn gọn (`TIKTOK_STRUCTURE`), tập trung Hook 3 giây đầu tiên.
    *   **Facebook**: Tập trung cấu trúc phân tích sâu kèm lời bình (Text post).
*   **Mục tiêu**: Trả về dàn ý (`outline`) chi tiết các phân cảnh cần xuất hiện trong video/bài viết.

### Bước 3: DRAFT (Biên soạn kịch bản chi tiết)
*   **Prompt**: Nạp dàn ý của Bước 2 và áp dụng bộ chỉ dẫn kịch bản cao cấp (`PRO_SYSTEM_INSTRUCTIONS`).
*   **Yêu cầu**: Phải viết lời thoại chi tiết 100% bằng tiếng Việt tự nhiên; chèn các thẻ chỉ dẫn quay phim cụ thể như `[TIMESTAMP]`, `[VISUAL]`, `[B-ROLL]`; sử dụng dữ liệu thị trường thời gian thực đã phân tích.
*   **Mục tiêu**: Tạo bản thảo thô hoàn chỉnh (`draftScript`).

### Bước 4: POLISH & QUALITY ASSURANCE (Tối ưu hóa & Hiệu đính)
*   **Prompt**: Bản thảo được đưa qua bước thẩm định cuối cùng của Editor-in-Chief.
*   **Yêu cầu**: Kiểm tra lỗi chính tả, tối ưu tiêu đề SEO, mô tả SEO và xuất ra định dạng phân tách đặc biệt.
*   **Cơ chế bóc tách dữ liệu (Parser)**:
    AI được yêu cầu in ra chuỗi phân tách đặc biệt: `---QUALITY_METRICS---` sau đó in ra một khối JSON thô. Hệ thống bóc tách dữ liệu bằng đoạn code sau:
    ```typescript
    const separator = "---QUALITY_METRICS---";
    const sepIndex = output.indexOf(separator);
    let script: string;
    let metrics: Record<string, unknown> = {};

    if (sepIndex !== -1) {
      script = output.slice(0, sepIndex).trim();
      const metricsRaw = output.slice(sepIndex + separator.length).trim();
      metrics = safeParseJSON(metricsRaw) || {};
    }
    ```
    Hàm `safeParseJSON` sẽ sử dụng regex để tìm cặp dấu ngoặc nhọn `{...}` cuối cùng nếu AI quên hoặc chèn markdown block, đảm bảo không bị crash hệ thống.

---

## 🎯 Trình Tạo Tiêu Đề Và Đánh Giá Hook (Viral Hook Generator)

Hook Generator là một tính năng lõi chạy ngầm trong Bước 4 (Polish) của quy trình PRO:
*   **Cơ chế hoạt động**: AI phân tích bản thảo kịch bản, chấm điểm chất lượng câu mở đầu hiện tại (`hookScore` từ 0 - 10) dựa trên khả năng kích thích sự tò mò và giữ chân người xem trong 3 giây đầu tiên.
*   **Đề xuất Hook thay thế (`alternativeHooks`)**: AI sinh ra 3 phương án giật tít mở đầu khác nhau tương ứng với các định dạng tâm lý khác nhau (ví dụ: Hook cảnh báo rủi ro, Hook dạng câu hỏi gây tò mò, Hook đưa con số giật gân).
*   **Lưu trữ**: Các Hook này được lưu vào bảng `GeneratedContent` dưới dạng trường mảng JSON và hiển thị động trên UI [ContentPromptStudio.tsx](file:///d:/CrawlFacebook/components/ContentPromptStudio.tsx) để marketer lựa chọn thay thế nhanh chóng.

---

## 🎙️ Học Phong Cách Thương Hiệu (Brand Voice Engine)

Mã nguồn tại [lib/brandVoice.ts](file:///d:/CrawlFacebook/lib/brandVoice.ts) điều phối phong cách diễn đạt của AI:
*   **Cache bộ nhớ**: Tránh truy vấn database SQLite liên tục gây trễ (Bottleneck), hệ thống sử dụng cache request-scoped:
    ```typescript
    let brandVoiceCache: BrandVoiceProfile | null | undefined = undefined;
    ```
*   **Tích hợp prompt**: Khi chạy quy trình sinh nội dung, hệ thống lấy Brand Voice từ DB thông qua hàm `getBrandVoice()` rồi chèn vào hướng dẫn hệ thống của OpenAI:
    ```typescript
    const brandVoice = await getBrandVoice();
    const systemInstruction = applyBrandVoicePrompt(brandVoice, platform);
    ```
    Prompt này bắt AI phải tuân thủ nghiêm ngặt văn phong của chuyên gia tài chính Kolia Phan: sử dụng từ ngữ trung lập, không hứa hẹn lợi nhuận, cấu trúc câu gãy gọn và luôn có phần tuyên bố miễn trừ trách nhiệm (Disclaimer) ở cuối video.

---

## 💬 Trình Truy Vấn Ngôn Ngữ Tự Nhiên (Natural Language Query)

Tính năng hỏi đáp dữ liệu tại [lib/nlQuery.ts](file:///d:/CrawlFacebook/lib/nlQuery.ts) giúp người dùng giao tiếp trực tiếp với SQLite bằng tiếng Việt:

1.  **Dịch Ngữ Nghĩa sang SQL**: Gửi câu hỏi của người dùng và toàn bộ schema các bảng (`Competitor`, `Post`) kèm theo chỉ dẫn an toàn đến OpenAI.
2.  **Bộ lọc an toàn dữ liệu (SQL Injection / Data Modification Filter)**:
    Hệ thống kiểm tra nghiêm ngặt câu lệnh SQL do AI trả về bằng biểu thức chính quy để đảm bảo chỉ cho phép câu lệnh truy vấn dữ liệu (`SELECT`), cấm tuyệt đối các hành vi chỉnh sửa cơ sở dữ liệu (`INSERT`, `UPDATE`, `DELETE`, `DROP`):
    ```typescript
    const sql = cleanSQLQuery(aiResponse);
    if (!/^\s*select\s/i.test(sql)) {
      throw new Error("Cảnh báo bảo mật: Chỉ cho phép truy vấn SELECT.");
    }
    if (/union|insert|update|delete|drop|alter|create|write/i.test(sql)) {
      throw new Error("Cảnh báo bảo mật: Phát hiện câu lệnh nguy hiểm bị cấm.");
    }
    ```
3.  **Thực thi thô**: Chạy trực tiếp câu lệnh SQL an toàn thông qua Prisma:
    ```typescript
    const rawData = await prisma.$queryRawUnsafe(sql);
    ```
4.  **Tóm tắt kết quả**: Gửi mảng dữ liệu thô ngược lại cho OpenAI để AI viết câu trả lời phân tích tiếng Việt trôi chảy kèm bảng số liệu cho người dùng.
