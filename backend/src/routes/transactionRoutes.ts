// routes/transactionRoutes.ts
import { Router, Response } from "express";
import mongoose, { PipelineStage } from "mongoose";
import Transaction from "../models/Transaction";
import User from "../models/User";                    // ✅ missing
import plaidClient from "../services/plaidService";   // ✅ missing
import { decrypt } from "../utils/cryptoUtils";       // ✅ missing
import { AuthRequest, protect } from "../middleware/authMiddleware";

const router = Router();

/** Helper: parse one or many account ids from query */
function parseAccountIds(q: { accountId?: string; accountIds?: string }) {
  const idsFromCSV = (q.accountIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (q.accountId && idsFromCSV.length) {
    return Array.from(new Set([q.accountId, ...idsFromCSV]));
  }
  if (q.accountId) return [q.accountId];
  if (idsFromCSV.length) return idsFromCSV;
  return [];
}

/** -------------------------------------------
 * POST /api/transactions
 * Create a MANUAL transaction (can pin to an account)
 * Body: { type, category, amount, description?, date?, accountId?, accountName? }
 * ------------------------------------------- */
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { type, category, amount, description, date, accountId, accountName } = req.body as {
      type: "income" | "expense";
      category: string;
      amount: number | string;
      description?: string;
      date?: string;
      accountId?: string;
      accountName?: string;
    };

    const amt = typeof amount === "string" ? Number(amount) : amount;
    if (!type || !category || typeof amt !== "number" || !isFinite(amt)) {
      return res.status(400).json({ error: "type, category, and a numeric amount are required" });
    }

    const transaction = new Transaction({
      userId: new mongoose.Types.ObjectId(String(req.user)),
      type,
      category,
      amount: amt,
      description,
      date: date ? new Date(date) : new Date(),
      source: "manual",
      accountId: accountId || undefined,
      accountName: accountName || undefined,
    });

    await transaction.save();
    console.log("✅ Transaction saved:", transaction._id);
    res.status(201).json(transaction);
  } catch (err: any) {
    console.error("❌ Transaction save error:", err);
    res.status(400).json({ error: "Error saving transaction", details: err.message || err });
  }
});

/** -------------------------------------------
 * GET /api/transactions
 * Paged list w/ filters + source breakdown
 * Query: type, category, minAmount, maxAmount, startDate, endDate,
 *        sortBy, order, page, limit, source, accountId, accountIds (CSV)
 * ------------------------------------------- */
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      category,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      sortBy,
      order,
      page,
      limit,
      source,
      accountId,
      accountIds,
    } = req.query as {
      type?: string;
      category?: string;
      minAmount?: string;
      maxAmount?: string;
      startDate?: string;
      endDate?: string;
      sortBy?: string;
      order?: "asc" | "desc";
      page?: string;
      limit?: string;
      source?: string;
      accountId?: string;
      accountIds?: string;
    };

    const userId = new mongoose.Types.ObjectId(String(req.user));
    const filter: Record<string, any> = { userId };

    if (type) filter.type = type;
    if (category) filter.category = category;
    if (source) filter.source = source;
    if (minAmount) filter.amount = { ...filter.amount, $gte: Number(minAmount) };
    if (maxAmount) filter.amount = { ...filter.amount, $lte: Number(maxAmount) };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    // account filtering
    const ids = parseAccountIds({ accountId, accountIds });
    if (ids.length === 1) filter.accountId = ids[0];
    else if (ids.length > 1) filter.accountId = { $in: ids };

    const sortField = (sortBy as string) || "date";
    const sortOrder = order === "asc" ? 1 : -1;
    const sortOptions: any = { [sortField]: sortOrder };

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const total = await Transaction.countDocuments(filter);
    const transactions = await Transaction.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    // Source breakdown (respect same filter)
    const sourceBreakdownAgg = await Transaction.aggregate([
      { $match: filter },
      { $group: { _id: "$source", count: { $sum: 1 } } },
    ]);
    const sourceBreakdown: Record<string, number> = {};
    for (const row of sourceBreakdownAgg) {
      sourceBreakdown[row._id || "unknown"] = row.count;
    }

    console.log(
      `✅ Transactions fetched: ${transactions.length} (page ${pageNum})${
        filter.accountId ? ` | account filter: ${JSON.stringify(filter.accountId)}` : ""
      }`
    );
