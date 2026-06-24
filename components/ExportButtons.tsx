"use client";

import { Download, FileJson, FileText } from "lucide-react";

export function ExportButtons({ queryString = "" }: { queryString?: string }) {
  const suffix = queryString ? `?${queryString}` : "";
  const buttons = [
    { href: `/api/export/csv${suffix}`, label: "Xuất CSV dữ liệu thô", icon: Download },
    { href: `/api/export/json${suffix}`, label: "Export JSON", icon: FileJson },
    { href: `/api/export/markdown${suffix}`, label: "Export Markdown report", icon: FileText }
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((button) => {
        const Icon = button.icon;
        return (
          <a
            key={button.href}
            href={button.href}
            className="inline-flex items-center gap-2 rounded border border-kolia-line bg-white px-4 py-2 text-sm font-bold text-kolia-ink hover:bg-kolia-mint"
          >
            <Icon className="h-4 w-4" />
            {button.label}
          </a>
        );
      })}
    </div>
  );
}
