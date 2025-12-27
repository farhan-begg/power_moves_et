// backend/src/routes/auth.ts
import { Router, type Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Transaction from "../models/Transaction";
import PlaidItem from "../models/PlaidItem"; // ✅ you said you used to have this
import plaidClient from "../services/plaidService";
import { decrypt } from "../utils/cryptoUtils";
import { protect, type AuthRequest } from "../middleware/authMiddleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

console.log("🔐 Using JWT_SECRET:", JWT_SECRET);

function generateToken(userId: string) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1d" });
}

/* =========================================================================================
   GET /api/auth/me (protected)
========================================================================================= */
router.get("/me", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user).select("-password -__v");
    if (!user) return res.status(404).json({ error: "User not found" });

    // optional: show whether they have any connected Plaid items
    const plaidItemsCount = await PlaidItem.countDocuments({
      userId: user._id,
      status: "active",
    });

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      plaidItemsCount,
    });
  } catch (err: any) {
    console.error("❌ /me error:", err?.message || err);
    return res.status(500).json({ error: "Failed to fetch user", details: err?.message || err });
  }
});

/* =========================================================================================
   POST /api/auth/register
========================================================================================= */
router.post("/register", async (req, res) => {
  try {
    console.log("📥 Register body:", req.body);

    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: "Email already registered" });

    const user = new User({ name, email, password });
    await user.save();

    const token = generateToken(String(user._id));

    return res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err: any) {
    console.error("❌ Registration error:", err?.message || err);
    if (err?.code === 11000) return res.status(400).json({ error: "Email already registered" });

    return res.status(500).json({ error: "Registration failed", details: err?.message || err });
  }
});

/* =========================================================================================
   POST /api/auth/login  (multi-bank Plaid sync using PlaidItem)
========================================================================================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = generateToken(String(user._id));

    // 🔄 Background Plaid sync (fire-and-forget) using PlaidItem(s)
    (async () => {
      try {
        const userId = user._id;

        // ✅ This is the key difference: we no longer use user.plaidAccessToken
        const items = await PlaidItem.find({ userId, status: "active" }).lean();

        if (!items.length) {
          console.log(`ℹ️ No active PlaidItem records for ${user.email}. Skipping Plaid sync.`);
          return;
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);
        const endDate = new Date();

        for (const item of items) {
          try {
            const encryptedToken = (item as any).accessToken;
            if (!encryptedToken) {
              console.log(`⚠️ PlaidItem missing accessToken. itemId=${(item as any).itemId}`);
              continue;
            }

            const accessToken = decrypt(encryptedToken);

            // Minimal: transactionsGet (note: it paginates; this matches your old behavior)
            const plaidResponse = await plaidClient.transactionsGet({
              access_token: accessToken,
              start_date: startDate.toISOString().split("T")[0],
              end_date: endDate.toISOString().split("T")[0],
            });

            const plaidTransactions = plaidResponse.data.transactions || [];
            const accounts = plaidResponse.data.accounts || [];

            // map Plaid account_id -> account name for UI
            const accountNameMap: Record<string, string> = {};
            for (const acct of accounts) {
              accountNameMap[acct.account_id] =
                acct.name || acct.official_name || "Account";
            }

            // ✅ Save each transaction with plaidTxId + accountId so filters work
            for (const txn of plaidTransactions) {
              const rawAmount = Number(txn.amount) || 0;

// ✅ Plaid sign is the best signal
const type: "income" | "expense" =
  rawAmount < 0 ? "income" : "expense";

const amount = Math.abs(rawAmount);

const category =
  txn.personal_finance_category?.detailed ||
  txn.personal_finance_category?.primary ||
  txn.category?.[0] ||
  "Uncategorized";

const description =
  txn.merchant_name || txn.name || "Transaction";

await Transaction.updateOne(
  { userId, plaidTxId: txn.transaction_id },
  {
    $set: {
      userId,
      source: "plaid",
      plaidTxId: txn.transaction_id,
      accountId: txn.account_id,
      accountName: accountNameMap[txn.account_id] || undefined,
      type,
      category,
      amount,
      date: new Date(txn.date),
      description,
    },
  },
  { upsert: true }
);
            }

            await PlaidItem.updateOne(
              { _id: (item as any)._id },
              {
                $set: {
                  status: "active",
                  lastGoodSyncAt: new Date(),
                  lastError: null,
                },
              }
            );

            console.log(
              `✅ Synced ${plaidTransactions.length} Plaid txns for ${user.email} (itemId=${(item as any).itemId})`
            );
          } catch (e: any) {
            console.error(
              `❌ Plaid sync failed for itemId=${(item as any).itemId}:`,
              e?.message || e
            );

            await PlaidItem.updateOne(
              { _id: (item as any)._id },
              {
                $set: {
                  status: "error",
                  lastError: e?.message || String(e),
                },
              }
            );
          }
        }
      } catch (e: any) {
        console.error("❌ Plaid sync on login failed:", e?.message || e);
      }
    })();

    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err: any) {
    console.error("❌ Login failed:", err?.message || err);
    return res.status(500).json({ error: "Login failed", details: err?.message || err });
  }
});

export default router;
