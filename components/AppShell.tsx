"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  CalendarDays,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Library,
  Megaphone,
  MessagesSquare,
  Music2,
  Puzzle,
  ScanSearch,
  Settings,
  Sparkles,
  Swords,
  Users,
  Youtube
} from "lucide-react";
import { SyncDataButton } from "@/components/SyncDataButton";
import { GlobalSyncStatus } from "@/components/GlobalSyncStatus";
import { cn } from "@/lib/utils";

type NavSection = {
  title: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
};

const navSections: NavSection[] = [
  {
    title: "📡 Thu thập dữ liệu",
    items: [
      { href: "/", label: "Dashboard tổng quan", icon: LayoutDashboard },
      { href: "/youtube", label: "YouTube Tracker", icon: Youtube },
      { href: "/tiktok", label: "TikTok Tracker", icon: Music2 },
      { href: "/facebook", label: "Facebook Tracker", icon: MessagesSquare }
    ]
  },
  {
    title: "🤖 Sản xuất nội dung",
    items: [
      { href: "/content-gap", label: "Khoảng trống nội dung", icon: ScanSearch },
      { href: "/openai-test", label: "Prompt sản xuất nội dung", icon: Sparkles },
      { href: "/content", label: "Thư viện nội dung AI", icon: Library }
    ]
  },
  {
    title: "📤 Duyệt & Xuất bản",
    items: [
      { href: "/calendar", label: "Lịch đăng nội dung", icon: CalendarDays }
    ]
  },
  {
    title: "📊 Chiến lược & Tối ưu",
    items: [
      { href: "/recommendations", label: "Đề xuất chiến lược", icon: Brain },
      { href: "/viral-patterns", label: "Viral Patterns", icon: Megaphone },
      { href: "/ab-test", label: "A/B Test Simulator", icon: Swords },
      { href: "/brand-voice", label: "Brand Voice", icon: Sparkles },
      { href: "/query", label: "Hỏi đáp dữ liệu AI", icon: FlaskConical },
      { href: "/reports", label: "Tạo báo cáo phân tích", icon: FileText }
    ]
  },
  {
    title: "⚙️ Cấu hình",
    items: [
      { href: "/team", label: "Team & API Keys", icon: Users },
      { href: "/integrations", label: "Tích hợp & Webhook", icon: Puzzle },
      { href: "/settings", label: "Cấu hình nguồn dữ liệu", icon: Settings }
    ]
  }
];

const flatNavItems = navSections.flatMap((s) => s.items);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <GlobalSyncStatus />
      <header className="fixed inset-x-0 top-0 z-40 border-b border-kolia-line/80 bg-white/90 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-kolia-ink text-sm font-bold text-kolia-gold">
              KP
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold uppercase tracking-[0.16em] text-kolia-green">Kolia Phan</p>
              <h1 className="truncate text-base font-bold text-kolia-ink md:text-lg">Kolia Competitor Tracker</h1>
            </div>
          </Link>
          <div className="flex items-center gap-3">

            <SyncDataButton />
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto border-t border-kolia-line/70 px-4 py-2 md:hidden">
          {flatNavItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-medium",
                  active ? "bg-kolia-ink text-white" : "text-slate-600"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-72 border-r border-kolia-line/80 bg-white/82 overflow-y-auto p-4 backdrop-blur md:block">
        <nav className="space-y-6">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-kolia-gold">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition",
                        active
                          ? "bg-kolia-ink text-white shadow-soft"
                          : "text-slate-600 hover:bg-kolia-mint hover:text-kolia-ink"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-6 rounded border border-kolia-line bg-gradient-to-br from-white to-kolia-amber p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-kolia-gold">Nguyên tắc nội dung</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Dashboard phục vụ nghiên cứu marketing, giữ tinh thần giáo dục, minh bạch và không đưa ra khuyến nghị đầu tư cá nhân.
          </p>
        </div>
      </aside>

      <main className="px-4 pb-10 pt-32 md:ml-72 md:px-8 md:pt-24">{children}</main>
    </div>
  );
}
