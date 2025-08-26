import { Router, Response } from "express";
import mongoose from "mongoose";
import { protect, AuthRequest } from "../middleware/authMiddleware";
import Position from "../models/Position";
import { fmpSearch, fmpQuote, fmpHistorical } from "../services/fmpService";

const router = Router();

/** ---------- QUICK PING (unprotected) ---------- */
router.get("/__ping", (_req, res) => res.send("stocks router is mounted"));

/** Helper: build a valid ObjectId from req.user or return 401 */
function getUserIdOr401(req: AuthRequest, res: Response) {
  const raw = (req.user ?? "").toString();
  if (!raw || !mongoose.isValidObjectId(raw)) {
    res.status(401).json({ error: "Unauthorized (missing/invalid user id)" });
    return null;
  }
  return new mongoose.Types.ObjectId(raw);
}

/** Helper: safe date parse */
function parseISODateOr400(src: string | undefined, res: Response, field = "date") {
  if (!src) {
    res.status(400).json({ error: `Missing ${field}` });
    return null;
  }
  const d = new Date(src);
  if (isNaN(d.getTime())) {
    res.status(400).json({ error: `Invalid ${field}` });
    return null;
  }
  return d;
}

/** ---------- STOCK SEARCH (for autocomplete) ---------- */
router.get("/search", protect, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json([]);
    let results: any[] = [];
    try {
      results = await fmpSearch(q, 12);
    } catch (err: any) {
      console.warn("⚠️ [stocks/search] fmpSearch failed:", err?.message || err);
      return res.status(502).json({ error: "Upstream search provider failed" });
    }
    const filtered = (results || []).filter((r: any) =>
      ["stock", "etf", "fund"].includes(String(r?.type || "").toLowerCase())
    );
    res.json(filtered);
  } catch (e: any) {
    console.error("❌ [stocks/search] Uncaught:", e?.message || e);
    res.status(500).json({ error: "Search failed" });
  }
});

/** ---------- CREATE a position (amount + date -> compute shares) ---------- */
router.post("/positions", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const { symbol, amountInvested, purchaseDate } = req.body as {
      symbol?: string;
      amountInvested?: number;
      purchaseDate?: string;
    };

    if (!symbol || !amountInvested || !purchaseDate) {
      return res.status(400).json({ error: "symbol, amountInvested, purchaseDate are required" });
    }
    if (!(amountInvested > 0)) {
      return res.status(400).json({ error: "amountInvested must be > 0" });
    }

    const sym = symbol.trim().toUpperCase();
    const d = parseISODateOr400(purchaseDate, res, "purchaseDate");
    if (!d) return;

    // Find price on/after purchaseDate within small window
    const from = new Date(d); from.setDate(from.getDate() - 3);
    const to   = new Date(d); to.setDate(to.getDate() + 7);

    let hist: any[] = [];
    try {
      hist = await fmpHistorical(
        sym,
        from.toISOString().slice(0, 10),
        to.toISOString().slice(0, 10)
      );
    } catch (err: any) {
      console.warn("⚠️ [POST /positions] fmpHistorical failed:", sym, err?.message || err);
    }

    if (!hist?.length) {
      return res.status(400).json({ error: "No historical prices available for date range" });
    }

    const targetISO = d.toISOString().slice(0, 10);
    const sorted = [...hist].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const bar = sorted.find(h => h.date >= targetISO) || sorted[0];
    const purchasePrice = Number(bar?.close || 0);
    if (!(purchasePrice > 0)) return res.status(400).json({ error: "Invalid purchase price" });

    const shares = Number((amountInvested / purchasePrice).toFixed(6));

    // Optional: get name/currency (non-fatal)
    let meta: any = {};
    try {
      const q = await fmpQuote([sym]);
      meta = Array.isArray(q) ? (q[0] || {}) : {};
    } catch (err: any) {
      console.warn("⚠️ [POST /positions] fmpQuote failed:", sym, err?.message || err);
    }

    const position = await Position.create({
      userId,
      symbol: sym,
      name: meta?.name,
      currency: meta?.currency || "USD",
      purchaseDate: d,
      amountInvested,
      shares,
      purchasePrice,
    });

    res.status(201).json(position);
  } catch (e: any) {
    console.error("❌ [POST /positions] Uncaught:", e?.message || e);
    res.status(500).json({ error: "Failed to create position" });
  }
});

