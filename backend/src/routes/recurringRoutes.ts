// backend/src/routes/recurringRoutes.ts
import { Router, type Response } from "express";
import mongoose, { Types, isValidObjectId, HydratedDocument } from "mongoose";
import { protect, type AuthRequest } from "../middleware/authMiddleware";
import { RecurringSeries, Bill, PaycheckHit } from "../models/Recurring";
import Transaction from "../models/Transaction";
import { detectRecurringForUser } from "../services/recurringDetector";
import { startOfDay, addDays, bumpNextDue } from "../utils/date";
import type { IRecurringSeries } from "../models/Recurring";

type SeriesDoc = HydratedDocument<IRecurringSeries>;
type ITransactionWithPlaid = mongoose.Document & {
  _id: Types.ObjectId;
  plaidTxId?: string | null;
  matchedBillId?: Types.ObjectId | null;
  matchedPaycheckId?: Types.ObjectId | null;
  matchedRecurringId?: Types.ObjectId | null;
  matchConfidence?: number | null;
};

const router = Router();
const parseNum = (v: any) => (typeof v === "number" ? v : Number(v));
const isFinitePos = (n: any) => Number.isFinite(n) && Number(n) > 0;

/* ---------------- BILLS: match & mark paid ---------------- */
router.post("/bills/match", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = String(req.user || "");
    if (!userIdStr) return res.status(401).json({ error: "Unauthorized" });
    const userId = new Types.ObjectId(userIdStr);

    const {
      txId, amount, date, seriesId, name, merchant, accountId, accountName,
    } = (req.body ?? {}) as {
      txId?: string; amount?: number | string; date?: string; seriesId?: string;
      name?: string; merchant?: string; accountId?: string; accountName?: string;
    };

    if (!txId || typeof txId !== "string") {
      return res.status(400).json({ error: "txId required" });
    }

    const paidAt = date ? new Date(date) : new Date();
    const amtRaw = typeof amount === "string" ? Number(amount) : amount;
    const amt = Number.isFinite(amtRaw as number) ? Number(amtRaw) : undefined;

    const series: SeriesDoc | null =
      seriesId && isValidObjectId(seriesId)
        ? await RecurringSeries.findOne({ _id: seriesId, userId })
        : null;

    // Try to find an existing due/predicted bill near the paid date (±7d)
    let bill: any = null;
    if (series) {
      const start = addDays(paidAt, -7);
      const end = addDays(paidAt, +7);
      bill = await Bill.findOne({
        userId,
        seriesId: series._id,
        status: { $in: ["due", "predicted"] },
        dueDate: { $gte: start, $lte: end },
      });
    }

    // Create or update the Bill to 'paid'
    if (!bill) {
      bill = await Bill.create({
        userId,
        seriesId: series?._id ?? null,
        name: name || series?.name || "Bill",
        merchant: merchant || series?.merchant,
        amount: typeof amt === "number" && isFinitePos(amt) ? amt : undefined,
        currency: "USD",
        dueDate: paidAt,
        status: "paid",
        paidAt,
        txId, // provisional; we’ll set to mongo _id if we create the txn below
      });
    } else {
      bill.status = "paid";
      bill.paidAt = paidAt;
      bill.txId = txId;
      if (typeof amt === "number" && isFinitePos(amt)) bill.amount = amt;
      await bill.save();
    }

    // Maintain series cadence metadata
    if (series) {
      series.lastSeen = paidAt;
      series.nextDue =
        bumpNextDue(paidAt, series.cadence, series.dayOfMonth ?? undefined) ??
        series.nextDue;
      await series.save();
    }

    // ---------- Link or create Transaction so Recent Activity is in sync ----------
    const linkFields = {
      matchedBillId: bill._id as Types.ObjectId,
      matchedRecurringId: (bill.seriesId as Types.ObjectId) ?? null,
      matchConfidence: 1 as const,
    };

    let txnDoc: ITransactionWithPlaid | null = null;

    if (isValidObjectId(txId)) {
      txnDoc = (await Transaction.findOne({ _id: new Types.ObjectId(txId), userId })) as ITransactionWithPlaid | null;
    } else {
      txnDoc = (await Transaction.findOne({ userId, plaidTxId: txId })) as ITransactionWithPlaid | null;
    }

    if (txnDoc) {
      await Transaction.updateOne({ _id: txnDoc._id, userId }, { $set: linkFields });
    } else {
      const manualTxn = (await Transaction.create({
        userId,
        type: "expense",
        category: "Bills",
        amount: Math.max(Number(bill.amount || amt || 0), 0),
        date: paidAt,
        description: bill.name || series?.name || "Bill payment",
        source: "manual",
        accountId: accountId || undefined,
        accountName: accountName || undefined,
        ...(isValidObjectId(txId) ? {} : { plaidTxId: txId }),
        ...linkFields,
      })) as ITransactionWithPlaid;
      txnDoc = manualTxn;
    }

    // Ensure Bill.txId references the Mongo _id we linked/created
    if (txnDoc?._id) {
      bill.txId = String(txnDoc._id);
      await bill.save();
    }

    return res.status(201).json({ ok: true, bill, transactionId: txnDoc?._id || null });
  } catch (e: any) {
    console.error("bills/match error:", e);
    return res.status(500).json({ error: "Failed to match bill" });
  }
});

