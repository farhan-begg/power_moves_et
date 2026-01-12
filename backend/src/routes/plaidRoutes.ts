// backend/src/routes/plaidRoutes.ts
import { Router, type Response } from "express";
import mongoose from "mongoose";
import plaidClient from "../services/plaidService";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { encrypt, decrypt } from "../utils/cryptoUtils";
import { Products, CountryCode } from "plaid";

import PlaidItem from "../models/PlaidItem";
import PlaidAccountsSnapshot from "../models/PlaidAccountsSnapshot";
import PlaidBalanceSnapshot from "../models/PlaidBalanceSnapshot";
import { getCachedOrFetchBalances } from "../services/plaidBalances";

import Transaction from "../models/Transaction"; // ADD THIS IMPORT at top

const router = Router();

const ACCOUNTS_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const TRANSACTIONS_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
const ALL_ITEM_SENTINELS = new Set(["__all__", "all"]);

// ---------- helpers ----------
async function getItemOr400(req: AuthRequest, res: Response) {
  const userId = new mongoose.Types.ObjectId(String(req.user));

  const itemIdParam =
    req.query.itemId
      ? String(req.query.itemId)
      : req.body?.itemId
      ? String(req.body.itemId)
      : null;

  const item = itemIdParam
    ? await PlaidItem.findOne({ userId, itemId: itemIdParam })
    : (await PlaidItem.findOne({ userId, isPrimary: true })) ||
      (await PlaidItem.findOne({ userId }).sort({ createdAt: -1 }));

  if (!item) {
    res.status(400).json({ error: "No Plaid bank linked yet" });
    return null;
  }

  const accessToken = decrypt(item.accessToken);
  return { item, accessToken, userId };
}

async function getItemByIdOr400(req: AuthRequest, res: Response, itemId: string) {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const item = await PlaidItem.findOne({ userId, itemId });

  if (!item) {
    res.status(400).json({ error: "Bank item not found" });
    return null;
  }

  const accessToken = decrypt(item.accessToken);
  return { item, accessToken, userId };
}

// ----------------------------------------------------------
// 0) List connected banks (items)
// GET /api/plaid/items
// ----------------------------------------------------------
router.get("/items", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const items = await PlaidItem.find({ userId }).sort({ createdAt: -1 });

  return res.json({
    items: items.map((i) => ({
      itemId: i.itemId,
      institutionId: i.institutionId,
      institutionName: i.institutionName,
      isPrimary: i.isPrimary,
      status: i.status,
      createdAt: i.createdAt,
    })),
  });
});

// ----------------------------------------------------------
// 1) Create link token
// POST /api/plaid/link-token
// body: { mode?: "new" | "update", itemId?: string }
// ----------------------------------------------------------
router.post("/link-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { mode = "new", itemId } = req.body as {
      mode?: "new" | "update";
      itemId?: string;
    };

    let access_token: string | undefined;

    // update mode must re-auth EXACT item
    if (mode === "update") {
      if (!itemId) return res.status(400).json({ error: "itemId required for update mode" });

      const ctx = await getItemByIdOr400(req, res, String(itemId));
      if (!ctx) return;

      access_token = ctx.accessToken;
    }

    // Build products array - only include Investments if explicitly enabled
    const products = [Products.Transactions];
    if (process.env.PLAID_ENABLE_INVESTMENTS === "true") {
      products.push(Products.Investments);
    }

    const linkTokenConfig: any = {
      user: { client_user_id: String(req.user) },
      client_name: "Expense Tracker",
      products,
      country_codes: [CountryCode.Us],
      language: "en",
      ...(access_token ? { access_token } : {}),
    };

    // Add webhook if configured
    if (process.env.PLAID_WEBHOOK_URL) {
      linkTokenConfig.webhook = process.env.PLAID_WEBHOOK_URL;
    }

    const { data } = await plaidClient.linkTokenCreate(linkTokenConfig);

    return res.json({ link_token: data.link_token });
  } catch (err: any) {
    const plaidError = err.response?.data;
    console.error("❌ /link-token error:", plaidError || err.message || err);
    
    // Provide more helpful error messages for common issues
    let errorMessage = "Failed to create link token";
    if (plaidError?.error_code === "INVALID_PRODUCT") {
      errorMessage = "Invalid product configuration. Some banks may not support all products.";
    } else if (plaidError?.error_code === "INVALID_INSTITUTION") {
      errorMessage = "This institution may not be available in your current Plaid environment.";
    } else if (plaidError?.error_message) {
      errorMessage = plaidError.error_message;
    }
    
    return res.status(500).json({
      error: errorMessage,
      error_code: plaidError?.error_code,
      details: plaidError,
    });
  }
});

