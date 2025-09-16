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
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const parseDate = (d?: string | number | Date | null) =>
  d ? new Date(d) : undefined;

/* =========================================================================================
   RECURRING SERIES CRUD
========================================================================================= */

/** List series (optionally by kind, active, text search, horizon for nextDue calc) */
router.get("/series", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { kind, active, q } = req.query as { kind?: string; active?: string; q?: string };

    const filter: any = { userId };
    if (kind) filter.kind = kind;
    if (active === "true") filter.active = true;
    if (active === "false") filter.active = false;
    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q.trim(), $options: "i" } },
        { merchant: { $regex: q.trim(), $options: "i" } },
      ];
    }

    const list = await RecurringSeries.find(filter).sort({ nextDue: 1, name: 1 }).lean();
    res.json(list);
  } catch (e: any) {
    console.error("GET /series error:", e);
    res.status(500).json({ error: "Failed to list series" });
  }
});

/** Create or update a series */
router.post("/series", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const {
      id,
      kind, // "bill" | "subscription" | "paycheck"
      name,
      merchant,
      cadence, // weekly|biweekly|semimonthly|monthly|quarterly|yearly|unknown
      dayOfMonth,
      weekday,
      amountHint,
      active = true,
      nextDue,
    } = req.body || {};

    if (!kind || !name) {
      return res.status(400).json({ error: "kind and name are required" });
    }

    const payload: Partial<IRecurringSeries> = {
      userId,
      kind,
      name,
      merchant: merchant ?? null,
      cadence: cadence ?? "unknown",
      dayOfMonth: typeof dayOfMonth === "number" ? clamp(dayOfMonth, 1, 28) : null,
      weekday: typeof weekday === "number" ? clamp(weekday, 0, 6) : null,
      amountHint: typeof amountHint === "number" && amountHint >= 0 ? amountHint : null,
      active: Boolean(active),
      nextDue: nextDue ? new Date(nextDue) : null,
    };

    const doc = id
      ? await RecurringSeries.findOneAndUpdate({ _id: id, userId }, { $set: payload }, { new: true })
      : await RecurringSeries.create(payload);

    res.json(doc);
  } catch (e: any) {
    console.error("POST /series error:", e);
    res.status(500).json({ error: "Failed to upsert series" });
  }
});

/** Delete a series (does not delete Bills/Paychecks; just detaches) */
router.delete("/series/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "invalid id" });

    await RecurringSeries.deleteOne({ _id: id, userId });

    // Optionally, detach existing Bills/PaycheckHits
    await Bill.updateMany({ userId, seriesId: id }, { $set: { seriesId: null } });
    await PaycheckHit.updateMany({ userId, seriesId: id }, { $set: { seriesId: null } });

    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /series/:id error:", e);
    res.status(500).json({ error: "Failed to delete series" });
  }
});

/** Snooze a series nextDue by N days */
router.post("/series/:id/snooze", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { id } = req.params;
    const days = clamp(Number(req.body?.days || 30), 1, 365);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "invalid id" });

    const s = await RecurringSeries.findOne({ _id: id, userId });
    if (!s) return res.status(404).json({ error: "Series not found" });

    const base = s.nextDue ?? new Date();
    s.nextDue = addDays(base, days);
    await s.save();

    res.json({ ok: true, series: s });
  } catch (e: any) {
    console.error("POST /series/:id/snooze error:", e);
    res.status(500).json({ error: "Failed to snooze series" });
  }
});

/* =========================================================================================
   BILLS
========================================================================================= */

/** Quick create a bill "due" (optionally attaching a series) */
router.post("/bills", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { seriesId, name, merchant, amount, dueDate, currency = "USD" } = req.body || {};
    const bill = await Bill.create({
      userId,
      seriesId: seriesId && isValidObjectId(seriesId) ? new Types.ObjectId(seriesId) : null,
      name: name || "Bill",
      merchant: merchant || null,
      amount: typeof amount === "number" && amount >= 0 ? amount : null,
      currency,
      dueDate: parseDate(dueDate) ?? new Date(),
      status: "due",
    });
    res.status(201).json(bill);
  } catch (e: any) {
    console.error("POST /bills error:", e);
    res.status(500).json({ error: "Failed to create bill" });
  }
});

