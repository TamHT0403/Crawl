import { AlertPanel } from "@/components/AlertPanel";

export const dynamic = "force-dynamic";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Integrations</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Tích hợp & Thông báo</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Kết nối Slack, Email, Telegram để nhận thông báo tự động. Thiết lập webhook cho Zapier, Make, n8n.
          Sử dụng Public API để tích hợp với hệ thống bên thứ ba.
        </p>
      </div>
      <AlertPanel />
    </div>
  );
}
