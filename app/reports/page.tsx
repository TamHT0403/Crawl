import { ReportGenerator } from "@/components/ReportGenerator";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Báo cáo có thể xuất bản</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Tạo báo cáo phân tích</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Tạo tóm tắt điều hành, hoạt động đối thủ, trụ cột nội dung, định dạng/chủ đề hiệu quả, công thức triển khai và gợi ý chương trình tiếp theo.
        </p>
      </div>
      <ReportGenerator />
    </div>
  );
}
