"use client";

import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from "recharts";
import { platformLabels } from "@/lib/constants";
import { formatNumber } from "@/lib/utils";

type PlatformEffectivenessItem = {
  platform: string;
  postCount: number;
  postShare: number;
  avgEngagement: number;
  totalInteractions: number;
  avgVirality: number;
  decision: string;
  insight: string;
};

const colors: Record<string, string> = {
  youtube: "#E11D48",
  tiktok: "#102033",
  facebook: "#2563EB"
};

const decisionZones = [
  "Ưu tiên mở rộng",
  "Cần tối ưu chất lượng",
  "Cơ hội thử nghiệm",
  "Theo dõi thêm"
];

export function PlatformEffectivenessBubbleChart({ data }: { data: PlatformEffectivenessItem[] }) {
  const avgShare = data.reduce((sum, item) => sum + item.postShare, 0) / Math.max(data.length, 1);
  const avgEngagement = data.reduce((sum, item) => sum + item.avgEngagement, 0) / Math.max(data.length, 1);
  const maxShare = Math.max(45, ...data.map((item) => item.postShare + 8));
  const maxEngagement = Math.max(12, ...data.map((item) => item.avgEngagement + 2));

  return (
    <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-kolia-ink">Bản đồ hiệu quả nền tảng</h2>
          <p className="text-sm leading-6 text-slate-500">
            Trục ngang thể hiện tỷ trọng bài đăng, trục dọc là tỷ lệ tương tác bình quân; kích thước bong bóng phản ánh tổng tương tác.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
          {decisionZones.map((zone) => (
            <span key={zone} className="rounded border border-kolia-line bg-slate-50 px-2 py-1">
              {zone}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 18, right: 20, bottom: 28, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE5EA" />
              <XAxis
                type="number"
                dataKey="postShare"
                name="Tỷ trọng bài đăng"
                unit="%"
                domain={[0, maxShare]}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="avgEngagement"
                name="Tỷ lệ tương tác bình quân"
                unit="%"
                domain={[0, maxEngagement]}
                tick={{ fontSize: 12 }}
              />
              <ZAxis type="number" dataKey="totalInteractions" range={[140, 850]} />
              <ReferenceLine x={avgShare} stroke="#94A3B8" strokeDasharray="4 4" />
              <ReferenceLine y={avgEngagement} stroke="#94A3B8" strokeDasharray="4 4" />
              <Tooltip content={<PlatformTooltip />} />
              <Scatter data={data} name="Nền tảng">
                {data.map((item) => (
                  <Cell key={item.platform} fill={colors[item.platform] ?? "#0F8C6F"} fillOpacity={0.82} stroke="#ffffff" strokeWidth={2} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.platform} className="rounded border border-kolia-line bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-kolia-ink">{platformLabels[item.platform as keyof typeof platformLabels]}</span>
                <span className="rounded bg-white px-2 py-1 text-xs font-bold text-kolia-green">{item.decision}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.insight}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PlatformEffectivenessItem }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;

  return (
    <div className="min-w-64 rounded border border-kolia-line bg-white p-3 text-sm shadow-soft">
      <p className="font-bold text-kolia-ink">{platformLabels[item.platform as keyof typeof platformLabels]}</p>
      <div className="mt-2 space-y-1 text-slate-600">
        <p>Số bài/video: <strong>{formatNumber(item.postCount)}</strong></p>
        <p>Tỷ trọng bài đăng: <strong>{item.postShare.toFixed(1)}%</strong></p>
        <p>Tỷ lệ tương tác bình quân: <strong>{item.avgEngagement.toFixed(2)}%</strong></p>
        <p>Tổng tương tác: <strong>{formatNumber(item.totalInteractions)}</strong></p>
        <p>Điểm lan tỏa bình quân: <strong>{item.avgVirality.toFixed(1)}</strong></p>
      </div>
    </div>
  );
}
