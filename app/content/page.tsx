import { ContentLibrary } from "@/components/ContentLibrary";

export const dynamic = "force-dynamic";

export default function ContentPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">AI Content Studio</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Thư viện nội dung đã tạo</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Kịch bản YouTube, TikTok và bài Facebook được AI tự động tạo từ dữ liệu crawl đối thủ.
          Duyệt, duyệt và quản lý trạng thái nội dung.
        </p>
      </div>
      <ContentLibrary />
    </div>
  );
}
