import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { uploadVideoToYouTube } from "@/lib/youtubePublish";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("video") as File | null;
    const contentId = formData.get("contentId") as string | null;
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const privacyStatus = (formData.get("privacyStatus") as string) || "unlisted";
    const scheduledAt = formData.get("scheduledAt") as string | null;

    if (!file || !contentId || !title) {
      return NextResponse.json(
        { error: "Thiếu: video file, contentId, title" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: "File phải là định dạng video (MP4, AVI, MOV...). Nhận: " + file.type },
        { status: 400 }
      );
    }

    // Validate file size (256MB max)
    if (file.size > 256 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File quá lớn! Tối đa 256MB. File của bạn: " + (file.size / 1024 / 1024).toFixed(1) + "MB" },
        { status: 400 }
      );
    }

    // Save file to temp directory
    const uploadDir = join(process.cwd(), "tmp", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const ext = file.name.split(".").pop() || "mp4";
    const fileName = `youtube_${contentId}_${Date.now()}.${ext}`;
    const filePath = join(uploadDir, fileName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    console.log(`[youtube/upload] Saved: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

    // Làm sạch ký tự đặc biệt, giữ nguyên cấu trúc description (đã được xử lý từ client)
    const clean = (s: string) => s
      .replace(/[^\x20-\x7E\xA0-\xFF\u0100-\u024F\u1EA0-\u1EF9\n\r]/g, "")
      .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
      .trim();
    const cleanTitle = clean(title || "").slice(0, 100) || "Untitled Video";
    const sanitizedDesc = clean(description || "").slice(0, 5000) || "Video created by Kolia AI Studio";

    // Upload to YouTube
    const result = await uploadVideoToYouTube({
      contentId,
      title: cleanTitle,
      description: sanitizedDesc,
      videoPath: filePath,
      privacyStatus: privacyStatus as "public" | "unlisted" | "private",
      scheduledAt: scheduledAt || undefined,
    });

    return NextResponse.json({
      ok: true,
      videoId: result.videoId,
      url: result.url,
      message: scheduledAt
        ? `✅ Đã lên lịch đăng lúc ${new Date(scheduledAt).toLocaleString("vi-VN")}`
        : "✅ Video đã đăng lên YouTube thành công!",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload thất bại.";
    console.error("[youtube/upload] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
