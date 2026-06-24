/**
 * Facebook Timestamp Parser
 *
 * Facebook trả về timestamp dưới dạng text trong DOM, không phải ISO date.
 * Các format thường gặp:
 *   - "Just now"
 *   - "1 min ago" / "2 mins ago" / "5 minutes ago"
 *   - "1 hr ago" / "2 hrs ago" / "3 hours ago"
 *   - "Yesterday at 3:00 PM"
 *   - "Monday at 10:30 AM" / "Wednesday at 2:45 PM"
 *   - "5 June 2024"
 *   - "5 June at 14:30"
 *   - Aria-label: "Wednesday, 5 June 2024 at 14:30"
 */

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
  // Vietnamese month names
  tháng: -1, // special handling: "Tháng 6" -> June
};

const DAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  'chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy',
];

function parseTime(str: string): { hours: number; minutes: number } | null {
  // Match "HH:MM AM/PM" or "HH:MM"
  const match12 = str.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const ampm = match12[3].toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return { hours, minutes };
  }
  const match24 = str.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    return { hours: parseInt(match24[1], 10), minutes: parseInt(match24[2], 10) };
  }
  return null;
}

function parseDayName(str: string): number | null {
  const lower = str.trim().toLowerCase();
  for (let i = 0; i < DAY_NAMES.length; i++) {
    if (lower.startsWith(DAY_NAMES[i])) return i % 7;
  }
  return null;
}

function parseMonth(str: string): number | null {
  const lower = str.trim().toLowerCase();
  if (lower === 'tháng') return -1; // Special marker
  return MONTH_NAMES[lower] ?? null;
}

/**
 * Parse a Facebook timestamp string into a Date object.
 * Falls back to current date if parsing fails.
 */
export function parseFacebookTimestamp(timestamp: string): Date {
  if (!timestamp) return new Date();

  const now = new Date();
  const lower = timestamp.toLowerCase().trim();

  // ── "Just now" ──
  if (lower === 'just now' || lower === 'vừa xong' || lower === 'vừa xong') {
    return now;
  }

  // ── Short formats: "3h", "5h", "22h", "1d", "2d", "1w" ──
  let match = lower.match(/^(\d+)\s*(m|min|h|d|w|mo)$/);
  if (match) {
    const num = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'm' || unit === 'min') {
      return new Date(now.getTime() - num * 60 * 1000);
    }
    if (unit === 'h') {
      return new Date(now.getTime() - num * 3600 * 1000);
    }
    if (unit === 'd') {
      return new Date(now.getTime() - num * 86400 * 1000);
    }
    if (unit === 'w') {
      return new Date(now.getTime() - num * 7 * 86400 * 1000);
    }
    if (unit === 'mo') {
      return new Date(now.getTime() - num * 30 * 86400 * 1000);
    }
  }

  // ── "X min ago" / "X mins ago" / "X minutes ago" / "X phút trước" ──
  match = lower.match(/(\d+)\s*(min|mins|minute|minutes|phút)\s*(ago|trước)?/);
  if (match) {
    const mins = parseInt(match[1], 10);
    return new Date(now.getTime() - mins * 60 * 1000);
  }

  // ── "X hr ago" / "X hrs ago" / "X hours ago" / "X giờ trước" ──
  match = lower.match(/(\d+)\s*(hr|hrs|hour|hours|giờ)\s*(ago|trước)?/);
  if (match) {
    const hours = parseInt(match[1], 10);
    return new Date(now.getTime() - hours * 3600 * 1000);
  }

  // ── "Yesterday at HH:MM" / "Hôm qua lúc HH:MM" ──
  if (lower.startsWith('yesterday') || lower.startsWith('hôm qua')) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const time = parseTime(timestamp);
    if (time) {
      yesterday.setHours(time.hours, time.minutes, 0, 0);
    }
    return yesterday;
  }

  // ── Try to parse as ISO-like date directly ──
  // Facebook aria-label often gives: "Wednesday, 5 June 2024 at 14:30"
  // Remove day names, "at", "lúc" for cleaner parsing
  let cleanTimestamp = timestamp
    .replace(/,/g, '')
    .replace(/\b(at|vào|lúc)\b/gi, '')
    .trim();

  // Remove day name prefix
  const dayName = parseDayName(cleanTimestamp);
  if (dayName !== null) {
    // Find where the day name ends and remove it
    const lowerClean = cleanTimestamp.toLowerCase();
    for (const dn of DAY_NAMES) {
      if (lowerClean.startsWith(dn)) {
        cleanTimestamp = cleanTimestamp.slice(dn.length).trim();
        break;
      }
    }
  }

  // Try parsing with Date constructor after cleanup
  const parsed = new Date(cleanTimestamp);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // ── "DD Month YYYY" / "DD Month YYYY at HH:MM" / "5 June 2024" ──
  // ── "DD Month at HH:MM" (no year → current year) ──
  match = cleanTimestamp.match(
    /^(\d{1,2})\s+([a-zA-Zàáâãèéêìíòóôõùúăđĩũơ]+)\s+(\d{4})?\s*(?:-?\s*(\d{1,2}:\d{2}(?:\s*[ap]m)?))?$/i,
  );
  if (match) {
    const day = parseInt(match[1], 10);
    const monthStr = match[2];
    const yearStr = match[3];
    const timeStr = match[4];

    let month = parseMonth(monthStr);
    if (month === undefined || month === null) {
      // Try Vietnamese numeric: "Tháng 6" -> handled below
      return now;
    }

    const year = yearStr ? parseInt(yearStr, 10) : now.getFullYear();
    const date = new Date(year, month, day);

    if (timeStr) {
      const time = parseTime(timeStr);
      if (time) {
        date.setHours(time.hours, time.minutes, 0, 0);
      }
    }

    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // ── Vietnamese format: "Tháng 6 năm 2024" or "6 Tháng 6, 2024" ──
  match = lower.match(/(\d{1,2})\s*tháng\s*(\d{1,2}),?\s*(?:năm\s*)?(\d{4})?/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-based
    const year = match[3] ? parseInt(match[3], 10) : now.getFullYear();
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }

  // ── "Tháng 6 năm 2024" (month + year only) ──
  match = lower.match(/tháng\s*(\d{1,2}),?\s*(?:năm\s*)?(\d{4})/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const year = parseInt(match[2], 10);
    return new Date(year, month, 1);
  }

  // ── "X days ago" / "X ngày trước" ──
  match = lower.match(/(\d+)\s*(day|days|ngày)\s*(ago|trước)?/);
  if (match) {
    const days = parseInt(match[1], 10);
    return new Date(now.getTime() - days * 86400 * 1000);
  }

  console.warn(`[facebook-timestamp] Cannot parse: "${timestamp}" — falling back to now`);
  return now;
}
