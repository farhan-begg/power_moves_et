import { Router, type Response } from "express";
import mongoose, { Types } from "mongoose";
import { protect, AuthRequest } from "../middleware/authMiddleware";
import Category, { CategoryDoc } from "../models/Category";

const router = Router();

// List categories (current user)
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const cats = await Category.find({ userId }).sort({ name: 1 }).lean<CategoryDoc[]>();
    res.json(cats);
  } catch (err: any) {
    console.error("GET /categories error:", err?.message || err);
    res.status(500).json({ error: "Failed to list categories", details: err?.message || err });
  }
});

// Create
router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { name, icon = "💳", color = "#6B7280" } = req.body as {
      name?: string; icon?: string; color?: string;
    };

    const n = (name || "").trim();
    if (!n) return res.status(400).json({ error: "name is required" });

    const created = await Category.create({ userId, name: n, icon, color });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Category name must be unique per user" });
    }
    console.error("POST /categories error:", err?.message || err);
    res.status(500).json({ error: "Failed to create category", details: err?.message || err });
  }
});

// Update
router.put("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { id } = req.params;
    const { name, icon, color } = req.body as Partial<{ name: string; icon: string; color: string }>;

    const update: Record<string, any> = {};
    if (name !== undefined) {
      const n = (name || "").trim();
      if (!n) return res.status(400).json({ error: "name cannot be empty" });
      update.name = n;
    }
    if (icon !== undefined) update.icon = icon;
    if (color !== undefined) update.color = color;

    const cat = await Category.findOneAndUpdate({ _id: id, userId }, update, { new: true, runValidators: true });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    res.json(cat);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "Category name must be unique per user" });
    }
    console.error("PUT /categories error:", err?.message || err);
    res.status(500).json({ error: "Failed to update category", details: err?.message || err });
  }
});

// Delete
router.delete("/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new Types.ObjectId(String(req.user));
    const { id } = req.params;
    const cat = await Category.findOneAndDelete({ _id: id, userId });
    if (!cat) return res.status(404).json({ error: "Category not found" });
    res.json({ ok: true, id: cat._id });
  } catch (err: any) {
    console.error("DELETE /categories error:", err?.message || err);
    res.status(500).json({ error: "Failed to delete category", details: err?.message || err });
  }
});

export default router;
