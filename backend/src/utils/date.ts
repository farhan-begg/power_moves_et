// src/utils/date.ts

/** Parse 'YYYY-MM-DD' as UTC midnight. */
export function ymdToUtcDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m as number) - 1, d, 0, 0, 0, 0));
}

/** Build [start, endExclusive) UTC range from local Y-M-D inputs. */
export function utcRangeForYmd(startYMD?: string, endYMD?: string) {
  const range: { $gte?: Date; $lt?: Date } = {};
  if (startYMD) range.$gte = ymdToUtcDate(startYMD);
  if (endYMD) {
    const e = ymdToUtcDate(endYMD);
    // endExclusive = next day UTC 00:00
    const endExclusive = new Date(e);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    range.$lt = endExclusive;
  }
  return range;
}

/** Safe parse ISO or Y-M-D into a Date (UTC for Y-M-D). */
export function parseDateFlexible(s: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ymdToUtcDate(s);
  return new Date(s);
}

/** Reset a Date to local midnight (like date-fns startOfDay). */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Add N days to a date (returns a new Date). */
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Add N months to a date (returns a new Date). */
export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/**
 * Compute next due date given a cadence string.
 * Supports: weekly, biweekly, semimonthly, monthly, quarterly, yearly, unknown.
 */
export function bumpNextDue(from: Date, cadence: string, dayOfMonth?: number): Date | undefined {
  if (!from) return undefined;
  const base = new Date(from);

  switch (cadence) {
    case "weekly":
      return addDays(base, 7);
    case "biweekly":
      return addDays(base, 14);
    case "semimonthly": {
      const d = base.getDate();
      const nextHalf = d < 15 ? 15 : 1;
      const monthBump = d < 15 ? 0 : 1;
      return new Date(base.getFullYear(), base.getMonth() + monthBump, nextHalf);
    }
    case "monthly":
    case "unknown": {
      const dom = Math.min(Math.max(dayOfMonth ?? base.getDate(), 1), 28);
      return new Date(base.getFullYear(), base.getMonth() + 1, dom);
    }
    case "quarterly":
      return addMonths(base, 3);
    case "yearly":
      return addMonths(base, 12);
    default:
      return undefined;
  }
}