/* ---------------- PAYCHECKS: record hit ---------------- */
router.post("/paychecks/match", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = String(req.user || "");
    if (!userIdStr) return res.status(401).json({ error: "Unauthorized" });
    const userId = new Types.ObjectId(userIdStr);

    const {
      txId, amount, date, seriesId, accountId, accountName, employerName,
    } = (req.body ?? {}) as {
      txId?: string; amount?: number | string; date?: string; seriesId?: string;
      accountId?: string; accountName?: string; employerName?: string;
    };

    if (!txId) return res.status(400).json({ error: "txId required" });

    const amtNumRaw = typeof amount === "string" ? Number(amount) : amount;
    const amtNum = Number.isFinite(amtNumRaw as number) ? Number(amtNumRaw) : undefined;
    if (typeof amtNum !== "number" || amtNum <= 0) {
      return res.status(400).json({ error: "positive amount required" });
    }
    const hitDate = date ? new Date(date) : new Date();

    const series: SeriesDoc | null =
      seriesId && isValidObjectId(seriesId)
        ? await RecurringSeries.findOne({ _id: seriesId, userId })
        : null;

    const hit = await PaycheckHit.create({
      userId,
      seriesId: series?._id ?? null,
      amount: amtNum,
      date: hitDate,
      accountId: accountId ?? null,
      employerName: employerName ?? series?.merchant ?? series?.name ?? null,
      txId,
    });

    if (series) {
      series.lastSeen = hitDate;
      series.nextDue =
        bumpNextDue(hitDate, series.cadence, series.dayOfMonth ?? undefined) ??
        series.nextDue;
      await series.save();
    }

    const linkFields = {
      matchedPaycheckId: hit._id as Types.ObjectId,
      matchedRecurringId: (hit.seriesId as Types.ObjectId) ?? null,
      matchConfidence: 1 as const,
    };

    let txnDoc: ITransactionWithPlaid | null = null;

    if (isValidObjectId(txId)) {
      txnDoc = (await Transaction.findOne({ _id: new Types.ObjectId(txId), userId })) as ITransactionWithPlaid | null;
    } else {
      txnDoc = (await Transaction.findOne({ userId, plaidTxId: txId })) as ITransactionWithPlaid | null;
    }

    if (txnDoc) {
      await Transaction.updateOne({ _id: txnDoc._id, userId }, { $set: linkFields });
    } else {
      const manualTxn = (await Transaction.create({
        userId,
        type: "income",
        category: "Income",
        amount: Math.max(Number(hit.amount || 0), 0),
        date: hit.date,
        description: hit.employerName || "Paycheck",
        source: "manual",
        accountId: accountId || undefined,
        accountName: accountName || undefined,
        ...(isValidObjectId(txId) ? {} : { plaidTxId: txId }),
        ...linkFields,
      })) as ITransactionWithPlaid;
      txnDoc = manualTxn;
    }

    return res.status(201).json({ ok: true, hit, transactionId: txnDoc?._id || null });
  } catch (e: any) {
    console.error("paychecks/match error:", e);
    return res.status(500).json({ error: "Failed to match paycheck" });
  }
});

/* ---------------- DETECT NOW ---------------- */
router.post("/detect", protect, async (req: AuthRequest, res: Response) => {
  const userIdStr = String(req.user || "");
  const lookbackDaysRaw = req.body?.lookbackDays;
  const lookbackDays = Number.isFinite(Number(lookbackDaysRaw))
    ? Number(lookbackDaysRaw)
    : 180;

  try {
    if (!userIdStr) {
      return res.status(401).json({ error: "Unauthorized (no user)" });
    }
    const userId = new Types.ObjectId(userIdStr);

    // Verify Transaction model exists
    const modelNames = mongoose.modelNames();
    if (!modelNames.includes("Transaction")) {
      console.error("detect: Transaction model not registered. Models:", modelNames);
      return res.status(500).json({ error: "Transaction model not registered" });
    }

    const Tx = mongoose.model("Transaction") as any;

    console.log("[/recurring/detect] start", {
      userId: userIdStr,
      lookbackDays,
      time: new Date().toISOString(),
    });

    const out = await detectRecurringForUser({ userId, Tx, lookbackDays });

    console.log("[/recurring/detect] done", {
      resultsCount: out?.results?.length ?? null,
      time: new Date().toISOString(),
    });

    return res.json(out);
  } catch (e: any) {
    // Log full details to server console
    console.error("[/recurring/detect] ERROR:", e?.message, e?.stack);
    // Always return a json body so PowerShell can print it
    return res.status(500).json({
      error: "Failed to detect recurring",
      details: e?.message ?? String(e),
      stack: e?.stack ?? null,
    });
  }
});


