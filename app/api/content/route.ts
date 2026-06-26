import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ContentStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/content
 * Lấy danh sách generated content, có filter theo platform/status
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform;
  if (status) where.status = status;

  // Tự động cập nhật các item đã đến hạn đăng nhưng vẫn ở status "scheduled"
  await prisma.generatedContent.updateMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
    },
    data: { status: "published" },
  });

  const [items, total] = await Promise.all([
    prisma.generatedContent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.generatedContent.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      platform: item.platform,
      contentType: item.contentType,
      title: item.title,
      script: item.script,
      thumbnailIdea: item.thumbnailIdea,
      cta: item.cta,
      toneOfVoice: item.toneOfVoice,
      mainTopic: item.mainTopic,
      status: item.status,
      publishedUrl: item.publishedUrl,
      scheduledAt: item.scheduledAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    total,
    limit,
    offset,
  });
}

/**
 * PATCH /api/content
 * Cập nhật status hoặc nội dung của generated content
 * Hỗ trợ: thay đổi status, scheduledAt, và edit các field nội dung (title, script, …)
 */
export async function PATCH(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ." }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id là bắt buộc." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  // ── Nếu có status → update trạng thái (luồng cũ) ──────────────────────
  if (body.status) {
    const validStatuses: ContentStatus[] = ["draft", "qa_warning", "qa_failed", "approved", "scheduled", "published", "archived"];
    const requestedStatus = body.status as ContentStatus;
    if (!validStatuses.includes(requestedStatus)) {
      return NextResponse.json(
        { error: `Status không hợp lệ. Chấp nhận: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }
    updateData.status = requestedStatus;

    if (body.scheduledAt) {
      updateData.scheduledAt = new Date(body.scheduledAt as string);
    }
    if (body.status === "published") {
      updateData.publishAt = new Date();
    }
  }

  // ── Nếu có editField → edit nội dung (luồng chỉnh sửa) ────────────────
  if (body.editField && body.editValue !== undefined) {
    const allowedFields = ["title", "script", "thumbnailIdea", "cta", "toneOfVoice", "mainTopic", "contentType", "platform"];
    const field = body.editField as string;
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: `Field "${field}" không được phép chỉnh sửa.` }, { status: 400 });
    }
    updateData[field] = body.editValue;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Không có dữ liệu nào để cập nhật." }, { status: 400 });
  }

  const updated = await prisma.generatedContent.update({
    where: { id: body.id as string },
    data: updateData,
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    title: updated.title,
    script: updated.script,
    thumbnailIdea: updated.thumbnailIdea,
    cta: updated.cta,
    toneOfVoice: updated.toneOfVoice,
    mainTopic: updated.mainTopic,
    contentType: updated.contentType,
    platform: updated.platform,
    scheduledAt: updated.scheduledAt?.toISOString() ?? null,
    publishAt: updated.publishAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt.toISOString(),
  });
}

/**
 * DELETE /api/content?id=X
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id là bắt buộc." }, { status: 400 });
  }

  await prisma.generatedContent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
