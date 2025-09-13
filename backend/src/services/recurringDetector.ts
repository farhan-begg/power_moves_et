// backend/src/services/recurringDetector.ts
import { Types } from "mongoose";
import { Bill, RecurringSeries, type IRecurringSeries } from "../models/Recurring";

/** ===== Config ===== */
const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = 0.15; // 15% tolerance
const LOOKBACK_DAYS_DEFAULT = 180;

/** ===== Minimal shape of stored transactions we read from Mongo ===== */
export type TxDoc = {
  _id: string;
  userId: Types.ObjectId;
  type: "income" | "expense";
  amount: number;                   // positive preferred (we Math.abs anyway)
  date: Date | string;
  // Optional fields (some may be missing depending on source)
  merchant_name?: string | null;    // Plaid merchant
  category?: string | null;         // denormalized category name
  description?: string | null;      // user-visible description
  accountId?: string | null;
  source?: "plaid" | "manual";
};

type TxModel = {
  find: (filter: any, projection?: any) => Promise<TxDoc[]>;
};

/** ===== Small helpers ===== */
function safeToDate(d: unknown): Date | null {
  const t = new Date(d as any);
  return Number.isFinite(+t) ? t : null;
}

function safeLabel(part: unknown): string {
  return String(part ?? "").trim();
}

/** Normalize label used to group series */
function labelFor(t: TxDoc): string {
  const base =
    safeLabel(t.merchant_name) ||
    safeLabel(t.description) ||
    safeLabel(t.category) ||
    "Unknown";
  return base.toUpperCase().replace(/\s+/g, " ");
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs((+b - +a) / (1000 * 3600 * 24));
}

function approxEqual(a: number, b: number, tol = AMOUNT_TOLERANCE): boolean {
  const lo = a * (1 - tol);
  const hi = a * (1 + tol);
  return b >= lo && b <= hi;
}

function cadenceFromIntervals(intervals: number[]): {
  cadence: IRecurringSeries["cadence"];
  dayOfMonth?: number;
  weekday?: number;
} {
  if (!intervals.length) return { cadence: "unknown" };
  const avg = intervals.reduce((s, x) => s + x, 0) / intervals.length;

  if (avg >= 6 && avg <= 9) return { cadence: "weekly" };
  if (avg >= 12 && avg <= 18) return { cadence: "biweekly" };
  // "semimonthly" isn’t really an interval average — this is a rough heuristic
  if (avg >= 13 && avg <= 17) return { cadence: "semimonthly" };
  if (avg >= 26 && avg <= 35) return { cadence: "monthly" };
  if (avg >= 80 && avg <= 110) return { cadence: "quarterly" };
  if (avg >= 330 && avg <= 395) return { cadence: "yearly" };

  return { cadence: "unknown" };
}

/**
 * Given a last date, guess the next occurrence date.
 * Keep it permissive; detector will still mark "unknown" as monthly-ish.
 */
function nextDueFrom(last: Date, cadence: IRecurringSeries["cadence"]): Date | undefined {
  const d = new Date(last);
  switch (cadence) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      return d;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      return d;
    case "semimonthly": {
      // naive: jump to 1st or 15th depending on last
      const dom = d.getDate() <= 15 ? 15 : 1;
      if (dom === 1) d.setMonth(d.getMonth() + 1, 1);
      else d.setDate(15);
      return d;
    }
    case "monthly":
    case "unknown": {
      const dom = Math.min(28, d.getDate());
      d.setMonth(d.getMonth() + 1, dom);
      return d;
    }
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      return d;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      return d;
    default:
      return undefined;
  }
}

/** Keep cadence aligned with schema enum */
function normalizeCadence(c: string): IRecurringSeries["cadence"] {
  const ok: IRecurringSeries["cadence"][] = [
    "weekly",
    "biweekly",
    "semimonthly",
    "monthly",
    "quarterly",
    "yearly",
    "unknown",
  ];
  return (ok as string[]).includes(c) ? (c as IRecurringSeries["cadence"]) : "unknown";
}

