import { ViralPatternsPanel } from "@/components/ViralPatternsPanel";

export const dynamic = "force-dynamic";

export default function ViralPatternsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">AI Pattern Discovery</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Phát hiện Viral Patterns</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Hệ thống tự động phân tích dữ liệu posts để phát hiện pattern viral đang hoạt động:
          hook types hiệu quả, format lan toả, emerging trends, và content clusters.
        </p>
      </div>
      <ViralPatternsPanel />
    </div>
  );
}
