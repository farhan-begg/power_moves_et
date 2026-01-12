// backend/src/routes/widgetPreferencesRoutes.ts
import { Router, type Response } from "express";
import User from "../models/User";
import { protect, type AuthRequest } from "../middleware/authMiddleware";

const router = Router();

/* =========================================================================================
   GET /api/widget-preferences (protected)
   Get user's widget preferences
========================================================================================= */
router.get("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user).select("widgetPreferences");
    if (!user) return res.status(404).json({ error: "User not found" });

    const preferences = (user as any).widgetPreferences || {
      order: [],
      widgets: {},
    };

    return res.json(preferences);
  } catch (err: any) {
    console.error("❌ Get widget preferences error:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch widget preferences", details: err?.message || err });
  }
});

/* =========================================================================================
   PUT /api/widget-preferences (protected)
   Save user's widget preferences
========================================================================================= */
router.put("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { order, widgets } = req.body || {};

    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array" });
    }

    if (typeof widgets !== "object" || widgets === null) {
      return res.status(400).json({ error: "widgets must be an object" });
    }

    const user = await User.findByIdAndUpdate(
      req.user,
      {
        $set: {
          widgetPreferences: {
            order,
            widgets,
          },
        },
      },
      { new: true }
    ).select("widgetPreferences");

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({
      order: (user as any).widgetPreferences?.order || [],
      widgets: (user as any).widgetPreferences?.widgets || {},
    });
  } catch (err: any) {
    console.error("❌ Save widget preferences error:", err?.message || err);
    return res.status(500).json({ error: "Failed to save widget preferences", details: err?.message || err });
  }
});

export default router;
