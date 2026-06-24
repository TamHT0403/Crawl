import { RecommendationPanel } from "@/components/RecommendationPanel";

export const dynamic = "force-dynamic";

export default function RecommendationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">AI Content Strategy</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Đề xuất chiến lược nội dung</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Hệ thống phân tích dữ liệu đối thủ, content gap và hiệu quả nền tảng để đề xuất
          các chiến lược nội dung ưu tiên cho Kolia — từ khoảng trống cần lấp đầy đến cải thiện chất lượng.
        </p>
      </div>
      <RecommendationPanel />
    </div>
  );
}
