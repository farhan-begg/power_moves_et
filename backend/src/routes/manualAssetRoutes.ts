// server/routes/manualAssetRoutes.ts
import { Router, Response } from "express";
import mongoose from "mongoose";
import ManualAsset from "../models/ManualAsset";
import { protect, AuthRequest } from "../middleware/authMiddleware";

const router = Router();

const BAD = new Set(["", "__all__", "all", "null", "undefined"]);
const normalizeScope = (v: any) => (v === "account" ? "account" : "global");
const normalizeAccountId = (v?: string | null) => {
  const s = (v ?? "").trim();
  return !s || BAD.has(s) ? null : s;
};

// List all manual assets (for editor list; not filtered by account)
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const items = await ManualAsset.find({ userId }).sort({ createdAt: -1 });
  res.json(items);
});

// Create
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const {
    name,
    type = "other",
    value,
    currency = "USD",
    notes,
    asOf,
    accountScope,   // "global" | "account"
    accountId,      // optional
  } = req.body;

  if (value == null || isNaN(Number(value))) {
    return res.status(400).json({ error: "value is required and must be a number" });
  }

  const scope = normalizeScope(accountScope);
  const scopedAccountId = scope === "account" ? normalizeAccountId(accountId) : null;

  const item = await ManualAsset.create({
    userId,
    name,
    type,
    value: Number(value),
    currency,
    notes,
    asOf: asOf ? new Date(asOf) : new Date(),
    accountScope: scope,
    accountId: scopedAccountId,
  });

  res.status(201).json(item);
});

// Update
router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const {
    name,
    type,
    value,
    currency,
    notes,
    asOf,
    accountScope,
    accountId,
  } = req.body;

  const update: any = {};
  if (name !== undefined) update.name = name;
  if (type !== undefined) update.type = type;
  if (value !== undefined) update.value = Number(value);
  if (currency !== undefined) update.currency = currency;
  if (notes !== undefined) update.notes = notes;
  if (asOf !== undefined) update.asOf = asOf ? new Date(asOf) : new Date();
  if (accountScope !== undefined) update.accountScope = normalizeScope(accountScope);
  if (accountScope === "account") update.accountId = normalizeAccountId(accountId);
  if (accountScope === "global") update.accountId = null;

  const item = await ManualAsset.findOneAndUpdate(
    { _id: req.params.id, userId },
    update,
    { new: true, runValidators: true }
  );

  if (!item) return res.status(404).json({ error: "Manual asset not found" });
  res.json(item);
});

// Delete
router.delete("/:id", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const item = await ManualAsset.findOneAndDelete({ _id: req.params.id, userId });
  if (!item) return res.status(404).json({ error: "Manual asset not found" });
  res.json({ id: item._id });
});

export default router;
