// server/routes/plaidRoutes.ts
import { Router, type Response } from "express";
import mongoose from "mongoose";
import plaidClient from "../services/plaidService";
import User from "../models/User";
import Transaction from "../models/Transaction";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { encrypt, decrypt } from "../utils/cryptoUtils";
import { Products, CountryCode } from "plaid";
import ManualAsset from "../models/ManualAsset";
import { runAccountIdBackfillForUser } from "../services/plaidBackfillService";
import Asset from "../models/Asset";
import { getLiveUsdPrices as getCoinGeckoPricesByIds } from "../services/coinGeckoService";

const router = Router();

/** Helper: get decrypted Plaid access token or send a 400 */
async function getDecryptedAccessToken(req: AuthRequest, res: Response): Promise<string | null> {
  const user = await User.findById(String(req.user));
  if (!user?.plaidAccessToken) {
    res.status(400).json({ error: "No Plaid account linked" });
    return null;
  }
  try {
    return decrypt(user.plaidAccessToken);
  } catch (e: any) {
    console.error("❌ Access token decrypt error:", e?.message || e);
    res.status(400).json({ error: "Unable to decrypt Plaid token" });
    return null;
  }
}

/* ----------------------------------------------------------
   1) Create link token
---------------------------------------------------------- */
router.post("/link-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.user) },
      client_name: "Expense Tracker",
      products: [Products.Transactions, Products.Liabilities, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    webhook: process.env.PLAID_WEBHOOK_URL, // 👈 now comes from your .
    });
    res.json({ link_token: data.link_token });
  } catch (err: any) {
    console.error("❌ /link-token error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to create link token", details: err.response?.data });
  }
});

/* ----------------------------------------------------------
   2) Exchange public token → store access token (encrypted)
---------------------------------------------------------- */
router.post("/exchange-public-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token } = req.body as { public_token?: string };
    if (!public_token) return res.status(400).json({ error: "public_token is required" });
 console.log("🔍 exchange-public-token body:", req.body);  // add this
    const { data } = await plaidClient.itemPublicTokenExchange({ public_token });
    await User.findByIdAndUpdate(String(req.user), { plaidAccessToken: encrypt(data.access_token) });

    res.json({ message: "Plaid account linked successfully" });

    // Run backfill in the background
    setImmediate(async () => {
      try {
        const result = await runAccountIdBackfillForUser(String(req.user), 30);
        console.log("✅ Backfill after link:", result);
      } catch (e) {
        console.warn("⚠️ Backfill after link failed:", (e as any)?.message || e);
      }
    });
  } catch (err: any) {
    console.error("❌ /exchange-public-token error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to exchange token", details: err.response?.data });
  }
});

/* ----------------------------------------------------------
   3) Accounts
---------------------------------------------------------- */
router.get("/accounts", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const { data } = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const accounts = data.accounts.map((a) => ({
      accountId: a.account_id,
      name: a.name,
      officialName: a.official_name || null,
      mask: a.mask || null,
      type: a.type,
      subtype: a.subtype,
      balances: {
        available: a.balances.available ?? null,
        current: a.balances.current ?? null,
        isoCurrencyCode: a.balances.iso_currency_code || null,
      },
    }));

    res.json({ accounts });
  } catch (err: any) {
    console.error("❌ /accounts error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch accounts", details: err.response?.data });
  }
});

/* ----------------------------------------------------------
   4) Transactions (last 30d, sync + upsert into Mongo)
---------------------------------------------------------- */
router.get("/transactions", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const plaidResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
    });

    const userId = new mongoose.Types.ObjectId(String(req.user));
    const formatted = plaidResponse.data.transactions.map((txn: any) => ({
      userId,
      type: txn.amount >= 0 ? "expense" : "income",
      category: txn.personal_finance_category?.detailed || txn.category?.[0] || "Uncategorized",
      amount: Math.abs(txn.amount),
      date: new Date(txn.date),
      description: txn.name,
      source: "plaid" as const,
      accountId: txn.account_id ?? undefined,
      plaidTxId: txn.transaction_id,
    }));

    if (formatted.length) {
      const ops = formatted.map((t) => ({
        updateOne: {
          filter: { userId: t.userId, plaidTxId: t.plaidTxId },
          update: { $setOnInsert: t },
          upsert: true,
        },
      }));
      await Transaction.bulkWrite(ops, { ordered: false });
    }

    const all = await Transaction.find({ userId }).sort({ date: -1 });
    res.json(all);
  } catch (err: any) {
    console.error("❌ /transactions error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to sync transactions", details: err.response?.data });
  }
});

/* ----------------------------------------------------------
   5) Investments (basic example)
---------------------------------------------------------- */
router.get("/investments", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const { data } = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
    res.json(data);
  } catch (err: any) {
    console.error("❌ /investments error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch investments", details: err.response?.data });
  }
});

/* ----------------------------------------------------------
   6) Webhook handler (production requirement)
---------------------------------------------------------- */
/* ----------------------------------------------------------
   6) Webhook handler
---------------------------------------------------------- */
router.post("/webhook", async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id } = req.body;

    console.log("📡 Plaid webhook:", webhook_type, webhook_code, item_id);

    // Example: transactions updates
    if (webhook_type === "TRANSACTIONS" && webhook_code === "DEFAULT_UPDATE") {
      console.log("🔄 New transactions ready for item:", item_id);
      // 👉 Here you can enqueue a background job to call /transactions/sync or /transactions/get
      // and refresh MongoDB.
    }

    // Example: item errors
    if (webhook_type === "ITEM" && webhook_code === "ERROR") {
      console.error("❌ Item error:", req.body.error);
      // 👉 Consider notifying user or marking account as errored
    }

    res.sendStatus(200); // Always ACK or Plaid retries
  } catch (e) {
    console.error("❌ Webhook handler error:", (e as any)?.message || e);
    res.sendStatus(500);
  }
});


router.get("/health", (_req, res) => {
  res.json({ ok: true, where: "plaidRoutes" });
});

export default router;
