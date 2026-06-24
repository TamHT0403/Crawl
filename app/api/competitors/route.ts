import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // --- Paging ---
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
  const skip = (page - 1) * pageSize;

  // --- Filters ---
  const platform = searchParams.get("platform"); // "youtube" | "tiktok" | "facebook" | null
  const source = searchParams.get("source");       // "trong_nuoc" | "nuoc_ngoai" | null
  const search = searchParams.get("search");        // tìm theo tên

  const where: Record<string, unknown> = {};
  if (platform) where.platform = platform;
  if (source) where.source = source;
  if (search) where.name = { contains: search, mode: "insensitive" };

  // --- Sorting ---
  const sortBy = searchParams.get("sortBy") || "name";
  const sortDir = searchParams.get("sortDir") === "desc" ? "desc" : "asc";

  const orderBy: Record<string, string> = {};
  // Chỉ cho phép sort theo các field an toàn
  const allowedSortFields = ["name", "platform", "source", "category", "segmentation", "createdAt", "updatedAt"];
  const field = allowedSortFields.includes(sortBy) ? sortBy : "name";
  orderBy[field] = sortDir;

  const [competitors, total] = await Promise.all([
    prisma.competitor.findMany({
      where,
      orderBy: [orderBy, { platform: "asc" }, { name: "asc" }],
      skip,
      take: pageSize
    }),
    prisma.competitor.count({ where })
  ]);

  return NextResponse.json({
    competitors,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const competitor = await prisma.competitor.create({
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
  return NextResponse.json({ competitor }, { status: 201 });
}
