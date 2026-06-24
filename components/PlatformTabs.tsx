import Link from "next/link";
import { platformLabels } from "@/lib/constants";
import type { Platform } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs: Array<{ href: string; platform: Platform }> = [
  { href: "/youtube", platform: "youtube" },
  { href: "/tiktok", platform: "tiktok" },
  { href: "/facebook", platform: "facebook" }
];

export function PlatformTabs({ active }: { active: Platform }) {
  return (
    <div className="inline-flex rounded border border-kolia-line bg-white p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.platform}
          href={tab.href}
          className={cn(
            "rounded px-4 py-2 text-sm font-bold",
            active === tab.platform ? "bg-kolia-ink text-white" : "text-slate-600 hover:bg-kolia-mint"
          )}
        >
          {platformLabels[tab.platform]}
        </Link>
      ))}
    </div>
  );
}
