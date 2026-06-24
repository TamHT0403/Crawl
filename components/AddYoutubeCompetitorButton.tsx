"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

export function AddYoutubeCompetitorButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            channelUrl,
            platform: "youtube",
            source: "trong_nuoc",
            category: "other",
            segmentation: "Đối thủ bổ sung",
            topicDescription: "Kênh YouTube được thêm thủ công để theo dõi nghiên cứu nội dung."
          })
        });
        if (!response.ok) throw new Error("Không thêm được đối thủ. Vui lòng kiểm tra tên và link kênh.");
        setName("");
        setChannelUrl("");
        setOpen(false);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Không thêm được đối thủ.");
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded border border-kolia-line bg-white px-4 text-sm font-bold text-kolia-ink hover:bg-kolia-mint"
      >
        <Plus className="h-4 w-4" />
        Thêm đối thủ YouTube
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-20 w-[min(420px,calc(100vw-2rem))] rounded border border-kolia-line bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-kolia-ink">Import đối thủ YouTube</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Nhập đúng tên kênh và link dạng youtube.com/@handle hoặc youtube.com/channel/...</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Tên kênh
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 h-10 w-full rounded border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
              placeholder="Ví dụ: Kolia benchmark channel"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Link kênh YouTube
            <input
              value={channelUrl}
              onChange={(event) => setChannelUrl(event.target.value)}
              className="mt-2 h-10 w-full rounded border border-kolia-line px-3 text-sm outline-none focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint"
              placeholder="https://www.youtube.com/@channel/videos"
            />
          </label>
          {message ? <p className="mt-3 text-sm font-semibold text-red-700">{message}</p> : null}
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !name.trim() || !channelUrl.trim()}
            className="mt-4 w-full rounded bg-kolia-green px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Đang thêm..." : "Thêm vào danh sách tracking"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
