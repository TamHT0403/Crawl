"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncPanel } from "@/components/SyncPanel";

export function SyncDataButton() {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded bg-kolia-green px-4 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-700"
        )}
      >
        <Settings2 className="h-4 w-4" />
        Sync Data
      </button>
      <SyncPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </>
  );
}
