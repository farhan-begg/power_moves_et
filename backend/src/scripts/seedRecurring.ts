// backend/src/scripts/seedRecurring.ts
import "dotenv/config";
import mongoose, { Types } from "mongoose";
import { RecurringSeries, Bill, PaycheckHit } from "../models/Recurring";

/* ─── tiny date helpers (no date-fns) ─── */
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/* ─── config ─── */
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/powermoves";
const SEED_USER_ID = process.env.SEED_USER_ID || "68c0c0600ccbb1d053f11ee8"; // <-- your user's Mongo _id
const SEED_MONTHS = Number(process.env.SEED_MONTHS || 7);

async function main() {
  if (!Types.ObjectId.isValid(SEED_USER_ID)) {
    throw new Error(`SEED_USER_ID "${SEED_USER_ID}" is not a valid ObjectId`);
  }
  await mongoose.connect(MONGO_URI);
  console.log("Connected to DB");

  const userId = new Types.ObjectId(SEED_USER_ID);
  const today = startOfDay(new Date());

  // ── REQUIRED: include "kind" ──
  const billSeriesDefs = [
    { name: "Rent",      merchant: "landlord", cadence: "monthly",   dayOfMonth: 1,  amount: 1800,  kind: "bill" as const },
    { name: "Netflix",   merchant: "netflix",  cadence: "monthly",   dayOfMonth: 12, amount: 15.49, kind: "bill" as const },
    { name: "Utilities", merchant: "utility",  cadence: "monthly",   dayOfMonth: 16, amount: 140,   kind: "bill" as const },
    { name: "Spotify",   merchant: "spotify",  cadence: "monthly",   dayOfMonth: 22, amount: 9.99,  kind: "bill" as const },
  ];

  const paycheckSeriesDef = {
    name: "Payroll",
    merchant: "acme corp",
    cadence: "biweekly",
    amount: 1850,
    kind: "paycheck" as const,
  };

  // upsert helper (FILTER includes kind; INSERT sets kind)
  const upsertSeries = async (def: {
    name: string;
    merchant: string;
    cadence: string;
    dayOfMonth?: number;
    kind: "bill" | "paycheck";
  }) => {
    return RecurringSeries.findOneAndUpdate(
      { userId, name: def.name, merchant: def.merchant, kind: def.kind },
      {
        $setOnInsert: {
          userId,
          name: def.name,
          merchant: def.merchant,
          cadence: def.cadence,
          dayOfMonth: def.dayOfMonth ?? null,
          kind: def.kind, // <-- REQUIRED
          lastSeen: null,
          nextDue: null,
        },
      },
      { upsert: true, new: true }
    );
  };

  // Create/ensure series
  const billSeries = await Promise.all(billSeriesDefs.map(upsertSeries));
  const paycheckSeries = await upsertSeries(paycheckSeriesDef);

  // Seed bills across past N months and 1 future month
  let billsCreated = 0;
  for (const s of billSeries) {
    const def = billSeriesDefs.find((d) => d.name === s.name)!;

    for (let m = SEED_MONTHS; m >= -1; m--) {
      const due = new Date(today.getFullYear(), today.getMonth() - m, s.dayOfMonth ?? 1);
      if (Number.isNaN(due.getTime())) continue;

      const daysOut = Math.round((startOfDay(due).getTime() - today.getTime()) / 86400000);
      let status: "paid" | "due" | "predicted" = "predicted";
      if (due < today) status = "paid";
      else if (daysOut <= 10) status = "due";

      await Bill.create({
        userId,
        seriesId: s._id,
        name: s.name,
        merchant: s.merchant,
        amount: def.amount,
        currency: "USD",
        dueDate: due,
        status,
        paidAt: status === "paid" ? due : undefined,
      });
      billsCreated++;
    }

    // update series cursors
    s.lastSeen = new Date(today.getFullYear(), today.getMonth(), s.dayOfMonth ?? 1);
    s.nextDue  = new Date(today.getFullYear(), today.getMonth() + 1, s.dayOfMonth ?? 1);
    await s.save();
  }

  // Seed biweekly paychecks for ~N months
  let paychecksCreated = 0;
  const start = new Date(today);
  start.setDate(start.getDate() - SEED_MONTHS * 30);

  // align to nearest Friday from start
  const anchor = new Date(start);
  while (anchor.getDay() !== 5) anchor.setDate(anchor.getDate() + 1);

  for (let d = new Date(anchor); d <= today; d.setDate(d.getDate() + 14)) {
    await PaycheckHit.create({
      userId,
      seriesId: paycheckSeries._id,
      amount: paycheckSeriesDef.amount,
      date: new Date(d),
      accountId: null,
      employerName: "Acme Corp",
      txId: undefined,
    });
    paychecksCreated++;
  }

  paycheckSeries.lastSeen = today;
  paycheckSeries.nextDue = addDays(today, 14);
  await paycheckSeries.save();

  console.log(`✅ Seeded ${billsCreated} bills, ${paychecksCreated} paychecks for user ${SEED_USER_ID}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.warn("Seed error:", err);
  process.exit(1);
});
