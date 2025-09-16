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
// server/routes/plaidRoutes.ts (top of file)
import Asset from "../models/Asset";
import { getLiveUsdPrices as getCoinGeckoPricesByIds } from "../services/coinGeckoService";

const router = Router();

console.log("🔗 router file:", __filename);

router.get("/_where", (_req, res) => {
  res.json({ where: __filename });
});


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
   1) Link token
---------------------------------------------------------- */
router.post("/link-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { data } = await plaidClient.linkTokenCreate({
      user: { client_user_id: String(req.user) },
      client_name: "Expense Tracker",
      products: [Products.Transactions, Products.Liabilities, Products.Investments],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    res.json({ link_token: data.link_token });
  } catch (err: any) {
    console.error("❌ /link-token error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to create link token" });
  }
});

/* ----------------------------------------------------------
   2) Exchange public token (save token + background backfill)
---------------------------------------------------------- */
router.post("/exchange-public-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token } = req.body as { public_token?: string };
    if (!public_token) return res.status(400).json({ error: "public_token is required" });

    const { data } = await plaidClient.itemPublicTokenExchange({ public_token });
    await User.findByIdAndUpdate(String(req.user), { plaidAccessToken: encrypt(data.access_token) });

    // respond immediately so the link flow is snappy
    res.json({ message: "Plaid account linked successfully" });

    // run backfill in the background
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
    res.status(500).json({ error: "Failed to exchange token" });
  }
});

/* ----------------------------------------------------------
   3) Accounts (balances, names, types)
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
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

/* ----------------------------------------------------------
   4) Cards (prefer Liabilities; fallback to accounts)
---------------------------------------------------------- */
router.get("/cards", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const accountsResp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const accounts = accountsResp.data.accounts;

    const byId = new Map<string, any>();
    for (const a of accounts) byId.set(a.account_id, a);

    try {
      const liab = await plaidClient.liabilitiesGet({ access_token: accessToken });
      const credit = liab.data.liabilities?.credit ?? [];

      const cards = credit
        .filter((c) => !!c.account_id)
        .map((c) => {
          const id = String(c.account_id);
          const acc = byId.get(id);
          return {
            accountId: id,
            name: acc?.name || "Credit Card",
            mask: acc?.mask || null,
            currentBalance: acc?.balances?.current ?? null,
            isoCurrencyCode: acc?.balances?.iso_currency_code || null,
            aprs: c.aprs ?? null,
            lastPaymentAmount: c.last_payment_amount ?? null,
            lastPaymentDate: c.last_payment_date ?? null,
            nextPaymentDueDate: c.next_payment_due_date ?? null,
          };
        });

      return res.json({ source: "liabilities", cards });
    } catch (liabErr: any) {
      console.warn("⚠️ Liabilities unavailable; falling back:", liabErr.response?.data || liabErr.message);

      const cards = accounts
        .filter((a) => a.type === "credit")
        .map((a) => ({
          accountId: a.account_id,
          name: a.name,
          mask: a.mask || null,
          currentBalance: a.balances.current ?? null,
          isoCurrencyCode: a.balances.iso_currency_code || null,
          aprs: null,
          lastPaymentAmount: null,
          lastPaymentDate: null,
          nextPaymentDueDate: null,
        }));

      return res.json({ source: "accounts", cards });
    }
  } catch (err: any) {
    console.error("❌ /cards error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch cards" });
  }
});

