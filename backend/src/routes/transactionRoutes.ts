import { Router, type Response } from "express";
import mongoose, { PipelineStage, Types } from "mongoose";
import Transaction from "../models/Transaction";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import ManualAccount, { ManualAccountDoc } from "../models/ManualAccount";
import Category from "../models/Category";

const router = Router();

/* --------------------------------------------
   Helpers
-------------------------------------------- */

function parseAccountIds(q: { accountId?: string; accountIds?: string }) {
  const BAD = new Set(["__all__", "all", "undefined", "null", ""]);
  const single = q.accountId && !BAD.has(String(q.accountId));
  const many = (q.accountIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !BAD.has(s));
  if (single && many.length) return Array.from(new Set([q.accountId!, ...many]));
  if (single) return [q.accountId!];
  if (many.length) return many;
  return [];
}

function isManualAccountId(id?: string | null): id is string {
  return !!id && id.startsWith("manual:");
}

function manualAccountMongoId(manualAccountId: string): string | null {
  if (!isManualAccountId(manualAccountId)) return null;
  return manualAccountId.slice("manual:".length) || null;
}

async function verifyManualAccountOwnership(
  userId: Types.ObjectId,
  manualId: string
): Promise<ManualAccountDoc | null> {
  const mongoId = manualAccountMongoId(manualId);
  if (!mongoId) return null;
  if (!mongoose.isValidObjectId(mongoId)) return null;
  const acct = await ManualAccount.findOne({ _id: mongoId, userId });
  return acct || null;
}

async function getOrCreateManualAccountByName(
  userId: Types.ObjectId,
  nameRaw: string,
  currency?: string
): Promise<{ accountId: string; accountName: string }> {
  const name = (nameRaw || "").trim();
  if (!name) throw new Error("manualAccountName cannot be empty");

  const existing = await ManualAccount.findOne({
    userId,
    name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
  });

  if (existing) {
    return {
      accountId: `manual:${String(existing._id)}`,
      accountName: existing.name,
    };
  }

  const created = await ManualAccount.create({
    userId,
    name,
    currency: currency || "USD",
  });

  return {
    accountId: `manual:${String(created._id)}`,
    accountName: created.name,
  };
}

/* --------------------------------------------
   Manual Accounts endpoints
-------------------------------------------- */

router.get("/manual-accounts", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));

    const items = await ManualAccount.find({ userId })
      .sort({ createdAt: -1 })
      .lean<{
        _id: Types.ObjectId;
        name: string;
        currency?: string;
        createdAt: Date;
        updatedAt: Date;
      }[]>();

    const data = items.map((a) => ({
      _id: a._id,
      accountId: `manual:${String(a._id)}`,
      name: a.name,
      currency: a.currency || "USD",
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));

    res.json(data);
  } catch (err: any) {
    console.error("❌ GET /manual-accounts error:", err?.message || err);
    res.status(500).json({ error: "Failed to list manual accounts", details: err?.message || err });
  }
});

