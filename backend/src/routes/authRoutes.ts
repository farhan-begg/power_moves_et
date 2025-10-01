// src/routes/auth.ts
import { Router, Response } from "express";
import User from "../models/User";
import jwt from "jsonwebtoken";
import plaidClient from "../services/plaidService";
import { decrypt } from "../utils/cryptoUtils";
import Transaction from "../models/Transaction";
import { protect, AuthRequest } from "../middleware/authMiddleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

console.log("🔐 Using JWT_SECRET:", JWT_SECRET);

function generateToken(userId: string) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1d" });
}

// =============================
// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
// =============================
router.get("/me", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user).select("-password -__v");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      plaidAccessToken: user.plaidAccessToken ?? null,
    });
  } catch (err: any) {
    console.error("❌ /me error:", err.message || err);
    res
      .status(500)
      .json({ error: "Failed to fetch user", details: err.message });
  }
});

// =============================
router.post("/register", async (req, res) => {
  try {
    console.log("📥 Register body:", req.body);

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const user = new User({ 
      name, 
      email, 
      password, 
      plaidAccessToken: null // explicitly start null
    });

    await user.save();

    const token = generateToken((user._id as any).toString());

    return res.status(201).json({
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        plaidLinked: !!user.plaidAccessToken 
      },
    });
  } catch (err: any) {
    console.error("❌ Registration error:", err.message, err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Email already registered" });
    }
    return res
      .status(500)
      .json({ error: "Registration failed", details: err.message });
  }
});


// =============================
// @route   POST /api/auth/login
// @desc    Login user + auto Plaid sync
// @access  Public
// =============================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

   const token = generateToken((user._id as any).toString());

    // 🔄 Background Plaid sync (fire and forget)
    (async () => {
      if (user.plaidAccessToken) {
        try {
          const accessToken = decrypt(user.plaidAccessToken);

          const startDate = new Date();
          startDate.setDate(startDate.getDate() - 90); // last 90 days
          const endDate = new Date();

          const plaidResponse = await plaidClient.transactionsGet({
            access_token: accessToken,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
          });

          const plaidTransactions = plaidResponse.data.transactions;

          const formattedTransactions = plaidTransactions.map((txn: any) => {
            let type: "income" | "expense" = "expense";
            if (txn.personal_finance_category?.primary?.startsWith("INCOME")) {
              type = "income";
            }

            return {
              userId: user._id,
              type,
              category:
                txn.personal_finance_category?.detailed ||
                txn.personal_finance_category?.primary ||
                txn.category?.[0] ||
                "Uncategorized",
              amount: Math.abs(txn.amount),
              date: new Date(txn.date),
              description: txn.name,
              source: "plaid",
            };
          });

          for (const txn of formattedTransactions) {
            await Transaction.updateOne(
              {
                userId: txn.userId,
                amount: txn.amount,
                date: txn.date,
                description: txn.description,
              },
              { $setOnInsert: txn },
              { upsert: true }
            );
          }

          console.log(
            `🔄 Synced ${formattedTransactions.length} Plaid transactions for ${user.email}`
          );
        } catch (err: any) {
          console.error("❌ Plaid sync on login failed:", err.message || err);
        }
      }
    })();

    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

export default router;