// ----------------------------------------------------------
// 2) Exchange public token → store in PlaidItem (multi-bank)
// POST /api/plaid/exchange-public-token
// ----------------------------------------------------------
router.post("/exchange-public-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token, institution, makePrimary } = req.body as {
      public_token?: string;
      institution?: { id?: string; name?: string };
      makePrimary?: boolean;
    };

    if (!public_token) return res.status(400).json({ error: "public_token is required" });

    const userId = new mongoose.Types.ObjectId(String(req.user));
    const { data } = await plaidClient.itemPublicTokenExchange({ public_token });

    const hasAny = await PlaidItem.exists({ userId });
    const shouldBePrimary = makePrimary ?? !hasAny;

    if (shouldBePrimary) {
      await PlaidItem.updateMany({ userId }, { $set: { isPrimary: false } });
    }

    const upsert = await PlaidItem.findOneAndUpdate(
      { userId, itemId: data.item_id },
      {
        userId,
        itemId: data.item_id,
        accessToken: encrypt(data.access_token),
        institutionId: institution?.id ?? null,
        institutionName: institution?.name ?? null,
        status: "active",
        isPrimary: shouldBePrimary,
      },
      { upsert: true, new: true }
    );

    return res.json({
      message: "Bank linked",
      itemId: upsert.itemId,
      institutionName: upsert.institutionName,
      isPrimary: upsert.isPrimary,
    });
  } catch (err: any) {
    console.error("❌ /exchange-public-token error:", err.response?.data || err.message || err);
    return res.status(500).json({
      error: "Failed to exchange token",
      details: err.response?.data,
    });
  }
});

