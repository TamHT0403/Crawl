# 🏁 Hướng Dẫn Vận Hành Quy Trình (Workflow Quickstart)

Tài liệu này cung cấp hướng dẫn thực hành từng bước từ đầu đến cuối (End-to-End workflow) để vận hành các tính năng cào dữ liệu, phân tích khoảng trống và xuất bản bài viết bằng AI.

---

## 🏃 Kịch Bản Vận Hành 5 Bước Tiêu Chuẩn

### Bước 1: Khởi Chạy Hệ Thống & Kiểm Tra Cấu Hình
1.  Bật terminal và khởi động server cục bộ:
    ```bash
    npm run dev
    ```
2.  Kiểm tra file logs chạy của Next.js trong terminal để đảm bảo server đã lắng nghe thành công tại cổng `3000`.
3.  Truy cập giao diện: [http://localhost:3000/settings](http://localhost:3000/settings).
4.  Điền các khóa API cần thiết: `OpenAI API Key`, và cấu hình tài khoản Facebook/TikTok tại mục quản lý tài khoản để lưu cookie vào SQLite.

### Bước 2: Thêm Đối Thủ Cạnh Tranh (Competitor Registry)
1.  Vào trang quản lý đối thủ tương ứng với nền tảng, ví dụ trang Facebook Tracker (`/facebook`).
2.  Bấm **Thêm đối thủ mới**.
3.  Điền các thông tin:
    *   **Tên đối thủ**: `Đối thủ A`
    *   **Đường dẫn**: `https://www.facebook.com/doithua.fanpage` (Đường dẫn fanpage chuẩn của đối thủ).
    *   **Phân khúc**: `Tài chính cá nhân`
4.  Bấm **Lưu**. Dữ liệu đối thủ sẽ được lưu vào bảng `Competitor` trong SQLite.

### Bước 3: Đồng Bộ Hóa & Làm Giàu Dữ Liệu AI
1.  Tại trang Dashboard chính, bấm nút **Sync Data** (Đồng bộ dữ liệu).
2.  Màn hình sẽ hiển thị Component [GlobalSyncStatus.tsx](file:///d:/CrawlFacebook/components/GlobalSyncStatus.tsx):
    *   Thanh tiến trình chạy theo phần trăm cập nhật thời gian thực qua Server-Sent Events (SSE).
    *   Khung log sẽ in liên tiếp tiến trình chạy của Playwright (Ví dụ: *“Khởi động trình duyệt Chromium ngầm...”*, *“Tìm thấy 15 bài đăng mới...”*, *“Đang lưu bài viết...”*).
3.  Hệ thống tự động chạy `aiClassifyPost` để phân tích sắc thái, định dạng và gán nhãn cho từng bài viết cào được.
4.  Bạn có thể kiểm tra dữ liệu bài viết thô đã cào tại bảng `Post` của cơ sở dữ liệu.

### Bước 4: Phân Tích Khoảng Trống & Lập Kế Hoạch
1.  Truy cập màn hình `/content-gap`.
2.  Xem Heatmap phân tích. Trực quan hóa các vùng màu nhạt nơi đối thủ ít làm nội dung hoặc làm nhưng chỉ số tương tác (Engagement Rate) rất kém.
3.  Nhấp vào ô khoảng trống nội dung muốn khai thác, ví dụ: Chủ đề `Vĩ mô` + Định dạng `Short video`.

### Bước 5: Sản Xuất Nội Dung Bằng AI PRO
1.  Vào trang `/content` để mở **Content Prompt Studio**.
2.  Thiết lập tham số:
    *   **Nền tảng**: `TikTok`
    *   **Chủ đề**: Chọn `Vĩ mô` từ kết quả Content Gap.
    *   **Văn phong (Brand Voice)**: Chọn profile `Kolia Phan`.
3.  Bấm **Tạo nội dung PRO bằng AI**.
4.  Giao diện hiển thị trạng thái của 4 bước sinh nội dung ngầm. Bạn có thể đọc trực tiếp kết quả đầu ra của từng bước (Research -> Outline -> Draft -> Polish).
5.  Xem xét danh sách các câu mở đầu thay thế (**Alternative Hooks**) và điểm **Hook Score** ở cột bên phải. Lựa chọn câu mở đầu có điểm số cao nhất để thay thế cho tiêu đề kịch bản.

### Bước 6: Phê Duyệt & Tự Động Xuất Bản
1.  Nếu kịch bản đã ưng ý, bấm **Approve** (Phê duyệt). Trạng thái bản ghi chuyển sang `approved`.
2.  Chọn **Lên lịch đăng bài** (Schedule) trên Lịch đăng bài (`/calendar`). Chọn thời gian đăng thích hợp (Ví dụ: 19:30 tối nay).
3.  Tác vụ cron của hệ thống quét các bản ghi đến giờ phát hành, gọi hàm `publishToFacebook` hoặc `youtubePublish` để tự động đẩy bài viết lên kênh.
4.  Hệ thống lập tức bắn thông báo tin nhắn qua Telegram/Slack thông báo trạng thái đăng bài thành công kèm link URL bài viết để bạn click xem trực tiếp trên điện thoại.

---

## 🛠️ Hướng Dẫn Khắc Phục Sự Cố Nhanh (Troubleshooting)

*   **Lỗi 1: Cào Facebook/TikTok báo lỗi Cookie không hợp lệ**
    *   *Nguyên nhân*: Phiên đăng nhập (Session cookie) của tài khoản cào lưu trong SQLite bị hết hạn hoặc bị mạng xã hội đăng xuất.
    *   *Khắc phục*: Vào Cài đặt -> Quản lý tài khoản, bấm Xóa session cũ, đăng nhập lại và bấm **Cập nhật Cookie mới**.
*   **Lỗi 2: Không sinh được nội dung PRO (Lỗi OpenAI API)**
    *   *Nguyên nhân*: API Key OpenAI hết hạn mức tín dụng hoặc model cấu hình không tồn tại.
    *   *Khắc phục*: Kiểm tra log terminal. Nếu lỗi `429 Too Many Requests`, hãy kiểm tra số dư tài khoản OpenAI hoặc đổi sang model nhỏ hơn (Ví dụ: `gpt-4o-mini`) trong file `.env`.
