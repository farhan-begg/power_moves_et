import { Router, Request, Response } from "express";
import mongoose, { PipelineStage } from "mongoose";
import Transaction from "../models/Transaction";
import { AuthRequest, protect } from "../middleware/authMiddleware";

const router = Router();
// Create a transaction
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { type, category, amount, description, date } = req.body;

    const transaction = new Transaction({
      userId: new mongoose.Types.ObjectId(req.user),
      type,
      category,
      amount,
      description,
      date: date || new Date(),
      source: "manual"
    });

    await transaction.save();
    console.log("✅ Transaction saved:", transaction);
    res.status(201).json(transaction);
  } catch (err: any) {
    console.error("❌ Transaction save error:", err);
    res.status(400).json({ error: "Error saving transaction", details: err.message || err });
  }
});

// Get transactions with filtering, sorting, pagination, and source breakdown
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { type, category, minAmount, maxAmount, startDate, endDate, sortBy, order, page, limit, source } = req.query;

    const userId = new mongoose.Types.ObjectId(req.user);
    const filter: any = { userId };

    if (type) filter.type = type;
    if (category) filter.category = category;
    if (source) filter.source = source;
    if (minAmount) filter.amount = { ...filter.amount, $gte: Number(minAmount) };
    if (maxAmount) filter.amount = { ...filter.amount, $lte: Number(maxAmount) };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate as string);
      if (endDate) filter.date.$lte = new Date(endDate as string);
    }

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

    // 🔹 Source breakdown: count manual vs plaid
    const sourceBreakdown = await Transaction.aggregate([
      { $match: { userId } },
      { $group: { _id: "$source", count: { $sum: 1 } } }
    ]);

    const breakdown: Record<string, number> = {};
    sourceBreakdown.forEach((item) => {
      breakdown[item._id] = item.count;
    });

    console.log(`✅ Transactions fetched: ${transactions.length} (page ${pageNum})`);

    res.json({
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      transactions,
      sourceBreakdown: breakdown
    });
  } catch (err: any) {
    console.error("❌ Error fetching transactions:", err);
    res.status(500).json({ error: "Error fetching transactions", details: err.message || err });
  }
});

router.delete("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: new mongoose.Types.ObjectId(req.user) // ✅ ensure ObjectId
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

router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { type, category, amount, description, date } = req.body;

    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: new mongoose.Types.ObjectId(req.user) }, // ✅ ensure ObjectId
      { type, category, amount, description, date },
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



// Get category breakdown (income vs expense)
router.get("/stats", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

  const match: any = { userId: new mongoose.Types.ObjectId(req.user) };


    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate as string);
      if (endDate) match.date.$lte = new Date(endDate as string);
    }

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
          totals: {
            $push: {
              type: "$_id.type",
              totalAmount: "$totalAmount",
              count: "$count",
            },
          },
        },
      },
      { $sort: { "_id": 1 } },
    ]);

    // ✅ Restructure for frontend: { category, income, expense }
    const formattedStats = stats.map((stat) => {
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

    res.json(formattedStats);
  } catch (err: any) {
    console.error("❌ Error fetching stats:", err);
    res.status(500).json({ error: "Error fetching transaction stats", details: err.message });
  }
});
router.get("/summary", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { granularity = "month", startDate, endDate } = req.query as {
      granularity?: "day" | "month" | "year";
      startDate?: string;
      endDate?: string;
    };

    const userId = new mongoose.Types.ObjectId(req.user);
    const match: Record<string, any> = { userId };

    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(startDate);
      if (endDate) match.date.$lte = new Date(endDate);
    }

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
export default router;