router.post("/manual-accounts", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const { name, currency = "USD" } = req.body as { name?: string; currency?: string };
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const created = await ManualAccount.create({ userId, name: name.trim(), currency });

    res.status(201).json({
      _id: created._id,
      accountId: `manual:${String(created._id)}`,
      name: created.name,
      currency: created.currency || "USD",
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (err: any) {
    console.error("❌ POST /manual-accounts error:", err?.message || err);
    res.status(500).json({ error: "Failed to create manual account", details: err?.message || err });
  }
});

/* --------------------------------------------
   Transactions CRUD
-------------------------------------------- */

router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const {
      type, amount, description, date, source,
      categoryId, category, accountId, accountName,
    } = req.body as {
      type: "income" | "expense";
      amount: number;
      description?: string;
      date: string | Date;
      source: "manual" | "plaid";
      categoryId?: string;
      category?: string;
      accountId?: string;
      accountName?: string;
    };

    if (!type || !amount || !date || !source) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 🔽 Category resolution (Option 1 typing + Option A omission)
    let finalCategoryName = (category || "Uncategorized").trim();
    let finalCategoryId: Types.ObjectId | undefined;

    if (categoryId) {
      // Mongoose can cast string → ObjectId; casting here is safe but not required.
      const cat = await Category.findOne({ _id: categoryId, userId });
      if (!cat) return res.status(400).json({ error: "Invalid categoryId" });
      finalCategoryId = cat._id;       // 👈 assign directly
      finalCategoryName = cat.name;
    } else if (finalCategoryName) {
      const existing = await Category.findOne({ userId, name: finalCategoryName });
      if (existing) {
        finalCategoryId = existing._id; // 👈 assign directly
      } else {
        const created = await Category.create({ userId, name: finalCategoryName });
        finalCategoryId = created._id;  // 👈 assign directly
      }
    }

    // Create (omit categoryId if undefined)
    const doc = await Transaction.create({
      userId,
      type,
      amount,
      description: description?.trim(),
      date: new Date(date),
      source,
      category: finalCategoryName,
      ...(finalCategoryId ? { categoryId: finalCategoryId } : {}),
      accountId,
      accountName,
    });

    res.json(doc);
  } catch (err: any) {
    console.error("❌ Error saving transaction:", err?.message || err);
    res.status(500).json({ error: "Error saving transaction", details: err?.message || err });
  }
});
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const {
      type, category, source,
      startDate, endDate,
      minAmount, maxAmount,
      sortBy, order,
      page, limit,
      accountId, accountIds,
    } = req.query as {
      type?: string;
      category?: string;
      source?: "manual" | "plaid";
      startDate?: string;
      endDate?: string;           // EXCLUSIVE (UI sends endExclusiveISO)
      minAmount?: string;
      maxAmount?: string;
      sortBy?: string;
      order?: "asc" | "desc";
      page?: string;
      limit?: string;
      accountId?: string;         // may be "__all__", "all", "", etc.
      accountIds?: string;        // CSV
    };

    const userId = new mongoose.Types.ObjectId(String(req.user));
    const filter: Record<string, any> = { userId };

    // ---------- basic filters ----------
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (source) filter.source = source;

    // numeric range (guard against NaN)
    const min = minAmount != null ? Number(minAmount) : undefined;
    const max = maxAmount != null ? Number(maxAmount) : undefined;
    if (Number.isFinite(min)) filter.amount = { ...(filter.amount || {}), $gte: min };
    if (Number.isFinite(max)) filter.amount = { ...(filter.amount || {}), $lte: max };

    // dates (endDate EXCLUSIVE)
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(String(startDate));
      if (endDate)  filter.date.$lt  = new Date(String(endDate)); // ✅ exclusive
    }

    // ---------- account scoping ----------
    // parseAccountIds ignores "__all__", "all", "undefined", "null", "" ✅
    const ids = parseAccountIds({ accountId, accountIds });
    if (ids.length === 1) {
      // support both normalized and legacy field
      filter.$or = [{ accountId: ids[0] }, { account_id: ids[0] }];
    } else if (ids.length > 1) {
      filter.$or = [{ accountId: { $in: ids } }, { account_id: { $in: ids } }];
    }

    // ---------- sorting & paging ----------
    const sortField = (sortBy as string) || "date";
    const sortOrder = order === "asc" ? 1 : -1;
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10)); // ✅ sane bounds
    const skip = (pageNum - 1) * limitNum;

    // Helpful debug logs (keep in dev)
    console.log("GET /api/transactions raw query:", req.query);
    console.log("GET /api/transactions Mongo filter:", JSON.stringify(filter));

    // ---------- query ----------
    const [total, transactions] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .lean() // ✅ faster reads
    ]);

    res.json({
      total,
      page: pageNum,
      pages: Math.max(1, Math.ceil(total / limitNum)),
      transactions,
    });
  } catch (err: any) {
    console.error("❌ Error fetching transactions:", err?.message || err);
    res.status(500).json({ error: "Error fetching transactions", details: err?.message || err });
  }
});

router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const {
      type,
      category,               // optional plain name (we'll resolve/create)
      categoryId,             // ✅ new: prefer this when provided
      amount,
      description,
      date,
      accountId,
      accountName,
      manualAccountName,
      manualAccountCurrency,
    } = req.body as {
      type?: "income" | "expense";
      category?: string;
      categoryId?: string | null;
      amount?: number | string;
      description?: string;
      date?: string;
      accountId?: string | null; // set null/"" → global
      accountName?: string | null;
      manualAccountName?: string;
      manualAccountCurrency?: string;
    };

    const userId = new mongoose.Types.ObjectId(String(req.user));

    const update: Record<string, any> = {};

    /* ---------- basic fields ---------- */
    if (type) update.type = type;
    if (amount !== undefined) {
      const n = typeof amount === "string" ? Number(amount) : amount;
      if (!Number.isFinite(n as number)) {
        return res.status(400).json({ error: "amount must be numeric" });
      }
      update.amount = n;
    }
    if (description !== undefined) update.description = description?.trim();
    if (date) update.date = new Date(date);

    /* ---------- category handling ---------- */
    if (categoryId !== undefined) {
      // When categoryId is sent, it takes precedence.
      if (!categoryId) {
        // If you want to allow clearing, uncomment these lines:
        // update.categoryId = undefined;
        // update.category = "Uncategorized";
        // return res.json(await Transaction.findOneAndUpdate({ _id: req.params.id, userId }, update, { new: true, runValidators: true }));
        return res.status(400).json({ error: "categoryId cannot be empty" });
      }
      if (!mongoose.isValidObjectId(String(categoryId))) {
        return res.status(400).json({ error: "Invalid categoryId" });
      }
      const cat = await Category.findOne({
        _id: new mongoose.Types.ObjectId(String(categoryId)),
        userId,
      });
      if (!cat) return res.status(404).json({ error: "Category not found" });

      update.categoryId = cat._id;
      update.category   = cat.name; // keep denormalized name in sync
    } else if (category !== undefined) {
      // If only a plain name is sent, resolve or create it for this user.
      const name = (category || "").trim();
      if (!name) return res.status(400).json({ error: "category cannot be empty" });

      let cat = await Category.findOne({ userId, name });
      if (!cat) {
        cat = await Category.create({ userId, name });
      }
      update.categoryId = cat._id;
      update.category   = cat.name;
    }

    /* ---------- account scoping ---------- */
    if (accountId !== undefined) {
      if (accountId === null || accountId === "") {
        update.accountId = undefined; // global (no specific account)
        update.accountName = undefined;
      } else {
        if (isManualAccountId(accountId)) {
          const owns = await verifyManualAccountOwnership(userId, accountId);
          if (!owns) {
            return res
              .status(403)
              .json({ error: "Not authorized to use that manual account" });
          }
          update.accountName = owns.name;
        } else if (accountName !== undefined) {
          update.accountName = accountName || undefined;
        }
        update.accountId = accountId;
      }
    } else if (manualAccountName) {
      const created = await getOrCreateManualAccountByName(
        userId,
        manualAccountName,
        manualAccountCurrency || "USD"
      );
      update.accountId = created.accountId;
      update.accountName = created.accountName;
    } else if (accountName !== undefined) {
      update.accountName = accountName || undefined;
    }

    /* ---------- write ---------- */
    const txn = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId },
      update,
      { new: true, runValidators: true }
    );

    if (!txn) {
      return res
        .status(404)
        .json({ error: "Transaction not found or not authorized" });
    }
    res.json(txn);
  } catch (err: any) {
    console.error("❌ Error updating transaction:", err?.message || err);
    res
      .status(500)
      .json({ error: "Error updating transaction", details: err?.message || err });
  }
});


