import { Router, Response } from "express";
import mongoose from "mongoose";
import plaidClient from "../services/plaidService";
import User from "../models/User";
import Transaction from "../models/Transaction";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { encrypt, decrypt } from "../utils/cryptoUtils";
import { Products, CountryCode } from "plaid";

const router = Router();

// Create Plaid link token
router.post("/create_link_token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.user! },
      client_name: "Expense Tracker",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en"
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("❌ Plaid create_link_token error:", err);
    res.status(500).json({ error: "Plaid link token creation failed" });
  }
});

// Exchange public_token for access_token
router.post("/exchange_public_token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token } = req.body;
    if (!public_token) {
      return res.status(400).json({ error: "public_token is required" });
    }

    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const encryptedToken = encrypt(response.data.access_token);

    await User.findByIdAndUpdate(req.user, { plaidAccessToken: encryptedToken });

    res.json({ message: "Plaid account linked successfully" });
  } catch (err: any) {
    console.error("❌ Plaid exchange_public_token error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to exchange token", details: err.message });
  }
});

// Fetch Plaid transactions, sync with Mongo, and return all
router.get("/transactions", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user);
    if (!user?.plaidAccessToken) {
      return res.status(400).json({ error: "No Plaid account linked" });
    }

    const accessToken = decrypt(user.plaidAccessToken);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const plaidResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
    });

    const plaidTransactions = plaidResponse.data.transactions;

    // Convert req.user to ObjectId for consistency
    const userId = new mongoose.Types.ObjectId(req.user);

    // Map Plaid data into Mongo schema
    const formattedTransactions = plaidTransactions.map((txn) => ({
      userId,
      type: txn.amount >= 0 ? "expense" : "income",
      category: txn.category?.[0] || "Uncategorized",
      amount: Math.abs(txn.amount),
      date: new Date(txn.date),
      description: txn.name,
      source: "plaid"
    }));

    // Upsert (insert if not exists)
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

    // Return combined transactions
    const allTransactions = await Transaction.find({ userId }).sort({ date: -1 });
    res.json(allTransactions);
  } catch (err: any) {
    console.error("❌ Plaid sync error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch Plaid transactions", details: err.message });
  }
});

export default router;
