"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { formatNumber } from "@/lib/utils";

type OpportunityItem = {
  name: string;
  count: number;
  avgEngagement: number;
  totalViews: number;
};

export function ContentOpportunityChart({ data }: { data: OpportunityItem[] }) {
  const rows = data.slice(0, 10).map((item) => ({
    ...item,
    engagementPercent: Number((item.avgEngagement * 100).toFixed(2)),
    shortName: item.name.length > 22 ? `${item.name.slice(0, 22)}...` : item.name
  }));
  const avgCount = rows.reduce((sum, item) => sum + item.count, 0) / Math.max(rows.length, 1);
  const avgEngagement = rows.reduce((sum, item) => sum + item.engagementPercent, 0) / Math.max(rows.length, 1);

  return (
    <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-bold text-kolia-ink">Ma trận cơ hội nội dung</h2>
        <p className="text-sm leading-6 text-slate-500">
          Trục ngang là mức độ phổ biến của chủ đề, trục dọc là tỷ lệ người xem có tương tác; bong bóng càng lớn thì tổng lượt xem càng cao.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 20, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DCE5EA" />
              <XAxis type="number" dataKey="count" name="Số nội dung" tick={{ fontSize: 12 }} />
              <YAxis type="number" dataKey="engagementPercent" name="Tỷ lệ tương tác" unit="%" tick={{ fontSize: 12 }} />
              <ZAxis type="number" dataKey="totalViews" range={[120, 850]} />
              <Tooltip content={<OpportunityTooltip />} />
              <Scatter data={rows} fill="#0F8C6F" fillOpacity={0.82} stroke="#ffffff" strokeWidth={2} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {rows.slice(0, 5).map((item) => {
            const label =
              item.count >= avgCount && item.engagementPercent >= avgEngagement
                ? "Đang thắng"
                : item.count < avgCount && item.engagementPercent >= avgEngagement
                  ? "Cơ hội khai thác"
                  : item.count >= avgCount
                    ? "Cần tối ưu góc triển khai"
                    : "Theo dõi thêm";
            return (
              <div key={item.name} className="rounded border border-kolia-line bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-kolia-ink">{item.name}</p>
                  <span className="shrink-0 rounded bg-white px-2 py-1 text-xs font-bold text-kolia-green">{label}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {formatNumber(item.count)} nội dung · {item.engagementPercent.toFixed(2)}% người xem có tương tác · {formatNumber(item.totalViews)} lượt xem
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function OpportunityTooltip({
  active,
  payload
}: {
  active?: boolean;
  payload?: Array<{ payload: OpportunityItem & { engagementPercent: number; shortName: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="min-w-64 rounded border border-kolia-line bg-white p-3 text-sm shadow-soft">
      <p className="font-bold text-kolia-ink">{item.name}</p>
      <div className="mt-2 space-y-1 text-slate-600">
        <p>Số nội dung: <strong>{formatNumber(item.count)}</strong></p>
        <p>Tỷ lệ người xem có tương tác: <strong>{item.engagementPercent.toFixed(2)}%</strong></p>
        <p>Tổng lượt xem: <strong>{formatNumber(item.totalViews)}</strong></p>
      </div>
    </div>
  );
}
