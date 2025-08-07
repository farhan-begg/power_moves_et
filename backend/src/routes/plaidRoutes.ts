import { Router, Response } from "express";
import mongoose from "mongoose";
import plaidClient from "../services/plaidService";
import User from "../models/User";
import Transaction from "../models/Transaction";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { encrypt, decrypt } from "../utils/cryptoUtils";
import { Products, CountryCode } from "plaid";

const router = Router();

// ---------------------------
// NEW: Link Token Route
// ---------------------------
router.get("/link-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.user! },
      client_name: "Expense Tracker",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("❌ Plaid link-token error:", err);
    res.status(500).json({ error: "Failed to create link token" });
  }
});

// ---------------------------
// NEW: Exchange Public Token
// ---------------------------
router.post("/exchange-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token } = req.body;
    if (!public_token) {
      return res.status(400).json({ error: "public_token is required" });
    }

    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = response.data.access_token;
    const encryptedToken = encrypt(accessToken);

    await User.findByIdAndUpdate(req.user, { plaidAccessToken: encryptedToken });

    res.json({ message: "Plaid account linked successfully" });
  } catch (err: any) {
    console.error("❌ Exchange token error:", err.message || err);
    res.status(500).json({ error: "Failed to exchange token" });
  }
  
});

// ---------------------------
// Existing: Create Link Token
// ---------------------------
router.post("/create_link_token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: req.user! },
      client_name: "Expense Tracker",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    res.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("❌ Plaid create_link_token error:", err);
    res.status(500).json({ error: "Plaid link token creation failed" });
  }
});

// ---------------------------
// Existing: Exchange Public Token
// ---------------------------
router.post("/exchange_public_token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token } = req.body;
    if (!public_token) {
      return res.status(400).json({ error: "public_token is required" });
    }


    console.log("🔁 Received public_token:", public_token);



    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const encryptedToken = encrypt(response.data.access_token);

    await User.findByIdAndUpdate(req.user, { plaidAccessToken: encryptedToken });

    res.json({ message: "Plaid account linked successfully" });
  } catch (err: any) {
    console.error("❌ Plaid exchange_public_token error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to exchange token", details: err.message });
  }
});

// ---------------------------
// Existing: Fetch and Sync Transactions
// ---------------------------
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
    const userId = new mongoose.Types.ObjectId(req.user);

    const formattedTransactions = plaidTransactions.map((txn) => ({
      userId,
      type: txn.amount >= 0 ? "expense" : "income",
      category: txn.category?.[0] || "Uncategorized",
      amount: Math.abs(txn.amount),
      date: new Date(txn.date),
      description: txn.name,
      source: "plaid",
    }));

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

    const allTransactions = await Transaction.find({ userId }).sort({ date: -1 });
    res.json(allTransactions);
  } catch (err: any) {
    console.error("❌ Plaid sync error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch Plaid transactions", details: err.message });
  }
});


router.get("/accounts", protect, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user);
  if (!user?.plaidAccessToken) return res.status(400).json({ error: "No access token" });

  const accessToken = decrypt(user.plaidAccessToken);

  const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });

  res.json(accountsResponse.data.accounts);
});


export default router;
