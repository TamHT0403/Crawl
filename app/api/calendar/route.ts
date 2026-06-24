import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { CalendarMonth, CalendarEntry, CalendarDay } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/calendar?year=2026&month=6
 * Trả về dữ liệu calendar cho tháng chỉ định
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Math.max(2024, Math.min(2030, Number(searchParams.get("year") ?? new Date().getFullYear())));
  const month = Math.max(1, Math.min(12, Number(searchParams.get("month") ?? (new Date().getMonth() + 1))));

  // Tính date range cho tháng
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // Query content có scheduledAt trong tháng, hoặc status=published/scheduled/draft
  const contents = await prisma.generatedContent.findMany({
    where: {
      OR: [
        { scheduledAt: { gte: firstDay, lte: lastDay } },
        { publishAt: { gte: firstDay, lte: lastDay } },
        { status: { in: ["draft", "approved", "scheduled", "published"] } },
      ],
    },
    orderBy: [{ scheduledAt: "asc" }, { publishAt: "asc" }, { createdAt: "desc" }],
  });

  // Build calendar entries
  const entries: CalendarEntry[] = contents.map((c) => {
    const date = c.scheduledAt || c.publishAt || c.createdAt;
    return {
      id: c.id,
      date,
      platform: c.platform as "youtube" | "tiktok" | "facebook",
      contentType: c.contentType,
      title: c.title,
      status: c.status as "draft" | "approved" | "scheduled" | "published" | "archived",
      mainTopic: c.mainTopic,
      toneOfVoice: c.toneOfVoice,
    };
  });

  // Build calendar grid
  const calendar = buildCalendarGrid(year, month, entries);

  return NextResponse.json({
    year,
    month,
    calendar,
    totalEntries: entries.length,
  });
}

function buildCalendarGrid(year: number, month: number, entries: CalendarEntry[]): CalendarMonth {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // Map entries by date string
  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const dateStr = formatDateStr(entry.date);
    const existing = entriesByDate.get(dateStr) ?? [];
    existing.push(entry);
    entriesByDate.set(dateStr, existing);
  }

  const weeks: CalendarDay[][] = [];
  let currentWeek: CalendarDay[] = [];

  // Padding days from previous month
  const startPad = firstDay.getDay(); // 0=Sun
  if (startPad > 0) {
    const prevMonth = new Date(year, month - 1, 1 - startPad);
    for (let i = 0; i < startPad; i++) {
      const d = new Date(prevMonth);
      d.setDate(prevMonth.getDate() + i);
      const dateStr = formatDateStr(d);
      currentWeek.push({
        date: dateStr,
        day: d.getDate(),
        isToday: false,
        isCurrentMonth: false,
        entries: entriesByDate.get(dateStr) ?? [],
      });
    }
  }

  // Current month days
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const d = new Date(year, month - 1, day);
    const dateStr = formatDateStr(d);
    const isToday = d.getTime() === today.getTime();

    currentWeek.push({
      date: dateStr,
      day,
      isToday,
      isCurrentMonth: true,
      entries: entriesByDate.get(dateStr) ?? [],
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Padding days from next month
  if (currentWeek.length > 0) {
    const remaining = 7 - currentWeek.length;
    const nextMonth = new Date(year, month, 1);
    for (let i = 0; i < remaining; i++) {
      const d = new Date(nextMonth);
      d.setDate(nextMonth.getDate() + i);
      const dateStr = formatDateStr(d);
      currentWeek.push({
        date: dateStr,
        day: d.getDate(),
        isToday: false,
        isCurrentMonth: false,
        entries: entriesByDate.get(dateStr) ?? [],
      });
    }
    weeks.push(currentWeek);
  }

  return { year, month, weeks };
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