// --- 5) Net worth (assets - debts) with Liabilities refinement + crypto via Asset ---
router.get("/net-worth", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const filterAccountId = String(req.query.accountId || "").trim() || null;

    // ---- 5.1 Pull Plaid accounts
    const { data } = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    let accounts = data.accounts;
    if (filterAccountId) {
      accounts = accounts.filter(
        (a) => a.account_id === filterAccountId || (a as any).accountId === filterAccountId
      );
    }

    const sum = (arr: number[]) => arr.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

    // ---- 5.2 Assets from Plaid accounts
    const assetTypes = new Set(["depository", "investment"]);
    const assetsPlaid = sum(
      accounts.filter((a) => assetTypes.has(a.type as any)).map((a) => a.balances.current || 0)
    );

    // ---- 5.3 Debts from Plaid accounts (refined by Liabilities when available)
    const debtTypes = new Set(["credit", "loan"]);
    let debts = sum(
      accounts.filter((a) => debtTypes.has(a.type as any)).map((a) => Math.max(a.balances.current || 0, 0))
    );
    try {
      const liab = await plaidClient.liabilitiesGet({ access_token: accessToken });
      const allowedIds = new Set(accounts.map((a) => a.account_id));

      const liabSum = (rows: any[]) =>
        sum(
          rows
            .filter((r) => allowedIds.has(String(r.account_id)))
            .map((r) => {
              const acct = accounts.find((a) => a.account_id === String(r.account_id));
              return acct?.balances?.current || 0;
            })
        );

      const creditSum = liabSum(liab.data.liabilities?.credit ?? []);
      const studentSum = liabSum(liab.data.liabilities?.student ?? []);
      const mortgageSum = liabSum(liab.data.liabilities?.mortgage ?? []);
      debts = creditSum + studentSum + mortgageSum;
    } catch {
      /* ignore - use balances fallback */
    }

    // ---- 5.4 Manual cash from manual transactions
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const manualTxnMatch: any = { userId, source: "manual" };
    if (filterAccountId) manualTxnMatch.accountId = filterAccountId;
    const manualAgg = await Transaction.aggregate([
      { $match: manualTxnMatch },
      {
        $group: {
          _id: null,
          income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
          expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
        },
      },
    ]);
    const manualCash = (manualAgg[0]?.income || 0) - (manualAgg[0]?.expense || 0);

    // ---- 5.5 Manual assets (properties, vehicles, etc.)
    let manualAssetsTotal = 0;
    if (filterAccountId) {
      const accAssets = await ManualAsset.aggregate([
        { $match: { userId, accountScope: "account", accountId: filterAccountId } },
        { $group: { _id: null, total: { $sum: "$value" } } },
      ]);
      manualAssetsTotal = accAssets[0]?.total ?? 0;
    } else {
      const allAssets = await ManualAsset.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: "$value" } } },
      ]);
      manualAssetsTotal = allAssets[0]?.total ?? 0;
    }

    // ---- 5.6 Crypto via Asset (kind: "crypto"), with live price fallback
    const cryptoQuery: any = { userId, kind: "crypto" };
    if (filterAccountId) cryptoQuery.accountId = filterAccountId;

    const cryptoHoldings = await Asset.find(cryptoQuery).lean();

    // get unique CoinGecko IDs and fetch live USD prices (cached in service)
    const cgIds = Array.from(
      new Set(cryptoHoldings.map((h) => h.cgId).filter(Boolean) as string[])
    );
    const priceMap = cgIds.length ? await getCoinGeckoPricesByIds(cgIds) : {};

    const cryptoRows = cryptoHoldings.map((h) => {
      const live = h.cgId ? priceMap[h.cgId] : undefined;
      const price = typeof live === "number" ? live : (h.lastPrice ?? 0);
      const qty = h.quantity ?? 0;
      const valueUsd = qty * (price || 0);
      return {
        accountId: h.accountId || null,
        name: h.name || null,
        symbol: h.symbol || null,
        cgId: h.cgId || null,
        quantity: qty,
        price,
        valueUsd,
      };
    });

    const cryptoTotal = sum(cryptoRows.map((r) => r.valueUsd));

    // ---- 5.7 Final math
    const assetsTotal = assetsPlaid + manualCash + manualAssetsTotal + cryptoTotal;
    const netWorth = assetsTotal - debts;

    // ---- 5.8 Breakdown
    const breakdownByType: Record<string, number> = {};
    for (const a of accounts) {
      const key = a.type || "other";
      breakdownByType[key] = (breakdownByType[key] ?? 0) + (a.balances.current || 0);
    }
    breakdownByType["manual_cash"] = manualCash;
    breakdownByType["manual_assets"] = manualAssetsTotal;
    breakdownByType["crypto"] = cryptoTotal;

    // ---- 5.9 Response
    res.json({
      summary: {
        assets: Number(assetsTotal.toFixed(2)),
        debts: Number(debts.toFixed(2)),
        netWorth: Number(netWorth.toFixed(2)),
      },
      manual: {
        cash: Number(manualCash.toFixed(2)),
        assets: Number(manualAssetsTotal.toFixed(2)),
      },
      crypto: cryptoRows,
      breakdownByType,
      currencyHint: accounts[0]?.balances?.iso_currency_code || "USD",
      appliedFilter: filterAccountId || null,
    });
  } catch (err: any) {
    console.error("❌ /net-worth error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to compute net worth" });
  }
});

