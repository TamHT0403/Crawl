type DomesticGap = {
  commonTopics: string[];
  repeatedTopics: string[];
  underusedHighEngagement: string[];
  gaps: string[];
  suggestions: string[];
};

export function ContentGapPanel({ domestic }: { domestic: DomesticGap }) {
  const blocks = [
    { title: "Họ đang nói nhiều về", items: domestic.commonTopics },
    { title: "Chủ đề bị lặp lại", items: domestic.repeatedTopics },
    { title: "Tương tác tốt nhưng ít bên làm", items: domestic.underusedHighEngagement },
    { title: "Khoảng trống Kolia có thể nhảy vào", items: domestic.gaps },
    { title: "Gợi ý tuyến bài/chương trình", items: domestic.suggestions }
  ];

  return (
    <section className="rounded border border-kolia-line bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-kolia-ink">Content gap đối thủ trong nước</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => (
          <div key={block.title} className="rounded border border-kolia-line bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-kolia-green">{block.title}</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              {block.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kolia-gold" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
