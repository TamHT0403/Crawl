import { ABTestPanel } from "@/components/ABTestPanel";

export const dynamic = "force-dynamic";

export default function ABTestPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Content Optimization</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">A/B Content Test Simulator</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          So sánh 2 phiên bản title/hook và dự đoán phiên bản nào sẽ có engagement cao hơn.
          Sử dụng AI + statistical scoring để đưa ra khuyến nghị.
        </p>
      </div>
      <ABTestPanel />
    </div>
  );
}
