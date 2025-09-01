import { Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { AuthRequest } from "../middleware/authMiddleware";
import { Goal } from "../models/Goal";

const parseNum = (v: any, def = 0) => (typeof v === "number" ? v : Number(v ?? def));

export async function createGoal(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const {
      name,
      type = "savings",
      targetAmount,
      currency = "USD",
      startDate,
      deadline,
      recurrence,
      linkages,
    } = req.body ?? {};

    if (!name || targetAmount == null) {
      return res.status(400).json({ error: "name and targetAmount are required" });
    }

    const goal = await Goal.create({
      userId: new Types.ObjectId(user),
      name,
      type,
      targetAmount: parseNum(targetAmount),
      currency,
      startDate,
      deadline,
      recurrence,
      linkages,
      currentAmount: 0,
      contributions: [],
    });

    return res.status(201).json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create goal" });
  }
}

export async function listGoals(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { type, status } = req.query as { type?: string; status?: string };
    const q: any = { userId: new Types.ObjectId(user) };
    if (type) q.type = type;
    if (status) q.status = status;

    const goals = await Goal.find(q).sort({ updatedAt: -1 }).lean();
    return res.json(goals);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to list goals" });
  }
}

export async function getGoal(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const goal = await Goal.findOne({ _id: id, userId: new Types.ObjectId(user) }).lean();
    if (!goal) return res.status(404).json({ error: "Not found" });

    return res.json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to get goal" });
  }
}

export async function updateGoal(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const patch: any = { ...req.body };
    if (patch.targetAmount != null) patch.targetAmount = parseNum(patch.targetAmount);

    const goal = await Goal.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(user) },
      patch,
      { new: true }
    );
    if (!goal) return res.status(404).json({ error: "Not found" });

    return res.json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to update goal" });
  }
}

export async function deleteGoal(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const goal = await Goal.findOneAndDelete({ _id: id, userId: new Types.ObjectId(user) });
    if (!goal) return res.status(404).json({ error: "Not found" });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to delete goal" });
  }
}

export async function addContribution(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const { amount, date, note, source = "manual", txIds } = req.body ?? {};
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const goal = await Goal.findOne({ _id: id, userId: new Types.ObjectId(user) });
    if (!goal) return res.status(404).json({ error: "Not found" });

    const amt = parseNum(amount);
    if (!amt) return res.status(400).json({ error: "amount required" });

    goal.contributions.push({
      amount: amt,
      date: date ? new Date(date) : new Date(),
      source,
      note,
      txIds,
    } as any);

    goal.currentAmount = (goal.currentAmount ?? 0) + amt;

    // Mark completed if target reached (for savings / debt). For spending limit, completion is checked at period end.
    if (goal.type !== "spending_limit" && goal.currentAmount >= goal.targetAmount) {
      goal.status = "completed";
    }

    await goal.save();
    return res.status(201).json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to add contribution" });
  }
}

export async function removeContribution(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id, contribId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(contribId)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const goal = await Goal.findOne({ _id: id, userId: new Types.ObjectId(user) });
    if (!goal) return res.status(404).json({ error: "Not found" });

    const idx = goal.contributions.findIndex((c: any) => String(c._id) === String(contribId));
    if (idx === -1) return res.status(404).json({ error: "Contribution not found" });

    goal.currentAmount -= goal.contributions[idx].amount || 0;
    goal.contributions.splice(idx, 1);

    if (goal.status === "completed" && goal.currentAmount < goal.targetAmount) {
      goal.status = "active";
    }

    await goal.save();
    return res.json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to remove contribution" });
  }
}

export async function recalculate(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const goal = await Goal.findOne({ _id: id, userId: new Types.ObjectId(user) });
    if (!goal) return res.status(404).json({ error: "Not found" });

    goal.currentAmount = (goal.contributions || []).reduce((sum, c: any) => sum + (c.amount || 0), 0);

    if (goal.type !== "spending_limit" && goal.currentAmount >= goal.targetAmount) {
      goal.status = "completed";
    }

    await goal.save();
    return res.json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to recalculate" });
  }
}

export async function rollover(req: AuthRequest, res: Response) {
  try {
    const user = String(req.user || "");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid id" });

    const goal = await Goal.findOne({ _id: id, userId: new Types.ObjectId(user) });
    if (!goal) return res.status(404).json({ error: "Not found" });

    if (goal.type !== "spending_limit") {
      return res.status(400).json({ error: "Rollover applies to spending_limit goals" });
    }

    goal.currentAmount = 0;
    goal.contributions.push({
      amount: 0,
      date: new Date(),
      source: "auto",
      note: "period rollover",
    } as any);

    await goal.save();
    return res.json(goal);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: "Failed to rollover" });
  }
}
