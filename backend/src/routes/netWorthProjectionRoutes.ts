// backend/src/routes/netWorthProjectionRoutes.ts
import { Router, Response } from "express";
import mongoose, { PipelineStage } from "mongoose";
import { protect, AuthRequest } from "../middleware/authMiddleware";
import Transaction from "../models/Transaction";
import PlaidBalanceSnapshot from "../models/PlaidBalanceSnapshot";
import { parseAccountIds, applyAccountFilter } from "../utils/accountFilter";

const router = Router();

console.log("🔌 netWorthProjectionRoutes: file loaded");

/**
 * GET /api/net-worth-projection/history
 * Returns historical net worth data calculated from transactions
 * Query params:
 * - startDate: ISO string (inclusive)
 * - endDate: ISO string (exclusive)
 * - granularity: "day" | "month" | "week" (default: "month")
 * - accountId, accountIds, accountIdsCsv: filter by accounts
 */
router.get("/history", protect, async (req: AuthRequest, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      granularity = "month",
      accountId,
      accountIds,
      accountIdsCsv,
    } = req.query as {
      startDate?: string;
      endDate?: string;
      granularity?: "day" | "month" | "week";
      accountId?: string;
      accountIds?: string;
      accountIdsCsv?: string;
    };

    const userId = new mongoose.Types.ObjectId(String(req.user));

    // Get current net worth as baseline
    const currentNetWorth = await getCurrentNetWorth(userId);

    // Default to last 12 months if no dates provided
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMonth(defaultStart.getMonth() - 12);

    const start = startDate ? new Date(startDate) : defaultStart;
    const end = endDate ? new Date(endDate) : now;

    // Build transaction filter
    const match: Record<string, any> = {
      userId,
      date: { $gte: start, $lt: end },
    };

    const ids = parseAccountIds({ accountId, accountIds, accountIdsCsv });
    applyAccountFilter(match, ids);

    // Group transactions by time period
    const formatMap: Record<"day" | "month" | "week", string> = {
      day: "%Y-%m-%d",
      month: "%Y-%m",
      week: "%Y-%U",
    };
    const fmt = formatMap[granularity] || "%Y-%m";

    const pipeline: mongoose.PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: {
            period: {
              $dateToString: {
                format: fmt,
                date: "$date",
                timezone: "UTC",
              },
            },
            type: "$type",
          },
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.period": 1 } },
    ];

    const results = await Transaction.aggregate(pipeline);

    // Process results into time series
    const periodMap = new Map<string, { income: number; expense: number }>();
    const periods: string[] = [];

    for (const r of results) {
      if (!r._id || !r._id.period) continue;
      const period = r._id.period;
      if (!periods.includes(period)) periods.push(period);

      const existing = periodMap.get(period) || { income: 0, expense: 0 };
      const total = Number(r.total) || 0;
      if (r._id.type === "income") {
        existing.income += Math.abs(total);
      } else {
        existing.expense += Math.abs(total);
      }
      periodMap.set(period, existing);
    }

    // Sort periods chronologically
    periods.sort();

    // Calculate cumulative net worth (working backwards from current)
    const data: Array<{
      date: string;
      netWorth: number;
      income: number;
      expense: number;
      cashflow: number;
    }> = [];

    if (periods.length === 0) {
      // No historical data, just return current
      const currentPeriod = now.toISOString().slice(0, 7); // YYYY-MM
      data.push({
        date: currentPeriod,
        netWorth: currentNetWorth,
        income: 0,
        expense: 0,
        cashflow: 0,
      });
    } else {
      // Start from current net worth and work backwards
      let runningNetWorth = currentNetWorth;

      // Process periods in reverse to calculate historical net worth
      // Start from the second-to-last period and work backwards
      for (let i = periods.length - 2; i >= 0; i--) {
        const period = periods[i];
        const totals = periodMap.get(period) || { income: 0, expense: 0 };
        const cashflow = totals.income - totals.expense;

        // Subtract this period's cashflow to get net worth at start of period
        runningNetWorth -= cashflow;

        data.unshift({
          date: period,
          netWorth: runningNetWorth,
          income: totals.income,
          expense: totals.expense,
          cashflow,
        });
      }

      // Add the last period with actual current net worth
      const lastPeriod = periods[periods.length - 1];
      const lastTotals = periodMap.get(lastPeriod) || { income: 0, expense: 0 };
      data.push({
        date: lastPeriod,
        netWorth: currentNetWorth,
        income: lastTotals.income,
        expense: lastTotals.expense,
        cashflow: lastTotals.income - lastTotals.expense,
      });
    }

    res.json({ data, currentNetWorth });
  } catch (err: any) {
    console.error("❌ /net-worth-projection/history error:", err);
    console.error("Error stack:", err?.stack);
    res.status(500).json({
      error: "Failed to fetch net worth history",
      details: err?.message || String(err),
      stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
  }
});

/**
 * GET /api/net-worth-projection/categories
 * Returns expense breakdown by category for prediction adjustments
 */
router.get("/categories", protect, async (req: AuthRequest, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      accountId,
      accountIds,
      accountIdsCsv,
    } = req.query as {
      startDate?: string;
      endDate?: string;
      accountId?: string;
      accountIds?: string;
      accountIdsCsv?: string;
    };

    const userId = new mongoose.Types.ObjectId(String(req.user));

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMonth(defaultStart.getMonth() - 3); // Last 3 months

    const start = startDate ? new Date(startDate) : defaultStart;
    const end = endDate ? new Date(endDate) : now;

    const match: Record<string, any> = {
      userId,
      type: "expense",
      date: { $gte: start, $lt: end },
    };

    const ids = parseAccountIds({ accountId, accountIds, accountIdsCsv });
    applyAccountFilter(match, ids);

    const pipeline: mongoose.PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: "$category",
          total: { $sum: { $abs: "$amount" } },
          count: { $sum: 1 },
          avgAmount: { $avg: { $abs: "$amount" } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 }, // Top 20 categories
    ];

    const results = await Transaction.aggregate(pipeline);

    const categories = results.map((r) => ({
      category: r._id || "Uncategorized",
      total: Math.abs(r.total),
      count: r.count,
      avgAmount: Math.abs(r.avgAmount || 0),
      monthlyAvg: Math.abs(r.total) / Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000))),
    }));

    res.json({ categories });
  } catch (err: any) {
    console.error("❌ /net-worth-projection/categories error:", err);
    res.status(500).json({
      error: "Failed to fetch categories",
      details: err?.message || err,
    });
  }
});

/**
 * Helper: Get current net worth from balance snapshots (aggregate across all items)
 */
async function getCurrentNetWorth(userId: mongoose.Types.ObjectId): Promise<number> {
  try {
    // Get the latest snapshot for each item and sum them
    const items = await PlaidBalanceSnapshot.distinct("itemId", { userId });
    let totalNetWorth = 0;
    
    for (const itemId of items) {
      const snapshot = await PlaidBalanceSnapshot.findOne({ userId, itemId })
        .sort({ fetchedAt: -1 })
        .limit(1);
      if (snapshot && snapshot.netWorth) {
        totalNetWorth += snapshot.netWorth;
      }
    }
    
    return totalNetWorth;
  } catch (err) {
    console.error("Error getting current net worth:", err);
    return 0;
  }
}

router.get("/health", (_req, res) => res.json({ ok: true, where: "netWorthProjectionRoutes" }));

export default router;
