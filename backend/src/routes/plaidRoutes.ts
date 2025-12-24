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
import PlaidBalanceSnapshot from "../models/PlaidBalanceSnapshot";
import { getCachedOrFetchBalances } from "../services/plaidBalances";
import PlaidAccountsSnapshot from "../models/PlaidAccountsSnapshot";

const router = Router();


console.log("🔥 USING THIS plaidRoutes.ts FILE:", __filename);

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
    const { mode = "new" } = req.body as { mode?: "new" | "update" };

    let access_token: string | undefined;

    if (mode === "update") {
      const existing = await getDecryptedAccessToken(req, res);
      if (!existing) return;
      access_token = existing; // ✅ update mode
    }

    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.user) },
      client_name: "Expense Tracker",

      // keep it simple while debugging
      products: [Products.Transactions, Products.Investments], // add Liabilities only if approved
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: process.env.PLAID_WEBHOOK_URL,

      ...(access_token ? { access_token } : {}), // ✅ only included in update mode
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
await User.findByIdAndUpdate(String(req.user), {
  plaidAccessToken: encrypt(data.access_token),
  plaidItemId: data.item_id,
});

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

const ACCOUNTS_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

router.get("/accounts", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(String(req.user));
    if (!user?.plaidAccessToken) {
      return res.status(400).json({ error: "No Plaid account linked" });
    }
    if (!user.plaidItemId) {
      return res.status(400).json({ error: "Missing Plaid item id (plaidItemId). Re-link Plaid." });
    }

    const userObjectId = new mongoose.Types.ObjectId(String(req.user));
    const itemId = user.plaidItemId;

    const force = String(req.query.force || "false") === "true";

    // 1) Try cache
    const cached = await PlaidAccountsSnapshot.findOne({ userId: userObjectId, itemId });

    const isFresh =
      cached && Date.now() - new Date(cached.fetchedAt).getTime() < ACCOUNTS_COOLDOWN_MS;

    if (cached && isFresh && !force) {
      return res.json({ accounts: cached.accounts, source: "cache", fetchedAt: cached.fetchedAt });
    }

    // 2) Fetch from Plaid (ONLY when cache is stale or forced)
    const accessToken = decrypt(user.plaidAccessToken);
    const { data } = await plaidClient.accountsGet({ access_token: accessToken });

    const accounts = (data.accounts || []).map((a: any) => ({
      accountId: a.account_id,
      name: a.name,
      officialName: a.official_name || null,
      mask: a.mask || null,
      type: a.type,
      subtype: a.subtype,
      balances: null, // don't expose balances to client
    }));

    const upsert = await PlaidAccountsSnapshot.findOneAndUpdate(
      { userId: userObjectId, itemId },
      { userId: userObjectId, itemId, accounts, fetchedAt: new Date() },
      { upsert: true, new: true }
    );

    return res.json({ accounts: upsert.accounts, source: "plaid", fetchedAt: upsert.fetchedAt });
  } catch (err: any) {
    const plaidErr = err?.response?.data;

    // If Plaid rate limits, serve cached data (even stale) if we have it
    if (plaidErr?.error_code === "BALANCE_LIMIT") {
      try {
        const user = await User.findById(String(req.user));
        const cached = await PlaidAccountsSnapshot.findOne({
          userId: new mongoose.Types.ObjectId(String(req.user)),
          itemId: user?.plaidItemId,
        });

        if (cached) {
          return res.status(200).json({
            accounts: cached.accounts,
            source: "cache-stale",
            fetchedAt: cached.fetchedAt,
            warning: "Plaid rate limit hit; served last cached accounts snapshot.",
          });
        }
      } catch (_) {}

      return res.status(429).json({ error: "Plaid balance rate limit hit", details: plaidErr });
    }

    console.error("❌ /accounts error:", plaidErr || err.message || err);
    return res.status(500).json({ error: "Failed to fetch accounts", details: plaidErr });
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


/* ----------------------------------------------------------
   3.5) Net Worth (cached balances snapshot)
---------------------------------------------------------- */
router.get("/net-worth", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(String(req.user));
    if (!user?.plaidAccessToken) {
      return res.status(400).json({ error: "No Plaid account linked" });
    }

    // need item id for snapshot key
    if (!user.plaidItemId) {
      return res.status(400).json({ error: "Missing Plaid item id (plaidItemId). Re-link Plaid." });
    }

    const accessToken = decrypt(user.plaidAccessToken);

    // optional: force refresh (use only for dev/admin)
    const force = String(req.query.force || "false") === "true";

    const { snapshot, source } = await getCachedOrFetchBalances({
      plaidClient,
      userId: String(req.user),
      accessToken,
      itemId: user.plaidItemId,
      force,
    });

    // optional account filter support (your frontend passes accountId sometimes)
    const accountId = req.query.accountId ? String(req.query.accountId) : undefined;

    if (accountId) {
      const acct = snapshot.accounts.find((a: any) => a.account_id === accountId);
      if (!acct) {
        return res.status(404).json({ error: "Account not found in snapshot" });
      }

      // For a single account “net worth”: treat credit/loan as liabilities, others as assets
      const type = acct.type;
      const current = Number(acct?.balances?.current ?? 0);

      const assets = type === "credit" || type === "loan" ? 0 : current;
      const debts = type === "credit" || type === "loan" ? current : 0;

      return res.json({
        source,
        fetchedAt: snapshot.fetchedAt,
        currencyHint: acct?.balances?.iso_currency_code || "USD",
        summary: {
          assets,
          debts,
          netWorth: assets - debts,
        },
      });
    }

    // default: all accounts
    return res.json({
      source,
      fetchedAt: snapshot.fetchedAt,
      currencyHint: "USD",
      summary: {
        assets: snapshot.totalAssets,
        debts: snapshot.totalLiabilities,
        netWorth: snapshot.netWorth,
      },
    });
  } catch (err: any) {
    const plaidErr = err?.response?.data;

    // If Plaid rate limits, try to serve last cached snapshot
    if (plaidErr?.error_code === "BALANCE_LIMIT") {
      try {
        const user = await User.findById(String(req.user));
        const cached = await PlaidBalanceSnapshot.findOne({
          userId: new mongoose.Types.ObjectId(String(req.user)),
          itemId: user?.plaidItemId,
        }).sort({ fetchedAt: -1 });

        if (cached) {
          return res.status(200).json({
            source: "cache-stale",
            fetchedAt: cached.fetchedAt,
            currencyHint: "USD",
            summary: {
              assets: cached.totalAssets,
              debts: cached.totalLiabilities,
              netWorth: cached.netWorth,
            },
            warning: "Plaid rate limit hit; served last cached snapshot.",
          });
        }
      } catch (_) {}
      return res.status(429).json({ error: "Plaid balance rate limit hit", details: plaidErr });
    }

    console.error("❌ /net-worth error:", plaidErr || err.message || err);
    return res.status(500).json({ error: "Failed to compute net worth", details: plaidErr });
  }
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, where: "plaidRoutes" });
});

export default router;