// ----------------------------------------------------------
// 3) Accounts (by itemId or primary fallback)
// GET /api/plaid/accounts?itemId=...
// ----------------------------------------------------------
router.get("/accounts", protect, async (req: AuthRequest, res: Response) => {
  try {
    const ctx = await getItemOr400(req, res);
    if (!ctx) return;

    const { item, accessToken, userId } = ctx;
    const itemId = item.itemId;

    const force = String(req.query.force || "false") === "true";

    const cached = await PlaidAccountsSnapshot.findOne({ userId, itemId });
    const isFresh =
      cached && Date.now() - new Date(cached.fetchedAt).getTime() < ACCOUNTS_COOLDOWN_MS;

    if (cached && isFresh && !force) {
      return res.json({
        accounts: cached.accounts,
        source: "cache",
        fetchedAt: cached.fetchedAt,
        itemId,
        institutionName: cached.institutionName ?? item.institutionName ?? null,
      });
    }

    const { data } = await plaidClient.accountsGet({ access_token: accessToken });

    const accounts = (data.accounts || []).map((a: any) => ({
      accountId: a.account_id,
      name: a.name,
      officialName: a.official_name || null,
      mask: a.mask || null,
      type: a.type ?? null,
      subtype: a.subtype ?? null,
    }));

    const upsert = await PlaidAccountsSnapshot.findOneAndUpdate(
      { userId, itemId },
      {
        userId,
        itemId,
        institutionId: item.institutionId ?? null,
        institutionName: item.institutionName ?? null,
        accounts,
        fetchedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return res.json({
      accounts: upsert.accounts,
      source: "plaid",
      fetchedAt: upsert.fetchedAt,
      itemId,
      institutionName: upsert.institutionName ?? null,
    });
  } catch (err: any) {
    const plaidErr = err?.response?.data;
    console.error("❌ /accounts error:", plaidErr || err.message || err);
    return res.status(500).json({ error: "Failed to fetch accounts", details: plaidErr });
  }
});

// ----------------------------------------------------------
// Set primary bank
// POST /api/plaid/items/:itemId/make-primary
// ----------------------------------------------------------
router.post("/items/:itemId/make-primary", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const itemId = String(req.params.itemId);

    await PlaidItem.updateMany({ userId }, { $set: { isPrimary: false } });

    const updated = await PlaidItem.findOneAndUpdate(
      { userId, itemId },
      { $set: { isPrimary: true } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Bank item not found" });

    return res.json({
      message: "Primary bank updated",
      itemId: updated.itemId,
      institutionName: updated.institutionName,
    });
  } catch (err: any) {
    console.error("❌ make-primary error:", err.message || err);
    return res.status(500).json({ error: "Failed to set primary bank" });
  }
});

// ----------------------------------------------------------
// Net Worth
// GET /api/plaid/net-worth?itemId=...&accountId=...
// itemId = "__all__" aggregates across banks
// ----------------------------------------------------------
router.get("/net-worth", protect, async (req: AuthRequest, res: Response) => {
  try {
    const force = String(req.query.force || "false") === "true";
    const itemIdParam = req.query.itemId ? String(req.query.itemId) : null;
    const accountId = req.query.accountId ? String(req.query.accountId) : undefined;

    // ✅ ALL BANKS
    if (itemIdParam && ALL_ITEM_SENTINELS.has(itemIdParam)) {
      if (accountId) {
        return res.status(400).json({
          error:
            "accountId is not supported when itemId=__all__. Choose a bank first for account-level filtering.",
        });
      }

      const userObjectId = new mongoose.Types.ObjectId(String(req.user));
      const items = await PlaidItem.find({ userId: userObjectId })
        .select("itemId accessToken institutionId institutionName")
        .sort({ createdAt: -1 });

      if (!items.length) {
        return res.status(400).json({ error: "No Plaid banks linked yet" });
      }

      let totalAssets = 0;
      let totalLiabilities = 0;
      let latestFetchedAt: Date | null = null;

      for (const it of items) {
        try {
          const accessToken = decrypt(it.accessToken);

          const { snapshot } = await getCachedOrFetchBalances({
            plaidClient,
            userId: String(req.user),
            accessToken,
            itemId: it.itemId,
            institutionId: it.institutionId ?? null,
            institutionName: it.institutionName ?? null,
            force,
          });

          totalAssets += Number(snapshot.totalAssets ?? 0);
          totalLiabilities += Number(snapshot.totalLiabilities ?? 0);

          const fetchedAt = snapshot.fetchedAt ? new Date(snapshot.fetchedAt) : null;
          if (fetchedAt && (!latestFetchedAt || fetchedAt > latestFetchedAt)) {
            latestFetchedAt = fetchedAt;
          }
        } catch (e: any) {
          // fallback to cached snapshot if rate-limited
          const plaidErr = e?.response?.data;
          if (plaidErr?.error_code === "BALANCE_LIMIT") {
            const cached = await PlaidBalanceSnapshot.findOne({
              userId: userObjectId,
              itemId: it.itemId,
            }).sort({ fetchedAt: -1 });

            if (cached) {
              totalAssets += Number(cached.totalAssets ?? 0);
              totalLiabilities += Number(cached.totalLiabilities ?? 0);

              const fetchedAt = cached.fetchedAt ? new Date(cached.fetchedAt) : null;
              if (fetchedAt && (!latestFetchedAt || fetchedAt > latestFetchedAt)) {
                latestFetchedAt = fetchedAt;
              }
              continue;
            }
          }

          console.warn(
            "⚠️ Skipping bank in __all__ net-worth:",
            it.itemId,
            plaidErr || e?.message || e
          );
        }
      }

      return res.json({
        itemId: "__all__",
        source: "multi",
        fetchedAt: latestFetchedAt,
        currencyHint: "USD",
        summary: {
          assets: totalAssets,
          debts: totalLiabilities,
          netWorth: totalAssets - totalLiabilities,
        },
      });
    }

    // ✅ SINGLE BANK honoring itemId if provided
    let ctx:
      | { item: any; accessToken: string; userId: mongoose.Types.ObjectId }
      | null = null;

    if (itemIdParam && !ALL_ITEM_SENTINELS.has(itemIdParam)) {
      ctx = await getItemByIdOr400(req, res, itemIdParam);
    } else {
      ctx = await getItemOr400(req, res);
    }
    if (!ctx) return;

    const { item, accessToken } = ctx;

    const { snapshot, source } = await getCachedOrFetchBalances({
      plaidClient,
      userId: String(req.user),
      accessToken,
      itemId: item.itemId,
      institutionId: item.institutionId ?? null,
      institutionName: item.institutionName ?? null,
      force,
    });

    if (accountId) {
      const acct = snapshot.accounts.find((a: any) => a.account_id === accountId);
      if (!acct) return res.status(404).json({ error: "Account not found in snapshot" });

      const type = acct.type;
      const current = Number(acct?.balances?.current ?? 0);

      const assets = type === "credit" || type === "loan" ? 0 : current;
      const debts = type === "credit" || type === "loan" ? current : 0;

      return res.json({
        itemId: item.itemId,
        institutionName: item.institutionName ?? null,
        source,
        fetchedAt: snapshot.fetchedAt,
        currencyHint: acct?.balances?.iso_currency_code || "USD",
        summary: { assets, debts, netWorth: assets - debts },
      });
    }

    return res.json({
      itemId: item.itemId,
      institutionName: item.institutionName ?? null,
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

    if (plaidErr?.error_code === "BALANCE_LIMIT") {
      try {
        const userId = new mongoose.Types.ObjectId(String(req.user));
        const itemIdParam = req.query.itemId ? String(req.query.itemId) : "";

        // only works for single-bank calls
        if (itemIdParam && !ALL_ITEM_SENTINELS.has(itemIdParam)) {
          const cached = await PlaidBalanceSnapshot.findOne({ userId, itemId: itemIdParam }).sort({
            fetchedAt: -1,
          });

          if (cached) {
            return res.status(200).json({
              itemId: itemIdParam,
              source: "cache-stale",
              fetchedAt: cached.fetchedAt,
              currencyHint: "USD",
              summary: {
                assets: cached.totalAssets,
                debts: cached.totalLiabilities,
                netWorth: cached.netWorth,
              },
              warning: "Plaid rate limit hit; served cached net worth.",
            });
          }
        }
      } catch (_) {}

      return res.status(429).json({ error: "Plaid balance rate limit hit", details: plaidErr });
    }

    console.error("❌ /net-worth error:", plaidErr || err.message || err);
    return res.status(500).json({ error: "Failed to compute net worth", details: plaidErr });
  }
});

// Utility: returns user's current sync status across items
async function getUserSyncStatus(userId: mongoose.Types.ObjectId) {
  const items = await PlaidItem.find({ userId }).select(
    "lastGoodSyncAt lastSyncAttemptAt isSyncing status"
  );

  let isSyncing = false;
  let latestGood: Date | null = null;
  let latestAttempt: Date | null = null;

  for (const it of items) {
    if (it.isSyncing) isSyncing = true;
    if (it.lastGoodSyncAt && (!latestGood || it.lastGoodSyncAt > latestGood)) {
      latestGood = it.lastGoodSyncAt;
    }
    if (it.lastSyncAttemptAt && (!latestAttempt || it.lastSyncAttemptAt > latestAttempt)) {
      latestAttempt = it.lastSyncAttemptAt;
    }
  }

  const now = Date.now();
  const lastGoodMs = latestGood ? latestGood.getTime() : 0;
  const cooldownRemainingMs = lastGoodMs
    ? Math.max(0, TRANSACTIONS_COOLDOWN_MS - (now - lastGoodMs))
    : 0;

  const hasAnyTransactions =
    (await Transaction.exists({ userId })) != null;

  return {
    isSyncing,
    lastGoodSyncAt: latestGood,
    lastAttemptAt: latestAttempt,
    cooldownRemainingMs,
    hasAnyTransactions,
  };
}

// GET /api/plaid/sync-status
router.get("/sync-status", protect, async (req: AuthRequest, res: Response) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const status = await getUserSyncStatus(userId);
  return res.json(status);
});

// POST /api/plaid/sync-transactions?days=90&itemId=optional
router.post("/sync-transactions", protect, async (req: AuthRequest, res: Response) => {
  try {
    const days = Math.max(1, Math.min(730, Number(req.query.days || 90)));
    const userId = new mongoose.Types.ObjectId(String(req.user));

    const itemIdParam = req.query.itemId ? String(req.query.itemId) : null;

    // choose exact item if itemId passed, else primary, else newest
    let item =
      (itemIdParam &&
        (await PlaidItem.findOne({ userId, itemId: itemIdParam, status: "active" }))) ||
      (await PlaidItem.findOne({ userId, isPrimary: true, status: "active" })) ||
      (await PlaidItem.findOne({ userId, status: "active" }).sort({ createdAt: -1 }));

    if (!item) return res.status(400).json({ error: "No active Plaid item" });

    // Acquire a simple per-item "lock" to avoid concurrent syncs for the same item
    const lock = await PlaidItem.updateOne(
      { _id: item._id, $or: [{ isSyncing: { $exists: false } }, { isSyncing: false }] },
      { $set: { isSyncing: true, lastSyncAttemptAt: new Date() } }
    );
    if (!lock.modifiedCount) {
      return res.status(202).json({ ok: true, alreadyRunning: true });
    }

    const accessToken = decrypt(item.accessToken);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date();

    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];

    // transactionsGet is paginated; pull all pages
    let offset = 0;
    const count = 100;
    let total = 0;

    const accountNameMap: Record<string, string> = {};
    let upsertAttempts = 0;

    while (true) {
      const resp = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: start,
        end_date: end,
        options: { count, offset },
      });

      const txns = resp.data.transactions || [];
      const accts = resp.data.accounts || [];
      total = resp.data.total_transactions || 0;

      for (const a of accts) {
        accountNameMap[a.account_id] = a.name || a.official_name || "Account";
      }

      for (const txn of txns) {
        const rawAmount = Number(txn.amount) || 0;

        // ✅ safer income logic than sign-only
        const isIncomeCategory =
          txn.personal_finance_category?.primary &&
          String(txn.personal_finance_category.primary).toUpperCase().startsWith("INCOME");

        const type: "income" | "expense" =
          rawAmount < 0 || isIncomeCategory ? "income" : "expense";

        const amount = Math.abs(rawAmount);

        const category =
          txn.personal_finance_category?.detailed ||
          txn.personal_finance_category?.primary ||
          txn.category?.[0] ||
          "Uncategorized";

        const description = txn.merchant_name || txn.name || "Transaction";

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

        upsertAttempts++;
      }

      offset += txns.length;
      if (offset >= total || txns.length === 0) break;
    }

    await PlaidItem.updateOne({ _id: item._id }, {
      $set: {
        lastGoodSyncAt: new Date(),
        lastError: null,
        status: "active",
        isSyncing: false,
      },
    });

    return res.json({
      ok: true,
      itemId: item.itemId,
      institutionName: item.institutionName,
      days,
      total_transactions_reported_by_plaid: total,
      upsertAttempts,
    });
  } catch (err: any) {
    const plaidErr = err?.response?.data;
    console.error("❌ /sync-transactions error:", plaidErr || err?.message || err);

    // Best effort: clear syncing flag on any one item if we can infer it
    try {
      const userId = new mongoose.Types.ObjectId(String((req as any).user));
      await PlaidItem.updateMany({ userId }, { $set: { isSyncing: false } });
    } catch {}

    return res.status(500).json({
      error: "Sync failed",
      details: plaidErr || err?.message || String(err),
    });
  }
});

