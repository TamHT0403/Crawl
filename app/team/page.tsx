import { TeamPanel } from "@/components/TeamPanel";

export const dynamic = "force-dynamic";

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Enterprise Settings</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Quản lý Team & API Keys</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Quản lý nhiều team, phân quyền thành viên (admin/editor/viewer), tạo API keys cho tích hợp bên thứ ba.
        </p>
      </div>
      <TeamPanel />
    </div>
  );
}