/** Generate or update a “due/predicted” bill row around a given due date */
async function upsertUpcomingBill(
  userId: Types.ObjectId,
  seriesId: Types.ObjectId | null,
  name: string,
  merchant: string | undefined,
  amount: number | undefined,
  dueDate: Date
) {
  // find any existing due/predicted bill near this date (±5 days)
  const start = new Date(dueDate);
  start.setDate(start.getDate() - 5);
  const end = new Date(dueDate);
  end.setDate(end.getDate() + 5);

  const existing = await Bill.findOne({
    userId,
    seriesId,
    status: { $in: ["due", "predicted"] },
    dueDate: { $gte: start, $lte: end },
  });

  if (existing) {
    // keep amount in sync (be tolerant)
    if (
      typeof amount === "number" &&
      (!existing.amount || !approxEqual(existing.amount, amount, 0.3))
    ) {
      existing.amount = amount;
    }
    if (existing.status === "predicted") existing.status = "due";
    await existing.save();
    return existing;
  }

  return Bill.create({
    userId,
    seriesId,
    name,
    merchant,
    amount,
    dueDate,
    status: "due",
  });
}

/** ===== Main entry: detect recurring for a user ===== */
export async function detectRecurringForUser(params: {
  userId: Types.ObjectId;
  Tx: TxModel;
  lookbackDays?: number;
}) {
  const { userId, Tx, lookbackDays = LOOKBACK_DAYS_DEFAULT } = params;

  if (!Tx || typeof Tx.find !== "function") {
    throw new Error("Tx model missing or invalid");
  }

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  // Pull minimal fields; tolerate missing ones
  const txs: TxDoc[] = await Tx.find(
    { userId, date: { $gte: since } },
    {
      _id: 1,
      userId: 1,
      type: 1,
      amount: 1,
      date: 1,
      merchant_name: 1,
      category: 1,
      description: 1,
      accountId: 1,
      source: 1,
    }
  );

  if (!Array.isArray(txs)) {
    throw new Error("Tx.find did not return an array");
  }

  // Group by label|type, skip malformed dates
  const map = new Map<string, TxDoc[]>();
  for (const t of txs) {
    const dt = safeToDate(t.date);
    if (!dt) continue; // skip bad rows
    const key = `${labelFor(t)}|${t.type === "income" ? "income" : "expense"}`;
    const arr = map.get(key) || [];
    arr.push({ ...t, amount: Math.abs(Number(t.amount || 0)), date: dt });
    map.set(key, arr);
  }

  const results: Array<{ key: string; seriesId?: Types.ObjectId; count: number }> = [];

  for (const [key, rowsRaw] of map.entries()) {
    try {
      const rows = rowsRaw
        .filter((r) => Number.isFinite(r.amount) && r.amount > 0)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date));

      if (rows.length < MIN_OCCURRENCES) continue;

      // median-ish by middle pick (array already sorted by date; we just need a stable representative)
      const median = rows[Math.floor(rows.length / 2)].amount || 0;
      const consistentCount = rows.filter((r) => approxEqual(median, r.amount || 0)).length;
      if (consistentCount < Math.floor(rows.length * 0.6)) continue;

      const intervals: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const a = safeToDate(rows[i - 1].date);
        const b = safeToDate(rows[i].date);
        if (!a || !b) continue;
        intervals.push(daysBetween(a, b));
      }

      const { cadence } = cadenceFromIntervals(intervals);
      const last = safeToDate(rows[rows.length - 1].date);
      if (!last) continue;

      const nextDueRaw = nextDueFrom(last, cadence);
      if (!nextDueRaw) continue;

      const nextDue = safeToDate(nextDueRaw);
      if (!nextDue) continue;

      // classify
      const [labelUpper, type] = key.split("|") as [string, "income" | "expense"];
      const seriesKind: IRecurringSeries["kind"] = type === "income" ? "paycheck" : "bill";
      const merchant =
        safeLabel(rows[0].merchant_name) || safeLabel(rows[0].description) || undefined;
      const name = labelUpper;

      // upsert series
      let series = await RecurringSeries.findOne({ userId, name, kind: seriesKind });
      if (!series) {
        series = await RecurringSeries.create({
          userId,
          kind: seriesKind,
          name,
          merchant,
          cadence: normalizeCadence(cadence),
          amountHint: median,
          active: true,
          lastSeen: last,
          nextDue,
        });
      } else {
        series.merchant = merchant ?? series.merchant;
        series.cadence = normalizeCadence(cadence);
        series.amountHint = median;
        series.lastSeen = last;
        series.nextDue = nextDue;
        series.active = true;
        await series.save();
      }

      if (seriesKind === "bill") {
        await upsertUpcomingBill(userId, series._id, name, merchant, median, nextDue);
      }

      results.push({ key, seriesId: series._id, count: rows.length });
    } catch (inner) {
      // Keep the whole detection from failing on one bad cluster
      // eslint-disable-next-line no-console
      console.warn("[detector] skipped cluster due to error:", (inner as any)?.message || inner);
      continue;
    }
  }

  return { ok: true, results };
}
