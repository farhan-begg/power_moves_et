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
  // Y-M-D (10 chars) → UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return ymdToUtcDate(s);
  // Otherwise let Date parse ISO timestamp
  return new Date(s);
}
