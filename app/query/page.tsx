import { NLQueryPanel } from "@/components/NLQueryPanel";

export const dynamic = "force-dynamic";

export default function QueryPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">AI Data Assistant</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Hỏi đáp dữ liệu thông minh</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Hỏi bất cứ điều gì bằng tiếng Việt về dữ liệu crawl đối thủ — AI sẽ phân tích và trả lời
          ngay lập tức. Hỗ trợ các câu hỏi về đối thủ, content gap, hiệu quả nền tảng, và nhiều hơn nữa.
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <NLQueryPanel />
        <aside className="space-y-4">
          <div className="rounded border border-kolia-line bg-white p-5 shadow-sm">
            <h2 className="font-bold text-kolia-ink">📊 Có thể hỏi</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <li>• Đối thủ & số lượng</li>
              <li>• Bài viết hiệu quả nhất</li>
              <li>• Trụ cột nội dung</li>
              <li>• Hiệu quả nền tảng</li>
              <li>• Khoảng trống nội dung</li>
              <li>• Trạng thái kết nối</li>
              <li>• Tổng quan hệ thống</li>
              <li>• Câu hỏi phức tạp (AI)</li>
            </ul>
          </div>
          <div className="rounded border border-kolia-line bg-kolia-amber p-5 shadow-sm">
            <h2 className="font-bold text-kolia-ink">💡 Mẹo</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Câu hỏi càng cụ thể, câu trả lời càng chính xác.
              VD: "Top 3 bài TikTok có engagement cao nhất 30 ngày qua?"
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
