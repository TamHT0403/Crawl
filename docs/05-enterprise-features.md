# 🏢 Phân Tích Tính Năng Doanh Nghiệp, API Authentication & Bảo Mật

Tài liệu này phân tích chi tiết cơ chế bảo mật của ứng dụng: bao gồm kiểm tra phân quyền thành viên (RBAC), quy trình tạo và xác thực API keys của hệ thống ngoại vi, cùng cơ chế ghi nhật ký vết hoạt động (Audit Logs).

---

## 👥 Cơ Chế Phân Quyền Thành Viên (Role-Based Access Control)

Mã nguồn tại [lib/team.ts](file:///d:/CrawlFacebook/lib/team.ts) quản lý cấu trúc thành viên nhóm và vai trò của họ:

*   **Các vai trò hỗ trợ**:
    *   `admin`: Có toàn quyền sửa đổi cấu hình cài đặt dự án, quản lý Token và API Keys, mời/xóa thành viên.
    *   `editor`: Được thực hiện các thao tác viết kịch bản, chỉnh sửa và đăng tải nội dung.
    *   `viewer`: Chỉ có quyền đọc (Read-only) dữ liệu dashboard, không được phép chỉnh sửa hay gọi API thay đổi cấu hình.
*   **Hàm kiểm tra quyền (Permission Middleware)**:
    Khi có yêu cầu chỉnh sửa (Ví dụ: Xóa đối thủ, sửa Brand Voice), API route thực hiện kiểm tra vai trò người dùng trong DB:
    ```typescript
    const member = await prisma.teamMember.findUnique({
      where: { teamId_email: { teamId, email } }
    });
    if (!member || member.role !== "admin") {
      throw new Error("Quyền truy cập bị từ chối: Yêu cầu quyền Admin.");
    }
    ```

---

## 🔑 Quy Trình Mã Hóa & Xác Thực API Keys ([lib/publicApi.ts](file:///d:/CrawlFacebook/lib/publicApi.ts))

Để cho phép các ứng dụng bên thứ ba (Ví dụ: Hệ thống tự động bên ngoài, ứng dụng CRM của doanh nghiệp) gọi vào API của Kolia Platform, hệ thống triển khai cơ chế sinh và băm khóa API bảo mật:

### 1. Tạo Khóa API Mới (`createApiKey`)
*   Khóa thô được sinh ngẫu nhiên bằng thư viện mật mã học của Node.js:
    ```typescript
    import crypto from "crypto";
    const rawKey = `kolia_${crypto.randomBytes(24).toString("hex")}`;
    ```
*   Khóa thô được băm (Hash) bằng thuật toán **SHA-256** trước khi lưu vào SQLite:
    ```typescript
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    ```
    *Lưu ý*: Chỉ hiển thị khóa thô `rawKey` duy nhất một lần cho người dùng lúc tạo. Trên cơ sở dữ liệu chỉ lưu trữ `keyHash`, giúp bảo vệ hệ thống ngay cả khi cơ sở dữ liệu SQLite bị lộ lọt ra ngoài.

### 2. Xác Thực Yêu Cầu API (`validateApiKey`)
Khi ứng dụng ngoài gửi yêu cầu kèm Header: `Authorization: Bearer <rawKey>`, hệ thống xử lý xác thực:
1.  Băm khóa thô được gửi lên bằng SHA-256.
2.  Truy vấn cơ sở dữ liệu tìm bản ghi khớp với Hash:
    ```typescript
    const apiKey = await prisma.apiKey.findUnique({
      where: { key: keyHash },
      include: { team: true }
    });
    ```
3.  Kiểm tra điều kiện:
    *   Trạng thái hoạt động: `apiKey.isActive === true`.
    *   Hạn dùng: `apiKey.expiresAt` phải lớn hơn thời gian hiện tại.
4.  Đối chiếu quyền hạn (Scope matching): Nếu yêu cầu gửi tới endpoint thay đổi dữ liệu mà `apiKey.scopes` chỉ là `read`, hệ thống sẽ lập tức trả về lỗi `403 Forbidden`.
5.  Cập nhật thời gian sử dụng cuối cùng (`lastUsedAt`).

---

## 📝 Nhật Ký Hoạt Động (Audit Logging Engine)

Mỗi khi người dùng hoặc API key thực hiện các hành vi thay đổi cấu hình hay xuất bản nội dung, hệ thống gọi hàm `createAuditLog` ghi nhận thông tin vào bảng `AuditLog`:

```typescript
export async function createAuditLog(params: {
  teamId: string | null;
  action: string;      // "sync.run" | "content.publish" | "settings.update"
  entity: string;      // "competitor" | "content" | "setting"
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      teamId: params.teamId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    }
  });
}
```

*   **Thông tin lưu trữ trong Metadata**:
    *   Nếu cào dữ liệu: Lưu số lượng bài đăng mới cào được, mã phiên cào `syncRunId`.
    *   Nếu đăng bài MXH: Lưu link URL bài viết sau khi đăng để đối chứng.
    *   Nếu cập nhật cấu hình API key: Lưu danh sách trường thông tin đã thay đổi (không lưu thông tin token thô).
