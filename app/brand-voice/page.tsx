import { BrandVoicePanel } from "@/components/BrandVoicePanel";
import { getBrandVoice } from "@/lib/brandVoice";

export const dynamic = "force-dynamic";

export default async function BrandVoicePage() {
  const profile = await getBrandVoice();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-kolia-green">Brand Voice</p>
        <h1 className="mt-2 text-3xl font-bold text-kolia-ink">Giọng văn thương hiệu</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Định nghĩa và quản lý giọng văn của Kolia. AI sẽ tự động học từ các bài viết mẫu
          và áp dụng vào content generation để đảm bảo nhất quán brand voice.
        </p>
      </div>
      <BrandVoicePanel initialProfile={profile} />
    </div>
  );
}
