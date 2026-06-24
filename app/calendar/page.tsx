import { ContentCalendar } from "@/components/ContentCalendar";

export const dynamic = "force-dynamic";

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Content Calendar</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Lịch đăng nội dung</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Quản lý lịch đăng bài cho YouTube, TikTok và Facebook. Kéo thả để lên lịch, theo dõi trạng thái
          từ bản nháp đến khi đăng tải.
        </p>
      </div>
      <ContentCalendar />
    </div>
  );
}