router.delete("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const txn = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: new mongoose.Types.ObjectId(String(req.user)),
    });
    if (!txn) return res.status(404).json({ error: "Transaction not found or not authorized" });
    res.json({ message: "Transaction deleted successfully", id: txn._id });
  } catch (err: any) {
    console.error("❌ Error deleting transaction:", err?.message || err);
    res.status(500).json({ error: "Error deleting transaction", details: err?.message || err });
  }
});

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
      if (startDate) match.date.$gte = new Date(String(startDate));
      if (endDate)  match.date.$lt  = new Date(String(endDate)); // EXCLUSIVE
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
      const income  = stat.totals.find((t: any) => t.type === "income")  || { totalAmount: 0, count: 0 };
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
    console.error("❌ Error fetching stats:", err?.message || err);
    res.status(500).json({ error: "Error fetching transaction stats", details: err?.message });
  }
});

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
      if (startDate) match.date.$gte = new Date(String(startDate));
      if (endDate)  match.date.$lt  = new Date(String(endDate));
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
          income:  { $sum: { $cond: [{ $eq: ["$type", "income"]  }, "$amount", 0] } },
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
    console.error("❌ Summary error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch summary", details: err?.message || err });
  }
});


router.post("/bulk-categorize", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const { ids, categoryId, categoryName } = req.body as {
      ids: string[];                // array of txn _id strings
      categoryId?: string;          // optional: existing Category _id
      categoryName?: string;        // optional: create/find by name
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids[] is required" });
    }

    // Resolve a final category id + name (mirrors your POST / route behavior)
    let finalCategoryName = (categoryName || "").trim();
    let finalCategoryId: Types.ObjectId | undefined;

    if (categoryId) {
      const cat = await Category.findOne({ _id: new Types.ObjectId(categoryId), userId });
      if (!cat) return res.status(400).json({ error: "Invalid categoryId" });
      finalCategoryId = new Types.ObjectId(String(cat._id));
      finalCategoryName = cat.name;
    } else if (finalCategoryName) {
      const existing = await Category.findOne({ userId, name: finalCategoryName });
      if (existing) {
        finalCategoryId = new Types.ObjectId(String(existing._id));
      } else {
        const created = await Category.create({ userId, name: finalCategoryName });
        finalCategoryId = new Types.ObjectId(String(created._id));
      }
    } else {
      return res.status(400).json({ error: "Provide categoryId or categoryName" });
    }

    const objectIds = ids
      .filter((s) => s && mongoose.isValidObjectId(s))
      .map((s) => new Types.ObjectId(s));

    if (objectIds.length === 0) {
      return res.status(400).json({ error: "No valid transaction ids" });
    }

    const result = await Transaction.updateMany(
      { _id: { $in: objectIds }, userId },
      {
        $set: {
          category: finalCategoryName,
          ...(finalCategoryId ? { categoryId: finalCategoryId } : {}),
        },
      }
    );

    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err: any) {
    console.error("❌ /bulk-categorize error:", err?.message || err);
    res.status(500).json({ error: "Bulk categorize failed", details: err?.message || err });
  }
});


export default router;
