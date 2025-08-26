import { Router, Response } from "express";
import mongoose from "mongoose";
import ManualAsset from "../models/ManualAsset";
import { protect, AuthRequest } from "../middleware/authMiddleware";

const router = Router();

// List all manual assets
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const items = await ManualAsset.find({ userId }).sort({ createdAt: -1 });
  res.json(items);
});

// Create
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { name, type = "other", value, currency = "USD", notes, asOf } = req.body;
  if (value == null || isNaN(Number(value))) {
    return res.status(400).json({ error: "value is required and must be a number" });
  }
  const item = await ManualAsset.create({
    userId, name, type, value: Number(value), currency, notes, asOf: asOf ? new Date(asOf) : new Date()
  });
  res.status(201).json(item);
});

// Update
router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { name, type, value, currency, notes, asOf } = req.body;
  const item = await ManualAsset.findOneAndUpdate(
    { _id: req.params.id, userId },
    { name, type, value, currency, notes, asOf },
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
