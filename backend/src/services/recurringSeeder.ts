// server/services/recurringSeeder.ts
import { Types } from "mongoose";
import { RecurringSeries, Bill, PaycheckHit } from "../models/Recurring";

// safe-ish clamp for day-of-month
const clampDom = (n: number) => Math.max(1, Math.min(28, Math.floor(n)));

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

type SeedOpts = {
  userId: Types.ObjectId;
  months?: number; // default 7
  startAt?: Date;  // default today
};

export async function seedMockRecurringData({ userId, months = 7, startAt = new Date() }: SeedOpts) {
  // Wipe any old MOCK:* series/bills/paychecks for this user to avoid duplicates.
  // Using a "MOCK:" prefix avoids schema changes (no need for an isMock flag).
  const mockName = (s: string) => `MOCK:${s}`;

  const seriesToCreate = [
    { name: mockName("Rent"),        merchant: "landlord", cadence: "monthly",   dayOfMonth: 1,  currency: "USD", defaultAmount: 1800 },
    { name: mockName("Netflix"),     merchant: "netflix",  cadence: "monthly",   dayOfMonth: 10, currency: "USD", defaultAmount: 15.49 },
    { name: mockName("Utilities"),   merchant: "utility",  cadence: "monthly",   dayOfMonth: 5,  currency: "USD", defaultAmount: 120 },
    { name: mockName("Internet"),    merchant: "isp",      cadence: "monthly",   dayOfMonth: 7,  currency: "USD", defaultAmount: 70 },
    { name: mockName("Gym"),         merchant: "gym",      cadence: "monthly",   dayOfMonth: 12, currency: "USD", defaultAmount: 35 },
    { name: mockName("Spotify"),     merchant: "spotify",  cadence: "monthly",   dayOfMonth: 14, currency: "USD", defaultAmount: 9.99 },
    // biweekly income series is modeled as paychecks, not bills:
    { name: mockName("Payroll"),     merchant: "acme-corp",cadence: "biweekly",  dayOfMonth: 0,  currency: "USD", defaultAmount: 1850 },
  ] as const;

  // Delete existing MOCK series (and their child docs) for this user
  const existing = await RecurringSeries.find({ userId, name: /^MOCK:/i }, { _id: 1, name: 1 });
  const mockSeriesIds = existing.map(s => s._id);
  if (mockSeriesIds.length) {
    await Bill.deleteMany({ userId, seriesId: { $in: mockSeriesIds } });
    await PaycheckHit.deleteMany({ userId, seriesId: { $in: mockSeriesIds } });
    await RecurringSeries.deleteMany({ _id: { $in: mockSeriesIds } });
  }

  // Create series documents
  const createdSeries = await RecurringSeries.insertMany(
    seriesToCreate.map(s => ({
      userId,
      name: s.name,
      merchant: s.merchant,
      cadence: s.cadence,
      currency: s.currency,
      dayOfMonth: s.dayOfMonth || undefined,
      lastSeen: null,
      nextDue: null,
    }))
  );

  // Helper: find series by name fast
  const seriesByName = new Map(createdSeries.map(s => [s.name, s]));

  // Backfill MONTHLY bills for past N-1 months + current month as due/predicted
  const now = new Date(startAt);
  const startAnchor = new Date(now.getFullYear(), now.getMonth(), 1); // beginning of current month

  const billSeries = seriesToCreate.filter(s => s.cadence === "monthly");
  const billDocs: any[] = [];

  for (const meta of billSeries) {
    const ser = seriesByName.get(mockName(meta.name.replace(/^MOCK:/, ""))) || seriesByName.get(meta.name);
    if (!ser) continue;

    // Past months: create PAID bills on target day each month
    for (let i = months; i >= 1; i--) {
      const mDate = addMonths(startAnchor, -i); // month i in the past
      const due = new Date(mDate.getFullYear(), mDate.getMonth(), clampDom(meta.dayOfMonth));
      const paidAt = addDays(due, 0); // same day paid to keep it simple

      billDocs.push({
        userId,
        seriesId: ser._id,
        name: meta.name.replace(/^MOCK:/, ""),
        merchant: meta.merchant,
        amount: meta.defaultAmount,
        currency: meta.currency,
        dueDate: due,
        status: "paid",
        paidAt,
        txId: `mock-tx-${ser._id}-${due.getTime()}`,
      });
    }

    // Current month occurrence: mark as "due" if not in the past yet, otherwise mark paid
    const thisDue = new Date(startAnchor.getFullYear(), startAnchor.getMonth(), clampDom(meta.dayOfMonth));
    const inPast = thisDue.getTime() <= now.getTime();

    billDocs.push({
      userId,
      seriesId: ser._id,
      name: meta.name.replace(/^MOCK:/, ""),
      merchant: meta.merchant,
      amount: meta.defaultAmount,
      currency: meta.currency,
      dueDate: thisDue,
      status: inPast ? "paid" : "due",
      ...(inPast
        ? { paidAt: thisDue, txId: `mock-tx-${ser._id}-${thisDue.getTime()}` }
        : {}),
    });

    // Update series pointers
    await RecurringSeries.updateOne(
      { _id: ser._id },
      {
        $set: {
          lastSeen: inPast ? thisDue : addMonths(thisDue, -1),
          nextDue: inPast ? addMonths(thisDue, 1) : thisDue,
          dayOfMonth: meta.dayOfMonth,
        },
      }
    );
  }

  if (billDocs.length) await Bill.insertMany(billDocs);

  // Backfill BIWEEKLY paychecks for past ~months window, ~2 per month
  const payrollMeta = seriesToCreate.find(s => s.cadence === "biweekly");
  if (payrollMeta) {
    const ser = seriesByName.get(mockName(payrollMeta.name.replace(/^MOCK:/, ""))) || seriesByName.get(payrollMeta.name);
    if (ser) {
      const hits: any[] = [];
      // Start ~ (months*30) days ago and step every 14 days
      const first = addDays(now, -(months * 30));
      // Align first hit to a recent Friday (optional)
      const align = new Date(first);
      while (align.getDay() !== 5) align.setDate(align.getDate() + 1); // 5 = Friday

      for (let d = new Date(align); d <= now; d = addDays(d, 14)) {
        hits.push({
          userId,
          seriesId: ser._id,
          amount: payrollMeta.defaultAmount,
          date: new Date(d),
          accountId: null,
          employerName: "Acme Corp",
          txId: `mock-payroll-${ser._id}-${d.getTime()}`,
        });
      }

      if (hits.length) await PaycheckHit.insertMany(hits);

      await RecurringSeries.updateOne(
        { _id: ser._id },
        {
          $set: {
            lastSeen: hits.length ? hits[hits.length - 1].date : null,
            nextDue: addDays(hits.length ? hits[hits.length - 1].date : now, 14),
          },
        }
      );
    }
  }

  return {
    seriesCreated: createdSeries.length,
    billsCreated: billDocs.length,
    payrollCreated: undefined, // not tracked precisely above (but could be hits.length)
  };
}