console.log(`✅ Transactions fetched: ${transactions.length} ...`, filter.accountId ? `| account filter: ${JSON.stringify(filter.accountId)}` : "")

    res.json({
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      transactions,
      sourceBreakdown,
    });
  } catch (err: any) {
    console.error("❌ Error fetching transactions:", err);
    res.status(500).json({ error: "Error fetching transactions", details: err.message || err });
  }
});

/** -------------------------------------------
 * DELETE /api/transactions/:id
 * ------------------------------------------- */
router.delete("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: new mongoose.Types.ObjectId(String(req.user)),
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found or not authorized" });
    }

    console.log("🗑️ Transaction deleted:", transaction._id);
    res.json({ message: "Transaction deleted successfully", id: transaction._id });
  } catch (err: any) {
    console.error("❌ Error deleting transaction:", err);
    res.status(500).json({ error: "Error deleting transaction", details: err.message || err });
  }
});

/** -------------------------------------------
 * PUT /api/transactions/:id
 * Keeps existing accountId/accountName unless provided
 * ------------------------------------------- */
router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { type, category, amount, description, date, accountId, accountName } = req.body as {
      type?: "income" | "expense";
      category?: string;
      amount?: number | string;
      description?: string;
      date?: string;
      accountId?: string;
      accountName?: string;
    };

    const update: Record<string, any> = {};
    if (type) update.type = type;
    if (category) update.category = category;
    if (amount !== undefined) {
      const n = typeof amount === "string" ? Number(amount) : amount;
      if (!isFinite(n as number)) {
        return res.status(400).json({ error: "amount must be numeric" });
      }
      update.amount = n;
    }
    if (description !== undefined) update.description = description;
    if (date) update.date = new Date(date);
    if (accountId !== undefined) update.accountId = accountId || undefined;
    if (accountName !== undefined) update.accountName = accountName || undefined;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: new mongoose.Types.ObjectId(String(req.user)) },
      update,
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found or not authorized" });
    }

    console.log("✏️ Transaction updated:", transaction._id);
    res.json(transaction);
  } catch (err: any) {
    console.error("❌ Error updating transaction:", err);
    res.status(500).json({ error: "Error updating transaction", details: err.message || err });
  }
});

/** -------------------------------------------
 * GET /api/transactions/stats
 * Category totals (income/expense) — respects account filters
 * Query: startDate, endDate, accountId, accountIds
 * ------------------------------------------- */
router.get("/stats", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, accountId, accountIds } = req.query as {
      startDate?: string;
      endDate?: string;
      accountId?: string;
      accountIds?: string;
    };

    const match: any = { userId: new mongoose.Types.ObjectId(String(req.user)) };

    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const ids = parseAccountIds({ accountId, accountIds });
    if (ids.length === 1) match.accountId = ids[0];
    else if (ids.length > 1) match.accountId = { $in: ids };

    const stats = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { category: "$category", type: "$type" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.category",
          totals: { $push: { type: "$_id.type", totalAmount: "$totalAmount", count: "$count" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const formatted = stats.map((stat) => {
      const income = stat.totals.find((t: any) => t.type === "income") || { totalAmount: 0, count: 0 };
      const expense = stat.totals.find((t: any) => t.type === "expense") || { totalAmount: 0, count: 0 };

      return {
        category: stat._id,
        income: income.totalAmount,
        incomeCount: income.count,
        expense: expense.totalAmount,
        expenseCount: expense.count,
      };
    });

    res.json(formatted);
  } catch (err: any) {
    console.error("❌ Error fetching stats:", err);
    res.status(500).json({ error: "Error fetching transaction stats", details: err.message });
  }
});