/** ---------- LIST positions with live P/L ---------- */
router.get("/positions", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const positions = await Position.find({ userId }).sort({ purchaseDate: -1 });

    if (!positions.length) {
      return res.json({
        positions: [],
        totals: { invested: 0, current: 0, gain: 0, gainPct: 0 },
      });
    }

    const symbols = Array.from(new Set(positions.map(p => p.symbol).filter(Boolean)));
    let quotes: any[] = [];
    if (symbols.length) {
      try {
        quotes = await fmpQuote(symbols);
      } catch (err: any) {
        console.warn("⚠️ [GET /positions] fmpQuote failed:", symbols.join(","), err?.message || err);
      }
    }

    const bySym = new Map((quotes || []).map((q: any) => [String(q?.symbol || "").toUpperCase(), q]));

    const result = positions.map(p => {
      const price = bySym.get(String(p.symbol).toUpperCase())?.price ?? p.purchasePrice;
      const currentValue = Number((p.shares * Number(price || 0)).toFixed(2));
      const gain = Number((currentValue - p.amountInvested).toFixed(2));
      const gainPct = p.amountInvested > 0 ? Number(((gain / p.amountInvested) * 100).toFixed(2)) : 0;
      return {
        ...p.toObject(),
        currentPrice: Number(price || 0),
        currentValue,
        gain,
        gainPct,
      };
    });

    const invested = result.reduce((s, r) => s + (r.amountInvested || 0), 0);
    const current  = result.reduce((s, r) => s + (r.currentValue || 0), 0);
    const gain     = Number((current - invested).toFixed(2));
    const gainPct  = invested > 0 ? Number(((gain / invested) * 100).toFixed(2)) : 0;

    res.json({ positions: result, totals: { invested, current, gain, gainPct } });
  } catch (e: any) {
    console.error("❌ [GET /positions] Uncaught:", e?.message || e);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

/** ---------- UPDATE (recompute shares if amount/date changed) ---------- */
router.put("/positions/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid position id" });

    const body = req.body as Partial<{
      symbol: string;
      amountInvested: number;
      purchaseDate: string;
    }>;

    const existing = await Position.findOne({ _id: id, userId });
    if (!existing) return res.status(404).json({ error: "Position not found" });

    const sym = (body.symbol ?? existing.symbol).trim().toUpperCase();
    const amt = body.amountInvested ?? existing.amountInvested;
    const dateStr = body.purchaseDate ?? existing.purchaseDate.toISOString().slice(0, 10);
    const d = parseISODateOr400(dateStr, res, "purchaseDate");
    if (!d) return;

    // Re-get purchase price if symbol/date changed
    let purchasePrice = existing.purchasePrice;
    if (
      sym !== existing.symbol ||
      d.toISOString().slice(0, 10) !== existing.purchaseDate.toISOString().slice(0, 10)
    ) {
      const from = new Date(d); from.setDate(from.getDate() - 3);
      const to   = new Date(d); to.setDate(to.getDate() + 7);

      let hist: any[] = [];
      try {
        hist = await fmpHistorical(sym, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
      } catch (err: any) {
        console.warn("⚠️ [PUT /positions/:id] fmpHistorical failed:", sym, err?.message || err);
      }

      if (!hist?.length) return res.status(400).json({ error: "No historical price for new date/symbol" });
      const targetISO = d.toISOString().slice(0, 10);
      const sorted = [...hist].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const bar = sorted.find(h => h.date >= targetISO) || sorted[0];
      purchasePrice = Number(bar?.close || 0);
      if (!(purchasePrice > 0)) return res.status(400).json({ error: "Invalid recomputed price" });
    }

    const shares = Number((amt / purchasePrice).toFixed(6));
    existing.symbol = sym;
    existing.amountInvested = amt;
    existing.purchaseDate = d;
    existing.purchasePrice = purchasePrice;
    existing.shares = shares;

    await existing.save();
    res.json(existing);
  } catch (e: any) {
    console.error("❌ [PUT /positions/:id] Uncaught:", e?.message || e);
    res.status(500).json({ error: "Failed to update position" });
  }
});

/** ---------- DELETE ---------- */
router.delete("/positions/:id", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Invalid position id" });

    const deleted = await Position.findOneAndDelete({ _id: id, userId });
    if (!deleted) return res.status(404).json({ error: "Position not found" });
    res.json({ message: "Deleted", id: deleted._id });
  } catch (e: any) {
    console.error("❌ [DELETE /positions/:id] Uncaught:", e?.message || e);
    res.status(500).json({ error: "Failed to delete position" });
  }
});


// --- replace your existing /quotes handler with this one ---

// Simple in-memory cache: { userId -> { expires: number, payload: any } }
const quotesCache = new Map<
  string,
  { expires: number; payload: { quotes: Array<{symbol:string; price:number; name?:string; currency?:string; t:string}> } }
>();

// helper to chunk arrays
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

