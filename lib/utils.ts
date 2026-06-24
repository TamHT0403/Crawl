import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatNumber(value: number | null | undefined) {
  const safeValue = value ?? 0;
  return new Intl.NumberFormat("vi-VN", {
    notation: safeValue >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: 1
  }).format(safeValue);
}

export function formatPercent(value: number | null | undefined) {
  return `${((value ?? 0) * 100).toFixed(2)}%`;
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getPlatformBadgeClass(platform: string) {
  if (platform === "youtube") return "bg-red-50 text-red-700 ring-red-100";
  if (platform === "tiktok") return "bg-zinc-900 text-white ring-zinc-800";
  return "bg-blue-50 text-blue-700 ring-blue-100";
}

export function calculateEngagementRate(
  metrics: {
    views?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
  },
  platform?: string
) {
  const views = metrics.views ?? 0;
  const interactions = (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0);

  // Facebook không public lượt xem → dùng log-normalized interactions thay vì rate
  if (views <= 0) {
    if (platform === "facebook") {
      return Math.log10(interactions + 1) / 6; // 6 = log10(1.000.000)
    }
    return 0;
  }
  return interactions / views;
}

export function calculateViralityScore(metrics: {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
}) {
  const normalize = (value: number, maxLog: number) => Math.min(Math.log10(value + 1) / maxLog, 1);
  const views = normalize(metrics.views ?? 0, 7);
  const likes = normalize(metrics.likes ?? 0, 6);
  const comments = normalize(metrics.comments ?? 0, 5);
  const shares = normalize(metrics.shares ?? 0, 5);
  return Number(((views * 0.4 + likes * 0.25 + comments * 0.2 + shares * 0.15) * 100).toFixed(1));
}
