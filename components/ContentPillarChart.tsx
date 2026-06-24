"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ChartItem = {
  name: string;
  count: number;
  avgEngagement: number;
};

export function ContentPillarChart({ data }: { data: ChartItem[] }) {
  const chartData = data.map((item) => ({
    name: item.name.length > 18 ? `${item.name.slice(0, 18)}...` : item.name,
    count: item.count,
    engagement: Number((item.avgEngagement * 100).toFixed(2))
  }));

  return (
    <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-bold text-kolia-ink">Trụ cột nội dung hiệu quả nhất</h2>
        <p className="text-sm text-slate-500">So sánh số lượng bài và tỷ lệ tương tác bình quân.</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 34, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#DCE5EA" />
            <XAxis dataKey="name" angle={-18} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar yAxisId="left" dataKey="count" name="Số bài" fill="#0F8C6F" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="engagement" name="Tỷ lệ tương tác %" fill="#C89A2D" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
