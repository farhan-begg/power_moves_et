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
import netWorthProjectionRoutes from "./routes/netWorthProjectionRoutes";
import widgetPreferencesRoutes from "./routes/widgetPreferencesRoutes";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Middleware ---------- */
/* ---------- Middleware ---------- */
console.log("🔥 USING plaidRoutes FILE:", __filename);

// ✅ 1) CORS FIRST
const allowedOrigins = [
  "http://localhost:3001",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "https://powermoves.onrender.com",
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    console.log("🌍 CORS origin:", JSON.stringify(origin));

    // allow curl/postman/no-origin
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // ✅ DON'T throw Error (no 500)
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));


// ✅ 2) THEN parse body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 3) Logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log("📝 Request:", req.method, req.url);
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
app.use("/api/net-worth-projection", netWorthProjectionRoutes);
app.use("/api/widget-preferences", widgetPreferencesRoutes);


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
