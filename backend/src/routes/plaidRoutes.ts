import { Router, type Response } from "express";
import mongoose from "mongoose";
import plaidClient from "../services/plaidService";
import User from "../models/User";
import Transaction from "../models/Transaction";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import { encrypt, decrypt } from "../utils/cryptoUtils";
import { Products, CountryCode } from "plaid";

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
   2) Exchange public token
---------------------------------------------------------- */
router.post("/exchange-public-token", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { public_token } = req.body as { public_token?: string };
    if (!public_token) return res.status(400).json({ error: "public_token is required" });

    const { data } = await plaidClient.itemPublicTokenExchange({ public_token });
    await User.findByIdAndUpdate(String(req.user), { plaidAccessToken: encrypt(data.access_token) });

    res.json({ message: "Plaid account linked successfully" });
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
   4) Cards (prefer Liabilities; fallback to accounts type)
---------------------------------------------------------- */
router.get("/cards", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const accountsResp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const accounts = accountsResp.data.accounts;

    // keep types simple to avoid squiggles
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

/* ----------------------------------------------------------
   5) Net worth (assets - debts) with Liabilities refinement
---------------------------------------------------------- */
router.get("/net-worth", protect, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getDecryptedAccessToken(req, res);
    if (!accessToken) return;

    const { data } = await plaidClient.accountsBalanceGet({ access_token: accessToken });
    const accounts = data.accounts;

    const sum = (arr: number[]) => arr.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

    const assetTypes = new Set(["depository", "investment"]);
    const debtTypes = new Set(["credit", "loan", "mortgage"]);

    const assets = sum(accounts.filter((a) => assetTypes.has(a.type)).map((a) => a.balances.current || 0));
    let debts = sum(accounts.filter((a) => debtTypes.has(a.type)).map((a) => Math.max(a.balances.current || 0, 0)));

    try {
      const liab = await plaidClient.liabilitiesGet({ access_token: accessToken });
      const credit = liab.data.liabilities?.credit ?? [];
      const student = liab.data.liabilities?.student ?? [];
      const mortgage = liab.data.liabilities?.mortgage ?? [];

      const byId: Record<string, any> = {};
      for (const a of accounts) byId[a.account_id] = a;

      const creditSum = sum(credit.map((c: any) => byId[String(c.account_id)]?.balances?.current || 0));
      const studentSum = sum(student.map((s: any) => byId[String(s.account_id)]?.balances?.current || 0));
      const mortgageSum = sum(mortgage.map((m: any) => byId[String(m.account_id)]?.balances?.current || 0));

      debts = creditSum + studentSum + mortgageSum;
    } catch {
      /* keep account-based debts */
    }

    const netWorth = assets - debts;

    const breakdownByType: Record<string, number> = {};
    for (const a of accounts) {
      const key = a.type || "other";
      breakdownByType[key] = (breakdownByType[key] ?? 0) + (a.balances.current || 0);
    }

    res.json({
      summary: {
        assets: Number(assets.toFixed(2)),
        debts: Number(debts.toFixed(2)),
        netWorth: Number(netWorth.toFixed(2)),
      },
      breakdownByType,
      currencyHint: accounts[0]?.balances?.iso_currency_code || "USD",
    });
  } catch (err: any) {
    console.error("❌ /net-worth error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "Failed to compute net worth" });
  }
});

/* ----------------------------------------------------------
   6) Transactions (sync last 30 days → Mongo upsert)
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

    const plaidTransactions = plaidResponse.data.transactions;
    const userId = new mongoose.Types.ObjectId(String(req.user));

    const formatted = plaidTransactions.map((txn: any) => ({
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
    }));

    for (const t of formatted) {
      await Transaction.updateOne(
        { userId: t.userId, amount: t.amount, date: t.date, description: t.description },
        { $setOnInsert: t },
        { upsert: true }
      );
    }

    const all = await Transaction.find({ userId }).sort({ date: -1 });
    res.json(all);
  } catch (err: any) {
    console.error("❌ /transactions sync error:", err.response?.data || err.message || err);
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

export default router;
