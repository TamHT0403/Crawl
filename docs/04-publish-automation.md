# 📤 Phân Tích Cơ Chế Đăng Bài Tự Động, Xuất Google Docs & Alerts

Tài liệu này phân tích chi tiết các kết nối API đồ thị của Facebook, API tải lên của YouTube, cơ chế dịch Markdown sang Google Docs API và cấu trúc tin nhắn thông báo dạng khối.

---

## 🔗 Đăng Bài Tự Động Đa Kênh (Social Publishing Engine)

### 1. Facebook Page Auto-Publish ([lib/socialPublish.ts](file:///d:/CrawlFacebook/lib/socialPublish.ts))
*   **Phương thức gọi**: Sử dụng Graph API phiên bản `v21.0` gửi yêu cầu `POST` tới endpoint:
    `https://graph.facebook.com/v21.0/{page-id}/feed`
*   **Tham số payload truyền vào**:
    ```typescript
    body: JSON.stringify({
      message: `${input.title}\n\n${input.description}`,
      access_token: accessToken,
      published: input.scheduledAt ? false : true,
      scheduled_publish_time: input.scheduledAt
        ? Math.floor(new Date(input.scheduledAt).getTime() / 1000)
        : undefined,
    })
    ```
    *Giải nghĩa*: Facebook Graph API yêu cầu thời gian lên lịch phải được đổi về định dạng giây (Unix Epoch Timestamp). Tham số `published: false` bắt buộc phải được truyền đi khi muốn lên lịch đăng bài trong tương lai.
*   **Lưu vết**: Lưu URL bài viết thành công: `https://facebook.com/{id_bai_viet}` vào trường `publishedUrl` trong bảng `GeneratedContent`.

### 2. YouTube OAuth & Video Uploader ([lib/youtubePublish.ts](file:///d:/CrawlFacebook/lib/youtubePublish.ts))
*   **Cơ chế xác thực**: Sử dụng `OAuth2` client từ thư viện `google-auth-library` để xử lý token động.
*   **Quản lý Token thông minh**: Token được lưu trong bảng `Setting` dưới khóa `youtube_tokens`. Khi gọi API tải video, hệ thống tự động kiểm tra xem `access_token` đã hết hạn hay chưa để tự động gọi `refreshAccessToken` ngầm trước khi thực hiện upload:
    ```typescript
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials(tokens);
    ```
*   **Upload Video**: Sử dụng `google.youtube("v3").videos.insert` để tải luồng video lên YouTube:
    ```typescript
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: input.title, description: input.description, tags: input.tags },
        status: { privacyStatus: input.privacyStatus || "unlisted" }
      },
      media: { body: fs.createReadStream(videoFilePath) }
    });
    ```

---

## 📝 Cơ Chế Xuất Bản Google Docs ([lib/googleDocs.ts](file:///d:/CrawlFacebook/lib/googleDocs.ts))

Quy trình biên dịch báo cáo Markdown sang tài liệu Google Docs thật trong tài khoản Google Drive của người dùng:

1.  **Khởi tạo tài liệu trống**: Sử dụng `google.docs("v1").documents.create` để tạo file mới và nhận về `documentId`.
2.  **Dịch cú pháp Markdown sang Google Docs API Requests**:
    Vì Google Docs API không nhận trực tiếp chuỗi HTML hay Markdown, hệ thống phải tự bóc tách văn bản thành các mảng thao tác `requests` (Batch Update API):
    *   **Thêm đoạn văn (`insertText`)**: Tạo request chèn văn bản tại vị trí con trỏ cuối cùng (Tính bằng chỉ số index động `currentIndex`).
        ```typescript
        requests.push({
          insertText: { text: block.text + "\n", location: { index: currentIndex } }
        });
        ```
    *   **Gán định dạng Style (`updateParagraphStyle`)**:
        Sau khi chèn text, hệ thống gửi request định vị chỉ số dòng text đó và gán nhãn style (Ví dụ: `TITLE`, `HEADING_1`, `HEADING_2`, hoặc `NORMAL_TEXT`).
        ```typescript
        requests.push({
          updateParagraphStyle: {
            paragraphStyle: { namedStyleType: block.style },
            range: { startIndex: currentIndex, endIndex: currentIndex + block.text.length },
            fields: "namedStyleType"
          }
        });
        ```
3.  **Thực thi Batch**: Gọi `google.docs("v1").documents.batchUpdate` gửi toàn bộ mảng requests lên máy chủ Google để vẽ định dạng văn bản chỉ trong một kết nối duy nhất.

---

## 🔔 Cấu Trúc Bắn Cảnh Báo Alerts & Webhooks ([lib/alerts.ts](file:///d:/CrawlFacebook/lib/alerts.ts))

### 1. Slack Rich Block Notification
Hệ thống không gửi text thường mà đóng gói tin nhắn dạng bố cục khối (Blocks) chuyên nghiệp của Slack:
```typescript
const blocks = [
  {
    type: "header",
    text: { type: "plain_text", text: title.slice(0, 150) }
  },
  {
    type: "section",
    text: { type: "mrkdwn", text: message.slice(0, 3000) }
  }
];
```
Nó tự động thêm khối nút bấm `actions` trỏ thẳng tới link bài viết gốc hoặc giao diện quản lý khi có bài đăng của đối thủ đạt điểm Viral cao.

### 2. Telegram Bot API Call
Gửi tin nhắn định dạng Markdown v2 tới Chat ID của nhóm thông qua Bot Telegram:
```typescript
const url = `https://api.telegram.org/bot${token}/sendMessage`;
await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text: `*${title}*\n\n${message}`,
    parse_mode: "Markdown"
  })
});
```
