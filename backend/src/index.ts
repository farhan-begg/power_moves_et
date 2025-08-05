import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors"; // ✅ Import cors
import transactionRoutes from "./routes/transactionRoutes";
import plaidRoutes from "./routes/plaidRoutes";
import authRoutes from "./routes/authRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(express.json()); // Parse JSON
app.use(express.urlencoded({ extended: true })); // Parse form-urlencoded

// ✅ Enable CORS for frontend
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
// Debugging (safe: logs parsed body, not raw stream)
app.use((req, res, next) => {
  console.log("📝 Request:", req.method, req.url);
  console.log("📝 Headers:", req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("📝 Parsed Body:", req.body);
  }
  next();
});

// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/plaid", plaidRoutes);

// ✅ MongoDB connection
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Test route
app.get("/", (req, res) => {
  res.send("🚀 Expense Tracker Backend is Running!");
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