/* ---------------- OVERVIEW ---------------- */
router.get("/overview", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = String(req.user || "");
    if (!userIdStr) return res.status(401).json({ error: "Unauthorized" });

    const horizonDays = Math.max(1, Math.min(120, Number(req.query.horizonDays) || 40));
    const today = startOfDay(new Date());
    const end = addDays(today, horizonDays);

    const bills = await Bill.find({
      userId: new Types.ObjectId(userIdStr),
      status: { $in: ["predicted", "due"] },
      dueDate: { $lte: end },
    })
      .sort({ dueDate: 1 })
      .lean();

    const recentCutoff = addDays(today, -90);
    const recentPaychecks = await PaycheckHit.find({
      userId: new Types.ObjectId(userIdStr),
      date: { $gte: recentCutoff },
    })
      .sort({ date: -1 })
      .lean();

    return res.json({ bills, recentPaychecks });
  } catch (e: any) {
    console.error("overview error:", e);
    return res.status(500).json({ error: "Failed to build overview" });
  }
});

/* ---------------- BACKFILL TX ---------------- */
router.post("/backfill-tx", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = String(req.user || "");
    if (!userIdStr) return res.status(401).json({ error: "Unauthorized" });
    const userId = new Types.ObjectId(userIdStr);

    const days = Number(req.body?.days || 365);
    const accountId: string | undefined = req.body?.accountId || undefined;
    const since = addDays(new Date(), -days);

    // PAID bills -> tx
    const paidBills = await Bill.find({
      userId,
      status: "paid",
      paidAt: { $gte: since },
    }).lean();

    let billsCreated = 0;
    let billsLinked = 0;

    for (const b of paidBills) {
      const linkQuery: any[] = [{ userId, matchedBillId: b._id }];
      if (b.txId) {
        const raw = String(b.txId);
        if (isValidObjectId(raw)) linkQuery.push({ userId, _id: new Types.ObjectId(raw) });
        else linkQuery.push({ userId, plaidTxId: raw });
      }

      const already = (await Transaction.findOne({ $or: linkQuery })) as ITransactionWithPlaid | null;
      if (already) {
        if (!already.matchedBillId || !already.matchedRecurringId) {
          already.matchedBillId = b._id as any;
          already.matchedRecurringId = (b as any).seriesId ?? null;
          already.matchConfidence = 1;
          await (already as any).save?.();
          billsLinked++;
        }
        continue;
      }

      const amount = typeof b.amount === "number" ? Math.max(b.amount, 0) : 0;
      const paidAt = b.paidAt ? new Date(b.paidAt) : (b.dueDate ? new Date(b.dueDate) : new Date());

      await Transaction.create({
        userId,
        type: "expense",
        category: "Bills",
        amount,
        date: paidAt,
        description: b.name || "Bill",
        source: "manual",
        accountId: accountId || undefined,
        accountName: (b as any).merchant || (b as any).name || undefined,
        plaidTxId: isValidObjectId(String(b.txId)) ? null : (b.txId ?? null),
        matchedBillId: b._id as any,
        matchedRecurringId: (b as any).seriesId ?? null,
        matchConfidence: 1,
      });
      billsCreated++;
    }

    // Paycheck hits -> tx
    const hits = await PaycheckHit.find({
      userId,
      date: { $gte: since },
    }).lean();

    let paysCreated = 0;
    let paysLinked = 0;

    for (const h of hits) {
      const linkQuery: any[] = [{ userId, matchedPaycheckId: h._id }];
      if ((h as any).txId) {
        const raw = String((h as any).txId);
        if (isValidObjectId(raw)) linkQuery.push({ userId, _id: new Types.ObjectId(raw) });
        else linkQuery.push({ userId, plaidTxId: raw });
      }

      const already = (await Transaction.findOne({ $or: linkQuery })) as ITransactionWithPlaid | null;
      if (already) {
        if (!already.matchedPaycheckId || !already.matchedRecurringId) {
          already.matchedPaycheckId = h._id as any;
          already.matchedRecurringId = (h as any).seriesId ?? null;
          already.matchConfidence = 1;
          await (already as any).save?.();
          paysLinked++;
        }
        continue;
      }

      await Transaction.create({
        userId,
        type: "income",
        category: "Income",
        amount: Math.max(Number(h.amount || 0), 0),
        date: new Date(h.date),
        description: (h as any).employerName || "Paycheck",
        source: "manual",
        accountId: accountId || (h as any).accountId || undefined,
        accountName: (h as any).employerName || undefined,
        plaidTxId:
          (h as any).txId && !isValidObjectId(String((h as any).txId))
            ? String((h as any).txId)
            : null,
        matchedPaycheckId: h._id as any,
        matchedRecurringId: (h as any).seriesId ?? null,
        matchConfidence: 1,
      });
      paysCreated++;
    }

    return res.json({
      ok: true,
      since,
      summary: { billsCreated, billsLinked, paysCreated, paysLinked },
    });
  } catch (e: any) {
    console.error("backfill-tx error:", e);
    return res.status(500).json({ error: "Failed to backfill transactions" });
  }
});

router.get("/ping", (_req, res) => res.json({ ok: true, where: "recurringRoutes" }));
export default router;
