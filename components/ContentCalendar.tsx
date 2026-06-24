"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, MessagesSquare, Music2, Youtube } from "lucide-react";
import type { CalendarMonth, CalendarDay } from "@/lib/types";

const platformIcon: Record<string, typeof Youtube> = {
  youtube: Youtube,
  tiktok: Music2,
  facebook: MessagesSquare,
};

const platformColors: Record<string, string> = {
  youtube: "text-red-500 bg-red-50",
  tiktok: "text-pink-400 bg-pink-50",
  facebook: "text-blue-500 bg-blue-50",
};

const statusColors: Record<string, string> = {
  draft: "border-l-slate-300",
  approved: "border-l-green-400",
  scheduled: "border-l-blue-400",
  published: "border-l-kolia-green",
  archived: "border-l-kolia-amber",
};

const MONTHS_VI = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const DAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function ContentCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [calendar, setCalendar] = useState<CalendarMonth | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchCalendar = () => {
    startTransition(async () => {
      const response = await fetch(`/api/calendar?year=${year}&month=${month}`);
      const data = await response.json();
      setCalendar(data.calendar);
    });
  };

  useEffect(() => {
    fetchCalendar();
  }, [year, month]);

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else { setMonth(month - 1); }
  };

  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else { setMonth(month + 1); }
  };

  const totalEntries = calendar?.weeks.reduce((sum, week) =>
    sum + week.reduce((s, day) => s + day.entries.length, 0), 0) ?? 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      {/* Calendar Grid */}
      <div className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevMonth}
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h2 className="text-lg font-bold text-kolia-ink">
            {MONTHS_VI[month - 1]} {year}
          </h2>
          <button
            type="button"
            onClick={nextMonth}
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-slate-100"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="mt-4 grid grid-cols-7 gap-1">
          {DAYS_VI.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-bold uppercase text-slate-400">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar weeks */}
        {isPending ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">Đang tải...</div>
        ) : (
          <div className="mt-1 space-y-1">
            {calendar?.weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((day) => {
                  const hasEntries = day.entries.length > 0;
                  const scheduledCount = day.entries.filter((e) => e.status === "scheduled").length;

                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={`relative min-h-[80px] rounded border p-1.5 text-left transition ${
                        day.isCurrentMonth ? "border-kolia-line/50" : "border-transparent"
                      } ${
                        day.isToday
                          ? "bg-kolia-mint ring-2 ring-kolia-green"
                          : hasEntries
                            ? "bg-slate-50 hover:bg-kolia-mint/50"
                            : "hover:bg-slate-50"
                      } ${selectedDay?.date === day.date ? "ring-2 ring-kolia-gold" : ""}`}
                    >
                      <span className={`text-xs font-semibold ${
                        day.isToday ? "text-kolia-green" : day.isCurrentMonth ? "text-slate-700" : "text-slate-300"
                      }`}>
                        {day.day}
                      </span>
                      {hasEntries && (
                        <div className="mt-1 space-y-0.5">
                          {day.entries.slice(0, 3).map((entry) => {
                            const Icon = platformIcon[entry.platform] ?? Youtube;
                            return (
                              <div
                                key={entry.id}
                                className="flex items-center gap-1 truncate rounded bg-white/80 px-1 py-0.5 text-[10px] shadow-sm"
                              >
                                <Icon className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{entry.title.slice(0, 15)}</span>
                              </div>
                            );
                          })}
                          {day.entries.length > 3 && (
                            <div className="text-[10px] font-semibold text-slate-400">
                              +{day.entries.length - 3} nữa
                            </div>
                          )}
                        </div>
                      )}
                      {scheduledCount > 0 && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                          {scheduledCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-kolia-line pt-3 text-xs text-slate-500">
          <span>Tổng: <strong className="text-kolia-ink">{totalEntries}</strong> nội dung</span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" /> Đã duyệt
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Đã lên lịch
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Đã đăng
          </span>
        </div>
      </div>

      {/* Day Detail Panel */}
      <div className="rounded border border-kolia-line bg-white p-5 shadow-sm">
        {selectedDay ? (
          <div>
            <h3 className="font-bold text-kolia-ink">
              {selectedDay.day}/{month}/{year}
              {selectedDay.isToday && <span className="ml-2 text-xs text-kolia-green">(Hôm nay)</span>}
            </h3>
            {selectedDay.entries.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-400">Không có nội dung nào trong ngày này.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {selectedDay.entries.map((entry) => {
                  const Icon = platformIcon[entry.platform] ?? Youtube;
                  const color = platformColors[entry.platform] ?? "text-slate-500";
                  return (
                    <div key={entry.id} className={`rounded border-l-4 ${statusColors[entry.status] ?? "border-l-slate-300"} bg-slate-50 p-3`}>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${color.split(" ")[0]}`} />
                        <span className="text-xs font-semibold uppercase text-slate-400">
                          {entry.platform} · {entry.contentType}
                        </span>
                        <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          entry.status === "scheduled" ? "bg-blue-100 text-blue-700" :
                          entry.status === "published" ? "bg-emerald-100 text-emerald-700" :
                          entry.status === "approved" ? "bg-green-100 text-green-700" :
                          "bg-slate-100 text-slate-500"
                        }`}>
                          {entry.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-kolia-ink">{entry.title}</p>
                      <p className="text-xs text-slate-500">{entry.mainTopic} · {entry.toneOfVoice}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-400">Chọn một ngày để xem chi tiết nội dung</p>
            <p className="mt-2 text-xs text-slate-300">
              Click vào ô ngày trên lịch để xem kịch bản, trạng thái và nền tảng.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
