import { Router } from "express";
import User from "../models/User";
import jwt from "jsonwebtoken";
import plaidClient from "../services/plaidService";
import { decrypt } from "../utils/cryptoUtils";
import Transaction from "../models/Transaction";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

console.log("🔐 Using JWT_SECRET:", JWT_SECRET);
// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: "User already exists" });

    const user = new User({ name, email, password });
    await user.save();

    // ✅ Generate JWT after registration
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });

    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});


// Login with auto Plaid sync
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });

    // 🔄 Background Plaid Sync
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

            // ✅ Use Plaid’s category classification
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
