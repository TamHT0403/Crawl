type Formula = {
  title: string;
  competitor: string;
  format: string;
  sourceUrl: string;
  formula: string;
  timeline: Array<{
    time: string;
    title: string;
    script: string;
    role: string;
  }>;
  vietnamized: string;
};

export function ViralFormulaCard({ formula, label }: { formula: Formula; label?: string }) {
  return (
    <article className="rounded border border-kolia-line bg-white p-4 shadow-sm">
      {label ? <p className="text-xs font-bold uppercase tracking-[0.12em] text-kolia-gold">{label}</p> : null}
      <a href={formula.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block font-semibold text-kolia-ink hover:text-kolia-green">
        {formula.title}
      </a>
      <p className="mt-1 text-sm text-slate-500">{formula.competitor} · {formula.format}</p>
      <div className="mt-4 rounded bg-kolia-mint p-3 text-sm font-bold leading-6 text-kolia-green">{formula.formula}</div>
      <div className="mt-4 space-y-3">
        {formula.timeline.map((step) => (
          <div key={`${formula.sourceUrl}-${step.time}`} className="rounded border border-kolia-line bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-white px-2 py-1 text-xs font-bold text-kolia-gold">{step.time}</span>
              <h4 className="text-sm font-bold text-kolia-ink">{step.title}</h4>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-700">{step.script}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">Vai trò: {step.role}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded bg-kolia-amber p-3 text-sm leading-6 text-slate-700">{formula.vietnamized}</p>
    </article>
  );
}