router.get("/quotes", protect, async (req: AuthRequest, res: Response) => {
  try {
    // ✅ validate user id safely
    const uidRaw = (req.user ?? "").toString();
    if (!uidRaw || !mongoose.isValidObjectId(uidRaw)) {
      return res.status(401).json({ error: "Unauthorized (missing/invalid user id)" });
    }
    const userId = new mongoose.Types.ObjectId(uidRaw);

    // ✅ serve from cache if fresh
    const cached = quotesCache.get(uidRaw);
    const nowMs = Date.now();
    if (cached && cached.expires > nowMs) {
      res.setHeader("x-cache", "HIT");
      return res.json(cached.payload);
    }

    // get unique symbols for this user
    const positions = await Position.find({ userId }).select("symbol");
    const symbols = Array.from(new Set(positions.map(p => p.symbol).filter(Boolean)));
    if (!symbols.length) {
      const payload = { quotes: [] };
      quotesCache.set(uidRaw, { expires: nowMs + 15_000, payload }); // cache empty too
      res.setHeader("x-cache", "MISS");
      return res.json(payload);
    }

    // ⚠️ Free plans: keep batches small and add a TTL to avoid rate limits
    // Adjust chunk size to your plan; 10~20 is usually safe on free tiers
    const CHUNK_SIZE = 12;
    const chunks = chunk(symbols, CHUNK_SIZE);

    const allQuotes: any[] = [];
    for (const c of chunks) {
      try {
        const q = await fmpQuote(c);
        if (Array.isArray(q)) allQuotes.push(...q);
      } catch (err: any) {
        // mark that upstream failed for this chunk but don't bomb the response
        console.warn("⚠️ [GET /quotes] upstream chunk failed:", c.join(","), err?.message || err);
        // Small delay before next chunk to be polite to the API
        await new Promise(r => setTimeout(r, 350));
      }
      // brief spacing between chunks to reduce spikes
      await new Promise(r => setTimeout(r, 150));
    }

    // If upstream gave us nothing (likely rate limit/plan), respond gracefully
    if (!allQuotes.length) {
      res.setHeader("x-upstream-status", "degraded");
      res.setHeader("x-upstream-note", "No quotes (throttled/plan limit?)");
      const payload = { quotes: [] as any[] };
      quotesCache.set(uidRaw, { expires: nowMs + 8_000, payload }); // short cache to avoid hammering
      return res.json(payload);
    }

    const isoNow = new Date().toISOString();
    const payload = {
      quotes: allQuotes.map(q => ({
        symbol: q?.symbol?.toUpperCase?.() ?? "",
        price: Number(q?.price ?? 0),
        name: q?.name,
        currency: q?.currency ?? "USD",
        t: isoNow,
      })),
    };

    // ✅ cache success for a short window (tune TTL for your polling)
    quotesCache.set(uidRaw, { expires: nowMs + 15_000, payload });
    res.setHeader("x-cache", "MISS");
    return res.json(payload);
  } catch (e: any) {
    console.error("❌ [GET /quotes] Uncaught:", e?.message || e);
    // Final safety: never expose 502 to the browser
    res.setHeader("x-upstream-status", "error");
    res.status(200).json({ quotes: [] });
  }
});


/**
 * ---------- GET /api/stocks/history ----------
 * Query:
 *   symbols=AAPL,MSFT (optional; if omitted -> uses user positions)
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 * Returns: { series: { [symbol]: { t: string, close: number }[] } }
 */
router.get("/history", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { symbols, from, to } = req.query as {
      symbols?: string;
      from?: string;
      to?: string;
    };

    let symArr: string[] = [];
    if (symbols && symbols.trim()) {
      symArr = symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    } else {
      const userId = getUserIdOr401(req, res);
      if (!userId) return;
      const rows = await Position.find({ userId }, { symbol: 1 }).lean();
      symArr = Array.from(new Set(rows.map(r => r.symbol))).filter(Boolean);
    }
    if (!symArr.length) return res.json({ series: {} });

    const fromISO =
      (from && /^\d{4}-\d{2}-\d{2}$/.test(from) && from) ||
      new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10); // default 1y
    const toISO =
      (to && /^\d{4}-\d{2}-\d{2}$/.test(to) && to) ||
      new Date().toISOString().slice(0, 10);

    const out: Record<string, { t: string; close: number }[]> = {};
    for (const s of symArr) {
      try {
        const hist = await fmpHistorical(s, fromISO, toISO); // daily candles
        out[s] = (hist || [])
          .map((h: any) => ({ t: h.date, close: Number(h?.close) || 0 }))
          .filter(p => p.close > 0);
      } catch (err: any) {
        console.warn("⚠️ [GET /history] fmpHistorical failed:", s, err?.message || err);
        out[s] = [];
      }
    }
    res.json({ series: out });
  } catch (e: any) {
    console.error("❌ [GET /history] Uncaught:", e?.message || e);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