// POST /api/plaid/sync-if-needed
// body: { force?: boolean, days?: number }
router.post("/sync-if-needed", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const force = Boolean(req.body?.force);
    const days = Math.max(1, Math.min(730, Number(req.body?.days || 90)));

    const status = await getUserSyncStatus(userId);

    // Choose item: primary or newest active
    const item =
      (await PlaidItem.findOne({ userId, isPrimary: true, status: "active" })) ||
      (await PlaidItem.findOne({ userId, status: "active" }).sort({ createdAt: -1 }));

    if (!item) {
      return res.status(400).json({ error: "No active Plaid item" });
    }

    // Decide if we should trigger
    const shouldTrigger =
      force || !status.hasAnyTransactions || status.cooldownRemainingMs === 0;

    if (!shouldTrigger) {
      return res.json({
        triggered: false,
        reason: "cooldown",
        status,
      });
    }

    // Try to acquire lock
    const lock = await PlaidItem.updateOne(
      { _id: item._id, $or: [{ isSyncing: { $exists: false } }, { isSyncing: false }] },
      { $set: { isSyncing: true, lastSyncAttemptAt: new Date() } }
    );

    if (!lock.modifiedCount) {
      // someone else is syncing already
      const fresh = await getUserSyncStatus(userId);
      return res.status(202).json({
        triggered: false,
        alreadyRunning: true,
        status: fresh,
      });
    }

    // Fire-and-forget background job
    (async () => {
      try {
        const accessToken = decrypt(item.accessToken);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const endDate = new Date();

        const start = startDate.toISOString().split("T")[0];
        const end = endDate.toISOString().split("T")[0];

        let offset = 0;
        const count = 100;

        const accountNameMap: Record<string, string> = {};

        while (true) {
          const resp = await plaidClient.transactionsGet({
            access_token: accessToken,
            start_date: start,
            end_date: end,
            options: { count, offset },
          });

          const txns = resp.data.transactions || [];
          const accts = resp.data.accounts || [];

          for (const a of accts) {
            accountNameMap[a.account_id] = a.name || a.official_name || "Account";
          }

          for (const txn of txns) {
            const rawAmount = Number(txn.amount) || 0;

            const isIncomeCategory =
              txn.personal_finance_category?.primary &&
              String(txn.personal_finance_category.primary).toUpperCase().startsWith("INCOME");

            const type: "income" | "expense" =
              rawAmount < 0 || isIncomeCategory ? "income" : "expense";

            const amount = Math.abs(rawAmount);

            const category =
              txn.personal_finance_category?.detailed ||
              txn.personal_finance_category?.primary ||
              txn.category?.[0] ||
              "Uncategorized";

            const description = txn.merchant_name || txn.name || "Transaction";

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

          offset += txns.length;
          if (offset >= (resp.data.total_transactions || 0) || txns.length === 0) break;
        }

        await PlaidItem.updateOne(
          { _id: item._id },
          {
            $set: {
              lastGoodSyncAt: new Date(),
              lastError: null,
              status: "active",
              isSyncing: false,
            },
          }
        );
      } catch (e: any) {
        console.error("❌ background sync failed:", e?.response?.data || e?.message || e);
        try {
          await PlaidItem.updateOne(
            { _id: item._id },
            { $set: { isSyncing: false, lastError: e?.message || String(e) } }
          );
        } catch {}
      }
    })();

    const fresh = await getUserSyncStatus(userId);
    return res.status(202).json({
      triggered: true,
      status: fresh,
    });
  } catch (err: any) {
    console.error("❌ /sync-if-needed error:", err?.message || err);
    return res.status(500).json({ error: "Failed to start sync-if-needed" });
  }
});


router.get("/health", (_req, res) => res.json({ ok: true, where: "plaidRoutes" }));

export default router;