/** -------------------------------------------
 * GET /api/transactions/summary
 * Time-series (income/expense/net) — respects account filters
 * Query: granularity, startDate, endDate, accountId, accountIds
 * ------------------------------------------- */
router.get("/summary", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { granularity = "month", startDate, endDate, accountId, accountIds } = req.query as {
      granularity?: "day" | "month" | "year";
      startDate?: string;
      endDate?: string;
      accountId?: string;
      accountIds?: string;
    };

    const userId = new mongoose.Types.ObjectId(String(req.user));
    const match: Record<string, any> = { userId };

    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

    const ids = parseAccountIds({ accountId, accountIds });
    if (ids.length === 1) match.accountId = ids[0];
    else if (ids.length > 1) match.accountId = { $in: ids };

    const formatMap: Record<"day" | "month" | "year", string> = {
      day: "%Y-%m-%d",
      month: "%Y-%m",
      year: "%Y",
    };
    const format = formatMap[(granularity as "day" | "month" | "year") ?? "month"];

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format, date: "$date" } },
          income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
          expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          period: "$_id",
          income: 1,
          expense: 1,
          net: { $subtract: ["$income", "$expense"] },
        },
      },
      { $sort: { period: 1 } },
    ];

    const data = await Transaction.aggregate(pipeline);
    res.json({ granularity, data });
  } catch (err: any) {
    console.error("❌ Summary error:", err.message || err);
    res.status(500).json({ error: "Failed to fetch summary", details: err.message || err });
  }
});

/** -------------------------------------------
 * POST /api/transactions/_backfill-accountIds
 * One-time helper: fill accountId/accountName on existing Plaid rows
 * ------------------------------------------- */
router.post("/_backfill-accountIds", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));

    const user = await User.findById(String(req.user));
    if (!user?.plaidAccessToken) return res.status(400).json({ error: "No Plaid account linked" });
    const accessToken = decrypt(user.plaidAccessToken);

    // accounts → names
    const accountsResp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const accountsById = new Map<string, any>();
    for (const a of accountsResp.data.accounts) accountsById.set(a.account_id, a);

    // last 30 days from Plaid
    const startDate = new Date(); startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();
    const plaidResp = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
    });

    const maps = new Map<string, { accountId?: string; accountName?: string }>();
    for (const t of plaidResp.data.transactions) {
      const key = `${new Date(t.date).toISOString().slice(0, 10)}|${Math.abs(t.amount)}|${t.name}`;
      const acc = t.account_id ? accountsById.get(t.account_id) : undefined;
      const accountName = acc?.name || acc?.official_name || acc?.subtype || acc?.type || undefined;
      maps.set(key, { accountId: t.account_id, accountName });
    }

    // local docs missing accountId
    const local = await Transaction.find({
      userId,
      source: "plaid",
      date: {
        $gte: new Date(startDate.toISOString().slice(0, 10)),
        $lte: new Date(endDate.toISOString().slice(0, 10)),
      },
      $or: [{ accountId: { $exists: false } }, { accountId: null }],
    }).lean();

    const ops: any[] = [];
    for (const t of local) {
      const key = `${new Date(t.date).toISOString().slice(0, 10)}|${t.amount}|${t.description}`;
      const m = maps.get(key);
      if (m?.accountId) {
        ops.push({
          updateOne: {
            filter: { _id: t._id },
            update: { $set: { accountId: m.accountId, accountName: m.accountName } },
          },
        });
      }
    }

    if (ops.length) await Transaction.bulkWrite(ops, { ordered: false });

    res.json({ updated: ops.length, scanned: local.length });
  } catch (e: any) {
    console.error("❌ backfill error:", e?.message || e);
    res.status(500).json({ error: "Backfill failed", details: e?.message || e });
  }
});


export default router;