/* ----------------------------------------------------------
   6) Transactions (sync last 30 days → Mongo upsert + backfill)
---------------------------------------------------------- */
router.get("/transactions", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    // optional filters from query
    const { accountId, accountIds } = req.query as { accountId?: string; accountIds?: string };
    const idsFromCSV = (accountIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const wantedAccountIds = accountId ? Array.from(new Set([accountId, ...idsFromCSV])) : idsFromCSV;

    // fetch accounts to map names
    const accountsResp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const accountsById = new Map<string, any>();
    for (const a of accountsResp.data.accounts) accountsById.set(a.account_id, a);

    // pull transactions (optionally scoped to account_ids)
    const plaidResponse = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      options: wantedAccountIds.length ? { account_ids: wantedAccountIds } : undefined,
    });

    const plaidTransactions = plaidResponse.data.transactions;
    const userId = new mongoose.Types.ObjectId(String(req.user));

    // normalize for Mongo (including plaidTxId)
    const formatted = plaidTransactions.map((txn: any) => {
      const acc = txn.account_id ? accountsById.get(txn.account_id) : undefined;
      const accountName = acc?.name || acc?.official_name || acc?.subtype || acc?.type || undefined;

      return {
        userId,
        type: txn.amount >= 0 ? "expense" : "income",
        category:
          txn.personal_finance_category?.detailed ||
          txn.personal_finance_category?.primary ||
          txn.category?.[0] ||
          "Uncategorized",
        amount: Math.abs(txn.amount),
        date: new Date(txn.date),
        description: txn.name,
        source: "plaid" as const,
        accountId: txn.account_id ?? undefined,
        accountName,
        plaidTxId: txn.transaction_id, // 👈 keep original Plaid id
      };
    });

    // upsert by plaidTxId (best dedupe key). Fallback to composite if missing.
    const ops = formatted.map((t) => {
      const filter = t.plaidTxId
        ? { userId: t.userId, plaidTxId: t.plaidTxId }
        : {
            userId: t.userId,
            date: t.date,
            amount: t.amount,
            description: t.description,
            source: "plaid",
            accountId: t.accountId ?? null,
          };
      return {
        updateOne: {
          filter,
          update: { $setOnInsert: t },
          upsert: true,
        },
      };
    });

    if (ops.length) await Transaction.bulkWrite(ops, { ordered: false });

    // 🔁 optional: kick a background accountId/name backfill
    setImmediate(async () => {
      try {
        const result = await runAccountIdBackfillForUser(String(req.user), 30);
        console.log("🔄 Backfill after /plaid/transactions sync:", result);
      } catch (e) {
        console.warn("⚠️ Backfill after sync failed:", (e as any)?.message || e);
      }
    });

    // (Optional) If you want to auto-run recurring detection here, call your service.
    // setImmediate(async () => {
    //   try {
    //     await fetch(`http://localhost:${process.env.PORT || 5000}/api/recurring/detect`, {
    //       method: "POST",
    //       headers: { "Content-Type": "application/json", Authorization: req.headers.authorization || "" },
    //       body: JSON.stringify({ lookbackDays: 45 }),
    //     });
    //   } catch (e) {
    //     console.warn("⚠️ Post-sync recurring detection failed:", (e as any)?.message || e);
    //   }
    // });

    // return from Mongo (respect same filter)
    const mongoQuery: any = { userId };
    if (wantedAccountIds.length) mongoQuery.accountId = { $in: wantedAccountIds };

    const all = await Transaction.find(mongoQuery).sort({ date: -1 });
    res.json(all);
  } catch (err: any) {
    console.error("❌ /plaid/transactions error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to fetch Plaid transactions" });
  }
});

/* ----------------------------------------------------------
   7) Investments (holdings + securities)
---------------------------------------------------------- */
router.get("/investments", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const { data } = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });

    const secById = new Map<string, any>();
    for (const s of data.securities) {
      if (s.security_id) secById.set(s.security_id, s);
    }

    const holdings = data.holdings.map((h) => {
      const s = h.security_id ? secById.get(h.security_id) : undefined;
      const price = s?.institution_price ?? 0;
      const qty = Number(h.quantity ?? 0);
      return {
        accountId: h.account_id,
        securityId: h.security_id ?? null,
        quantity: qty,
        institutionPrice: price,
        priceAsOf: s?.price_as_of ?? null,
        name: s?.name ?? null,
        ticker: s?.ticker_symbol ?? null,
        type: s?.type ?? null,
        isoCurrencyCode: s?.iso_currency_code ?? null,
        value: price * qty,
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + (h.value || 0), 0);
    res.json({ totalValue, holdings, securities: data.securities });
  } catch (err: any) {
    const status = err.response?.status ?? 500;
    res.status(status).json({
      error: "Failed to fetch investment holdings",
      details: err.response?.data ?? err.message,
    });
  }
});




/* ----------------------------------------------------------
   (Optional) quick route debugger
---------------------------------------------------------- */
router.get("/_debug-routes", (_req, res) => {
  const list = (router as any).stack
    .filter((l: any) => l.route)
    .flatMap((l: any) => Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`));
  res.json(list);
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, where: "plaidRoutes" });
});


export default router;
