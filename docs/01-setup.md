# ⚙️ Hướng Dẫn Cài Đặt Chi Tiết & Giải Mã Script Vận Hành

Tài liệu này cung cấp hướng dẫn cài đặt chi tiết từng bước, cấu hình biến môi trường và giải mã mã nguồn PowerShell dùng cho tự động hoá khởi động hệ thống.

---

## 🛠️ Hướng Dẫn Cài Đặt Từng Bước (Installation Walkthrough)

### 1. Cài đặt các gói phụ thuộc (Dependencies)
Thực thi lệnh cài đặt các gói thư viện được định nghĩa trong `package.json`:
```bash
npm install
```
*Lưu ý*: Dự án sử dụng `@prisma/client` để giao tiếp CSDL PostgreSQL và thư viện `googleapis` cho tích hợp Google Cloud.

### 2. Cài đặt và cấu hình Playwright Chromium
Playwright yêu cầu binary trình duyệt Chromium tương thích để thực hiện cào dữ liệu tự động (Simulated Scrapes) và đăng bài TikTok ngầm:
```bash
npx playwright install chromium
```
Trình duyệt này sẽ được lưu trữ trong thư mục AppData cục bộ của người dùng (`%USERPROFILE%\AppData\Local\ms-playwright`).

### 3. Thiết lập PostgreSQL & Cơ sở dữ liệu Prisma

Đảm bảo bạn đã cài đặt PostgreSQL và tạo database:
```bash
# Ví dụ tạo database trên Windows (dùng psql)
psql -U postgres -c "CREATE DATABASE crawlengine;"
```
Hoặc qua pgAdmin.

### 5. Đồng bộ Schema Prisma
Tạo cơ sở dữ liệu PostgreSQL và đồng bộ hóa lược đồ bảng:
```bash
npx prisma db push
```
Lệnh này phân tích file [prisma/schema.prisma](file:///d:/CrawlEngine/prisma/schema.prisma) để tạo bảng mà không cần chạy file migration lịch sử, tối ưu cho chạy local.

> **Yêu cầu**: Đảm bảo PostgreSQL server đang chạy và `DATABASE_URL` trong `.env` đã được cấu hình đúng.

### 4. Chạy Seed nạp dữ liệu khởi tạo
Thực thi file [prisma/seed.ts](file:///d:/CrawlFacebook/prisma/seed.ts) thông qua ts-node (hoặc build sẵn):
```bash
npm run seed
```
Lệnh này chèn danh sách đối thủ tài chính/marketing mẫu ban đầu vào bảng `Competitor`.

---

## 🔑 Giải Nghĩa Chi Tiết Biến Môi Trường (`.env`)

Dưới đây là các cấu hình biến môi trường bắt buộc và tùy chọn trong file `.env`:

```env
# ─── DATABASE CONFIG ────────────────────────────────────────────────────────
# Kết nối đến PostgreSQL server (có thể đổi host/user/pass/db cho phù hợp)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crawlengine"

# ─── OPENAI CONFIG ──────────────────────────────────────────────────────────
# Khóa API để thực hiện phân tích và sinh nội dung kịch bản
OPENAI_API_KEY="sk-proj-..."
# Model sử dụng chính trong ứng dụng. Hỗ trợ "gpt-4o", "gpt-4o-mini"
OPENAI_MODEL="gpt-4o"

# ─── GOOGLE CLIENT CONFIG (Cho Google Docs & YouTube) ────────────────────────
# Cần tạo Client ID OAuth 2.0 dạng Web Application trên Google Cloud Console
GOOGLE_CLIENT_ID="123456-abcdef.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-your-client-secret"
# Redirect URI bắt buộc phải khớp cấu hình trên Console Google Cloud
GOOGLE_REDIRECT_URI="http://localhost:3000/api/google/oauth/callback"

# ─── FACEBOOK GRAPH API CONFIG ──────────────────────────────────────────────
# ID trang Fanpage Facebook do bạn sở hữu
FB_PAGE_ID="10009087..."
# Quyền hạn tối thiểu cần: pages_manage_posts, pages_read_engagement
FB_PAGE_ACCESS_TOKEN="EAAG..."

# ─── TELEGRAM BOT CONFIG ────────────────────────────────────────────────────
# Token từ BotFather dùng để bắn thông báo
TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
```

---

## 💻 Giải Mã Hoạt Động Của Các Script PowerShell Vận Hành

Dự án cung cấp các file `.ps1` trong thư mục [scripts/](file:///d:/CrawlFacebook/scripts) nhằm đơn giản hoá việc triển khai ngầm Next.js trên hệ điều hành Windows:

### 1. Script Khởi Động Thủ Công ([scripts/start-localhost.ps1](file:///d:/CrawlFacebook/scripts/start-localhost.ps1))
*   **Mục đích**: Tự động bật server local cổng 3000 và kích hoạt trình duyệt kiểm tra OpenAI.
*   **Luồng hoạt động của mã**:
    1.  Kiểm tra cổng mạng `3000` bằng lệnh:
        ```powershell
        $portActive = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
        ```
    2.  Nếu cổng **chưa chạy**, script gọi Node.js khởi động Next.js server ngầm thông qua lệnh `Start-Process` nhằm tránh khóa màn hình PowerShell hiện tại:
        ```powershell
        Start-Process -FilePath "npm" -ArgumentList "run dev" -WindowStyle Hidden
        ```
    3.  Chờ 3 giây để Next.js biên dịch trang, sau đó mở trình duyệt trỏ thẳng vào đường dẫn test API của ứng dụng:
        ```powershell
        Start-Process "http://localhost:3000/openai-test"
        ```

### 2. Script Đăng Ký Windows Task Scheduler ([scripts/register-localhost-task.ps1](file:///d:/CrawlFacebook/scripts/register-localhost-task.ps1))
*   **Mục đích**: Tự động đăng ký một Windows Task chạy ngầm ứng dụng mỗi khi người dùng đăng nhập hệ thống.
*   **Luồng hoạt động của mã**:
    1.  Tạo tác vụ (Action) liên kết trực tiếp với script khởi chạy:
        ```powershell
        $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$PSScriptRoot\start-localhost.ps1`""
        ```
    2.  Thiết lập điều kiện kích hoạt (Trigger) là khi người dùng đăng nhập vào máy tính:
        ```powershell
        $trigger = New-ScheduledTaskTrigger -AtLogOn
        ```
    3.  Đăng ký tác vụ vào Windows Scheduler dưới tên `KoliaCompetitorServer`:
        ```powershell
        Register-ScheduledTask -TaskName "KoliaCompetitorServer" -Trigger $trigger -Action $action -Description "Tu dong khoi chay server local port 3000 cua Kolia Competitor Tracker" -Force
        ```

### 3. Startup Folder Launcher ([scripts/install-startup-launcher.ps1](file:///d:/CrawlFacebook/scripts/install-startup-launcher.ps1))
*   **Mục đích**: Tạo file shortcut `.lnk` trong thư mục Startup của Windows (`shell:startup`) trỏ trực tiếp đến `scripts/start-localhost.ps1`.
*   *Ưu điểm*: Chạy được ngay cả khi tài khoản Windows bị quản lý chặt (No Admin privilege) không tạo được Scheduled Task.