/** List bills by window/status/account */
router.get("/bills", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { from, to, status, q, limit, accountId } = req.query as any;

    const filter: any = { userId };
    if (status) filter.status = { $in: String(status).split(",") };
    if (from || to) {
      filter.dueDate = {};
      if (from) filter.dueDate.$gte = new Date(from);
      if (to) filter.dueDate.$lte = new Date(to);
    }
    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q.trim(), $options: "i" } },
        { merchant: { $regex: q.trim(), $options: "i" } },
      ];
    }

    // accountId is stored on the Transaction we link when paid; for listing "due/predicted"
    // there's no accountId (unless you put it on the bill model). We still allow fetching.
    const cursor = Bill.find(filter).sort({ dueDate: 1 });
    if (limit) cursor.limit(Number(limit));
    const bills = await cursor.lean();

    // if accountId was requested, filter paid that link to tx w/ accountId
    if (accountId) {
      const paidWithTxIds = bills
        .filter((b) => b.status === "paid" && b.txId)
        .map((b) => String(b.txId));
      const txs = await Transaction.find({
        userId,
        $or: [
          { _id: { $in: paidWithTxIds.filter(isValidObjectId).map((id) => new Types.ObjectId(id)) } },
          { plaidTxId: { $in: paidWithTxIds.filter((x) => !isValidObjectId(x)) } },
        ],
        accountId: accountId,
      }).select("_id plaidTxId");
      const allowed = new Set<string>([
        ...txs.map((t) => String(t._id)),
        ...txs.map((t) => String((t as any).plaidTxId)),
      ]);
      return res.json(bills.filter((b) => !b.txId || allowed.has(String(b.txId))));
    }

    res.json(bills);
  } catch (e: any) {
    console.error("GET /bills error:", e);
    res.status(500).json({ error: "Failed to list bills" });
  }
});

/** Mark bill status (paid|skipped|due) + optional tx link */
router.post("/bills/:id/mark", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { id } = req.params;
    const { status, txId, amount, paidAt } = req.body || {};
    if (!isValidObjectId(id)) return res.status(400).json({ error: "invalid id" });
    if (!["paid", "skipped", "due"].includes(status)) {
      return res.status(400).json({ error: "status must be paid|skipped|due" });
    }

    const bill = await Bill.findOne({ _id: id, userId });
    if (!bill) return res.status(404).json({ error: "bill not found" });

    if (typeof amount === "number" && amount >= 0) bill.amount = amount;

    if (status === "paid") {
      bill.status = "paid";
      bill.paidAt = parseDate(paidAt) ?? new Date();
      if (txId) bill.txId = String(txId);
    } else if (status === "skipped") {
      bill.status = "skipped";
      bill.paidAt = null;
      bill.txId = null;
    } else {
      bill.status = "due";
      bill.paidAt = null;
    }

    await bill.save();
    res.json({ ok: true, bill });
  } catch (e: any) {
    console.error("POST /bills/:id/mark error:", e);
    res.status(500).json({ error: "Failed to mark bill" });
  }
});

/** Snooze bill dueDate by N days */
router.post("/bills/:id/snooze", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { id } = req.params;
    const days = clamp(Number(req.body?.days || 7), 1, 365);
    if (!isValidObjectId(id)) return res.status(400).json({ error: "invalid id" });

    const b = await Bill.findOne({ _id: id, userId });
    if (!b) return res.status(404).json({ error: "bill not found" });

    const base = b.dueDate ?? new Date();
    b.dueDate = addDays(base, days);
    await b.save();

    res.json({ ok: true, bill: b });
  } catch (e: any) {
    console.error("POST /bills/:id/snooze error:", e);
    res.status(500).json({ error: "Failed to snooze bill" });
  }
});

/** Match & mark bill PAID (links/creates a Transaction) */
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

    // Try to find a due/predicted bill near the paid date (±7d)
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

    // Create/Update bill to 'paid'
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
        txId,
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
        bumpNextDue(paidAt, series.cadence, series.dayOfMonth ?? undefined) ?? series.nextDue;
      await series.save();
    }

    // ----- Link or create Transaction -----
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

/* =========================================================================================
   PAYCHECKS
========================================================================================= */

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
        bumpNextDue(hitDate, series.cadence, series.dayOfMonth ?? undefined) ?? series.nextDue;
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

/* =========================================================================================
   DETECT NOW (recurring detector)
========================================================================================= */

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
    console.error("[/recurring/detect] ERROR:", e?.message, e?.stack);
    return res.status(500).json({
      error: "Failed to detect recurring",
      details: e?.message ?? String(e),
      stack: e?.stack ?? null,
    });
  }
});

/* =========================================================================================
   OVERVIEW (short-range planner)
========================================================================================= */

router.get("/overview", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userIdStr = String(req.user || "");
    if (!userIdStr) return res.status(401).json({ error: "Unauthorized" });

    const horizonDays = clamp(Number(req.query.horizonDays || 40), 1, 120);
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

    // small summary to power widgets
    const totalDue = bills.reduce((s, b: any) => s + (typeof b.amount === "number" ? Math.max(b.amount, 0) : 0), 0);
    const nextBill = bills[0] || null;
    const lastPaycheck = recentPaychecks[0] || null;

    return res.json({
      horizonDays,
      summary: { totalDue, nextBillDue: nextBill?.dueDate ?? null },
      bills,
      recentPaychecks,
      lastPaycheck,
    });
  } catch (e: any) {
    console.error("overview error:", e);
    return res.status(500).json({ error: "Failed to build overview" });
  }
});

/* =========================================================================================
   BACKFILL TX LINKS (idempotent)
========================================================================================= */

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

/* =========================================================================================
   HEALTHCHECK
========================================================================================= */
router.get("/ping", (_req, res) => res.json({ ok: true, where: "recurringRoutes" }));

export default router;
