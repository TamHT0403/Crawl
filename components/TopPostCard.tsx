import type { PostWithCompetitor } from "@/lib/analytics";
import { formatNumber, formatPercent } from "@/lib/utils";

export function TopPostCard({ post, rank }: { post: PostWithCompetitor; rank: number }) {
  const interactions = post.likes + post.comments + post.shares;

  return (
    <article className="rounded border border-kolia-line bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-kolia-ink text-sm font-bold text-kolia-gold">
          {rank}
        </span>
        <div className="min-w-0">
          <a href={post.postUrl} target="_blank" rel="noreferrer" className="line-clamp-2 font-semibold text-kolia-ink hover:text-kolia-green">
            {post.title}
          </a>
          <p className="mt-1 text-sm text-slate-500">{post.competitor.name} · {post.contentPillar}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded bg-slate-50 p-2">
          <p className="font-bold text-kolia-ink">{formatNumber(post.views)}</p>
          <p className="text-slate-500">Lượt xem</p>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <p className="font-bold text-kolia-ink">{formatNumber(interactions)}</p>
          <p className="text-slate-500">Tương tác</p>
        </div>
        <div className="rounded bg-kolia-mint p-2">
          <p className="font-bold text-kolia-green">{formatPercent(post.engagementRate)}</p>
          <p className="text-slate-500">Tỷ lệ tương tác</p>
        </div>
      </div>
    </article>
  );
}
