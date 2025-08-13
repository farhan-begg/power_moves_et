export const money = (n: number, currency = "USD") =>
  (n ?? 0).toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 2 });

export function rangeTodayISO() {
  const d = new Date().toISOString().slice(0, 10);
  return { startDate: d, endDate: d };
}

export function rangeMonthISO(date = new Date()) {
  const s = new Date(date.getFullYear(), date.getMonth(), 1);
  const e = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { startDate: s.toISOString().slice(0, 10), endDate: e.toISOString().slice(0, 10) };
}

export function rangeYearISO(date = new Date()) {
  const s = new Date(date.getFullYear(), 0, 1);
  const e = new Date(date.getFullYear(), 11, 31);
  return { startDate: s.toISOString().slice(0, 10), endDate: e.toISOString().slice(0, 10) };
}

export function lastNDaysISO(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}


export const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

