// server/routes/manualAccountRoutes.ts
import { Router, Response } from "express";
import mongoose from "mongoose";
import { protect, AuthRequest } from "../middleware/authMiddleware";
import ManualAccount from "../models/ManualAccount";

const router = Router();

// helper to create a stable accountId
function toIdBase(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}
async function nextManualAccountId(userId: mongoose.Types.ObjectId, name: string) {
  const base = toIdBase(name) || "manual";
  let i = 0;
  // ensure uniqueness per collection (global), keep simple
  while (true) {
    const candidate = `manual:${i === 0 ? base : `${base}-${i}`}`;
    const exists = await ManualAccount.exists({ accountId: candidate });
    if (!exists) return candidate;
    i += 1;
  }
}

// List
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const rows = await ManualAccount.find({ userId }).sort({ createdAt: -1 });
  res.json(rows);
});

// Create
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const accountId = await nextManualAccountId(userId, name);
  const row = await ManualAccount.create({ userId, accountId, name: name.trim() });
  res.status(201).json(row);
});

// Delete (optional)
router.delete("/:accountId", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { accountId } = req.params;
  const deleted = await ManualAccount.findOneAndDelete({ userId, accountId });
  if (!deleted) return res.status(404).json({ error: "Manual account not found" });
  res.json({ accountId });
});

export default router;
 