import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const competitor = await prisma.competitor.update({
    where: { id },
    data: {
      name: body.name,
      platform: body.platform,
      source: body.source,
      segmentation: body.segmentation || null,
      category: body.category || "other",
      topicDescription: body.topicDescription || null,
      channelUrl: body.channelUrl,
      avatarUrl: body.avatarUrl || null
    }
  });
  return NextResponse.json({ competitor });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await prisma.competitor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
