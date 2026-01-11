// src/helpers/date.ts

/** Return YYYY-MM-DD in the user's local time zone. */
export function localYMD(d: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD in local time
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Return MM/DD/YYYY in local time (for "As of" labels). */
export function formatMMDDYYYY(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Parse a local YYYY-MM-DD into a local Date (midnight). */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m as number) - 1, d, 0, 0, 0, 0);
}

/** Make a preset range in local YMD (end = today). */
export function toLocalYMDRange(preset: "7d" | "30d" | "90d" | "ytd" | "1y") {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // local midnight
  const start = new Date(end);

  if (preset === "7d") start.setDate(start.getDate() - 6);
  else if (preset === "30d") start.setDate(start.getDate() - 29);
  else if (preset === "90d") start.setDate(start.getDate() - 89);
  else if (preset === "ytd") start.setMonth(0, 1);
  else if (preset === "1y") start.setFullYear(start.getFullYear() - 1);

  return { startDate: localYMD(start), endDate: localYMD(end) };
}

/** Convert local YYYY-MM-DD boundaries to UTC ISO timestamps [start, endExclusive]. */
export function toIsoStartEndExclusive(startYMD: string, endYMD: string) {
  const s = ymdToLocalDate(startYMD);
  const e = ymdToLocalDate(endYMD);
  const eNext = new Date(e);
  eNext.setDate(eNext.getDate() + 1);

  const startISO = new Date(
    Date.UTC(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0)
  ).toISOString();

  const endExclusiveISO = new Date(
    Date.UTC(eNext.getFullYear(), eNext.getMonth(), eNext.getDate(), 0, 0, 0, 0)
  ).toISOString();

  return { startISO, endExclusiveISO };
}


/** Show an ISO timestamp as MM/DD/YYYY in UTC (no TZ shift in display). */
export function formatUTC_MMDDYYYY(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",           // <- key: lock to UTC for display
  }).format(d);
}

/** Add (or subtract) days from a YYYY-MM-DD string, returning a new YYYY-MM-DD. */
export function addDaysYMD(ymd: string, days: number): string {
  const d = ymdToLocalDate(ymd);
  d.setDate(d.getDate() + days);
  return localYMD(d);
}

/** Alias for localYMD() with no args - returns today as YYYY-MM-DD. */
export function localTodayYMD(): string {
  return localYMD();
}