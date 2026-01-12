// backend/src/routes/auth.ts
import { Router, type Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import Transaction from "../models/Transaction";
import PlaidItem from "../models/PlaidItem";
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
    
    // ✅ Password is required for local registration
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: "Email already registered" });

    const user = new User({ 
      name, 
      email, 
      password, 
      provider: "local" // ✅ Mark as local user
    });
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
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    
    // ✅ Check if user has a password (OAuth users don't)
    if (!user.password) {
      return res.status(400).json({ 
        error: "This account uses social login. Please sign in with Google or Apple." 
      });
    }
    
    if (!(await user.comparePassword(password))) {
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

        // ✅ Default to 730 days (2 years) for full historical data on first login sync
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 730);
        const endDate = new Date();

        for (const item of items) {
          try {
            const encryptedToken = (item as any).accessToken;
            if (!encryptedToken) {
              console.log(`⚠️ PlaidItem missing accessToken. itemId=${(item as any).itemId}`);
              continue;
            }

            const accessToken = decrypt(encryptedToken);

            // ✅ COST OPTIMIZATION: Use incremental sync on login only if recently synced
            const itemDoc = await PlaidItem.findOne({ userId, itemId: (item as any).itemId });
            let loginStartDate = startDate;
            if (itemDoc?.lastGoodSyncAt) {
              const daysSinceLastSync = Math.floor(
                (Date.now() - itemDoc.lastGoodSyncAt.getTime()) / (1000 * 60 * 60 * 24)
              );
              // Only use incremental sync if synced within last 7 days
              // Otherwise fetch full historical range to ensure complete data
              if (daysSinceLastSync < 7) {
                loginStartDate = new Date(itemDoc.lastGoodSyncAt);
                loginStartDate.setDate(loginStartDate.getDate() - 1); // 1 day overlap
              }
              // If daysSinceLastSync >= 7, use full 730 day range (loginStartDate already set)
            }

            // ✅ COST OPTIMIZATION: Properly paginate transactions
            let offset = 0;
            const count = 100;
            const accountNameMap: Record<string, string> = {};
            const bulkOps: any[] = [];
            const BATCH_SIZE = 500;
            let totalProcessed = 0;

            while (true) {
              const plaidResponse = await plaidClient.transactionsGet({
                access_token: accessToken,
                start_date: loginStartDate.toISOString().split("T")[0],
                end_date: endDate.toISOString().split("T")[0],
                options: { count, offset },
              });

              const plaidTransactions = plaidResponse.data.transactions || [];
              const accounts = plaidResponse.data.accounts || [];
              const total = plaidResponse.data.total_transactions || 0;

              // Build account name map once per page
              for (const acct of accounts) {
                if (!accountNameMap[acct.account_id]) {
                  accountNameMap[acct.account_id] =
                    acct.name || acct.official_name || "Account";
                }
              }

              // ✅ COST OPTIMIZATION: Batch operations instead of individual updates
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

                bulkOps.push({
                  updateOne: {
                    filter: { userId, plaidTxId: txn.transaction_id },
                    update: {
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
                    upsert: true,
                  },
                });

                totalProcessed++;
              }

              // Execute bulk write when batch is full
              if (bulkOps.length >= BATCH_SIZE) {
                await Transaction.bulkWrite(bulkOps, { ordered: false });
                bulkOps.length = 0;
              }

              offset += plaidTransactions.length;
              if (offset >= total || plaidTransactions.length === 0) break;
            }

            // Execute remaining bulk operations
            if (bulkOps.length > 0) {
              await Transaction.bulkWrite(bulkOps, { ordered: false });
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
              `✅ Synced ${totalProcessed} Plaid txns for ${user.email} (itemId=${(item as any).itemId})`
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
