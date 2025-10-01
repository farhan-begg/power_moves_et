import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";

import transactionRoutes from "./routes/transactionRoutes";
import authRoutes from "./routes/authRoutes";
import manualAssetRoutes from "./routes/manualAssetRoutes";
import positionsRoutes from "./routes/positionsRoutes";
import adviceRoutes from "./routes/adviceRoutes";
import goalRoutes from "./routes/goalRoutes";
import manualAccountRoutes from "./routes/manualAccountRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import recurringRoutes from "./routes/recurringRoutes";
import cryptoRoutes from "./routes/cryptoRoutes";
import plaidRoutes from "./routes/plaidRoutes";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Middleware ---------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = [
  "http://localhost:3000",               // local React dev
  "https://your-frontend.vercel.app"     // deployed frontend
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow Postman/curl
      if (allowedOrigins.some(o => origin.startsWith(o))) {
        return callback(null, true);
      }
      console.warn("🚫 Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }) // ✅ close cors() properly
);

// ✅ now this parses fine
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log("📝 Request:", req.method, req.url);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📝 Parsed Body:", req.body);
  }
  next();
});


/* ---------- Routes ---------- */
app.use("/api/crypto", cryptoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/stocks", positionsRoutes);
app.use("/api/plaid", plaidRoutes)
app.use("/api/manual-assets", manualAssetRoutes);
app.use("/api/advice", adviceRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/manual-accounts", manualAccountRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/recurring", recurringRoutes);


const RUN_DAILY_MS = 24 * 60 * 60 * 1000;
setTimeout(() => {
  setInterval(async () => {
    try {
      // If you want all users, iterate users here. For now, skip.
      // This example is a stub; you likely want a worker/queue.
      console.log("⏰ (stub) daily recurring detection");
    } catch (e) {
      console.error("daily detector failed:", e);
    }
  }, RUN_DAILY_MS);
}, 2 * 60 * 1000);


/* ---------- 404 + Error Handlers ---------- */
// 404 for unknown API routes (after all routers)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Route not found", path: req.path });
  }
  next();
});

// Central error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Server error";
  console.error("💥 Unhandled error:", err);
  res.status(500).json({ error: message });
});

/* ---------- Mongo + Start ---------- */
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error("MONGO_URI is not set in environment");
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("✅ MongoDB Connected");

    app.listen(PORT, () => {
      if (process.env.NODE_ENV === "production") {
        console.log(`🚀 Server is live on Render (bound to port ${PORT})`);
        console.log(`🌐 Public URL: ${process.env.RENDER_EXTERNAL_URL || "Render will assign one"}`);
      } else {
        console.log(`🚀 Server running locally at http://localhost:${PORT}`);
      }
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });


export default app;
