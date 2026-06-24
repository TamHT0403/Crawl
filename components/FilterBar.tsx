import { contentPillars, formatLabels, platformOptions, promotionTypes, sortLabels, timeRangeOptions } from "@/lib/constants";
import type { AnalyticsFilters } from "@/lib/types";

type FilterBarProps = {
  filters: AnalyticsFilters;
  lockPlatform?: string;
};

export function FilterBar({ filters, lockPlatform }: FilterBarProps) {
  const selectClass =
    "h-10 rounded border border-kolia-line bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-kolia-green focus:ring-2 focus:ring-kolia-mint";

  return (
    <form className="rounded border border-kolia-line bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select name="platform" defaultValue={lockPlatform ?? filters.platform ?? "all"} className={selectClass} disabled={Boolean(lockPlatform)}>
          {platformOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {lockPlatform ? <input type="hidden" name="platform" value={lockPlatform} /> : null}
        <select name="days" defaultValue={String(filters.days ?? 90)} className={selectClass}>
          {timeRangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select name="source" defaultValue={filters.source ?? "all"} className={selectClass}>
          <option value="all">Tất cả nguồn</option>
          <option value="trong_nuoc">Trong nước</option>
          <option value="nuoc_ngoai">Nước ngoài</option>
        </select>
        <select name="contentPillar" defaultValue={filters.contentPillar ?? ""} className={selectClass}>
          <option value="">Tất cả trụ cột nội dung</option>
          {contentPillars.map((pillar) => (
            <option key={pillar} value={pillar}>
              {pillar}
            </option>
          ))}
        </select>
        <select name="format" defaultValue={filters.format ?? ""} className={selectClass}>
          <option value="">Tất cả định dạng triển khai</option>
          {Object.entries(formatLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="promotionType" defaultValue={filters.promotionType ?? ""} className={selectClass}>
          <option value="">Tất cả nhóm CTA/ưu đãi</option>
          {promotionTypes.map((promotionType) => (
            <option key={promotionType} value={promotionType}>
              {promotionType}
            </option>
          ))}
        </select>
        <select name="sortBy" defaultValue={filters.sortBy ?? "engagement"} className={selectClass}>
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <a href="?" className="rounded border border-kolia-line px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Xóa lọc
        </a>
        <button type="submit" className="rounded bg-kolia-ink px-4 py-2 text-sm font-bold text-white hover:bg-kolia-midnight">
          Áp dụng
        </button>
      </div>
    </form>
  );
}
