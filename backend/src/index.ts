import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

import transactionRoutes from "./routes/transactionRoutes";
import plaidRoutes from "./routes/plaidRoutes";
import authRoutes from "./routes/authRoutes";
import manualAssetRoutes from "./routes/manualAssetRoutes";
import positionsRoutes from "./routes/positionsRoutes";
import adviceRoutes from "./routes/adviceRoutes";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Middleware ---------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Request logger (safe: logs parsed body only)
app.use((req, _res, next) => {
  console.log("📝 Request:", req.method, req.url);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📝 Parsed Body:", req.body);
  }
  next();
});

/* ---------- Routes ---------- */
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/stocks", positionsRoutes); // 👈 CORRECT mount
app.use("/api/plaid", plaidRoutes);
app.use("/api/manual-assets", manualAssetRoutes);
app.use("/api/advice", adviceRoutes);
// Health root
app.get("/", (_req, res) => {
  res.send("🚀 Expense Tracker Backend is Running!");
});

/* ---------- 404 + Error Handlers ---------- */
// 404 for unknown API routes (after all routers)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route not found", path: req.path });
  }
  next();
});

// Central error handler (so thrown errors don't look like 404s)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("💥 Unhandled error:", err);
  res.status(err?.status || 500).json({ error: err?.message || "Server error" });
});

/* ---------- Mongo + Start ---------- */
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("✅ MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
