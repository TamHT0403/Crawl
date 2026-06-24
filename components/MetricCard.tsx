import type { ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
};

export function MetricCard({ title, value, detail, icon }: MetricCardProps) {
  return (
    <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-kolia-ink">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded bg-kolia-mint text-kolia-green">{icon}</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{detail}</p>
    </section>
  );
}
