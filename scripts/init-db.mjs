/**
 * Khởi tạo database PostgreSQL.
 * Script này kiểm tra kết nối PostgreSQL và tạo database nếu chưa tồn tại.
 *
 * Sử dụng: node scripts/init-db.mjs
 */

import { execSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/crawlengine";

try {
  // Thử kết nối đến database chính
  console.log(`🔌 Kiểm tra kết nối PostgreSQL...`);
  execSync(`npx prisma db push --accept-data-loss`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  console.log("✅ Database schema đã được đồng bộ thành công!");
} catch (error) {
  console.error("❌ Không thể kết nối PostgreSQL. Hãy đảm bảo PostgreSQL đang chạy.");
  console.error(`   DATABASE_URL: ${databaseUrl}`);
  console.error(`   Lỗi: ${error.message}`);
  process.exit(1);
}
