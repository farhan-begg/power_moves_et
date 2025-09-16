// backend/src/routes/cryptoRoutes.ts
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Same routes as you posted, with 429 surfacing in /price-series and safer ObjectId handling.

import { Router } from "express";
import mongoose, { Types as MTypes } from "mongoose";
import { AuthRequest, protect } from "../middleware/authMiddleware";
import Asset from "../models/Asset";
import {
  getCoinGeckoPricesByIds,
  getUsdMarketChart,
  getUsdPriceOnDate,
} from "../services/coinGeckoService";

const router = Router();
const OID = MTypes.ObjectId;

console.log("🔌 cryptoRoutes: file loaded");

/* ----------------------- Create / Update holding ----------------------- */
router.post("/holdings", protect, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const {
    id,
    kind = "crypto",
    source = "manual",
    accountScope = "global",
    accountId = null,

    name,
    symbol,
    cgId = null,
    chainId = null,
    contractAddress = null,
    decimals = null,

    quantity,
    lots = [],
  } = req.body || {};

  if (kind !== "crypto") return res.status(400).json({ error: "kind must be 'crypto'" });
  if (!cgId && (!symbol || !name)) {
    return res.status(400).json({ error: "Provide at least cgId or (symbol & name)" });
  }

  const payload: any = {
    userId, kind, source, accountScope, accountId,
    name: name ?? null,
    symbol: symbol ?? null,
    cgId, chainId, contractAddress, decimals,
  };

  if (Number.isFinite(quantity)) payload.quantity = Number(quantity);
  if (Array.isArray(lots)) payload.lots = lots;

  const doc = id
    ? await Asset.findOneAndUpdate(
        { _id: OID.isValid(id) ? new OID(id) : id, userId },
        { $set: payload },
        { new: true }
      )
    : await Asset.create({
        ...payload,
        quantity:
          payload.quantity ??
          (lots?.reduce((s: number, l: any) => s + (l?.quantity || 0), 0) || 0),
      });

  res.json(doc);
});

/* ----------------------- Add lot ----------------------- */
router.post("/holdings/:id/lots", protect, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { id } = req.params;
  const { purchasedAt = null, quantity, unitCostUSD = null, note = null } = req.body || {};

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "quantity > 0 required" });
  }

  const asset = await Asset.findOne({
    _id: OID.isValid(id) ? new OID(id) : id, userId, kind: "crypto",
  });
  if (!asset) return res.status(404).json({ error: "Asset not found" });

  asset.lots.push({ purchasedAt, quantity, unitCostUSD, note } as any);
  asset.quantity = (asset.quantity ?? 0) + quantity; // keep quick total in sync
  await asset.save();

  res.json(asset);
});

/* ----------------------- Update lot ----------------------- */
router.put("/holdings/:id/lots/:lotId", protect, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { id, lotId } = req.params;
  const { purchasedAt, quantity, unitCostUSD, note } = req.body || {};

  const asset = await Asset.findOne({
    _id: OID.isValid(id) ? new OID(id) : id, userId, kind: "crypto",
  });
  if (!asset) return res.status(404).json({ error: "Asset not found" });

  const lot = asset.lots.id(lotId as any);
  if (!lot) return res.status(404).json({ error: "Lot not found" });

  if (Number.isFinite(quantity)) {
    asset.quantity = (asset.quantity ?? 0) - (lot.quantity || 0) + Number(quantity);
    lot.set({ quantity: Number(quantity) });
  }
  if (purchasedAt !== undefined) lot.set({ purchasedAt });
  if (unitCostUSD !== undefined) lot.set({ unitCostUSD: unitCostUSD ?? null });
  if (note !== undefined) lot.set({ note });

  await asset.save();
  res.json(asset);
});

/* ----------------------- Delete lot ----------------------- */
router.delete("/holdings/:id/lots/:lotId", protect, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { id, lotId } = req.params;

  const asset = await Asset.findOne({
    _id: OID.isValid(id) ? new OID(id) : id, userId, kind: "crypto",
  });
  if (!asset) return res.status(404).json({ error: "Asset not found" });

  const lot = asset.lots.id(lotId as any);
  if (!lot) return res.status(404).json({ error: "Lot not found" });

  asset.quantity = (asset.quantity ?? 0) - (lot.quantity || 0); // quick total
  lot.deleteOne();
  await asset.save();

  res.json(asset);
});

/* ----------------------- Holdings list ----------------------- */
router.get("/holdings", protect, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { accountId } = req.query as { accountId?: string };
  const q: any = { userId, kind: "crypto" };
  if (accountId) q.accountId = accountId;

  const list = await Asset.find(q).sort({ updatedAt: -1 });
  res.json(list);
});

/* ----------------------- Portfolio (enriched) ----------------------- */
router.get("/portfolio", protect, async (req: AuthRequest, res) => {
  const userId = new mongoose.Types.ObjectId(String(req.user));
  const { accountId } = req.query as { accountId?: string };
  const q: any = { userId, kind: "crypto" };
  if (accountId) q.accountId = accountId;

  const holdings = await Asset.find(q);

  const ids = Array.from(new Set(holdings.map((h) => h.cgId).filter(Boolean))) as string[];
  const priceMap = ids.length ? await getCoinGeckoPricesByIds(ids) : {};

  const enriched = await Promise.all(
    holdings.map(async (h) => {
      const price = h.cgId ? priceMap[h.cgId] ?? h.lastPrice ?? 0 : h.lastPrice ?? 0;

      const lots = await Promise.all(
        (h.lots || []).map(async (lot) => {
          let baseline = lot.unitCostUSD ?? null;
          if (baseline == null && h.cgId && lot.purchasedAt) {
            try {
              baseline = await getUsdPriceOnDate(h.cgId, lot.purchasedAt);
            } catch {
              baseline = null;
            }
          }
          const valueNow = (lot.quantity || 0) * (price || 0);
          const costBasis = (lot.quantity || 0) * (baseline ?? 0);
          const pnl = valueNow - costBasis;
          const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : null;

          return {
            _id: lot._id,
            purchasedAt: lot.purchasedAt,
            quantity: lot.quantity,
            unitCostUSD: lot.unitCostUSD ?? baseline,
            valueNow,
            costBasis,
            pnl,
            pnlPct,
          };
        })
      );

      const positionValue = (h.quantity || 0) * (price || 0);
      const lotsCostBasis = lots.reduce((s, l) => s + (l.costBasis || 0), 0);
      const lotsPnl = positionValue - lotsCostBasis;
      const lotsPnlPct = lotsCostBasis > 0 ? (lotsPnl / lotsCostBasis) * 100 : null;

      return {
        _id: h._id,
        name: h.name,
        symbol: h.symbol,
        cgId: h.cgId,
        accountId: h.accountId,
        quantity: h.quantity,
        price,
        value: positionValue,
        lots,
        totalCostBasis: lotsCostBasis,
        pnl: lotsPnl,
        pnlPct: lotsPnlPct,
        lastPriceAt: h.lastPriceAt,
      };
    })
  );

  const total = enriched.reduce((s, r) => s + (r.value || 0), 0);
  const byAccount: Record<string, number> = {};
  for (const r of enriched) {
    const key = r.accountId || "global";
    byAccount[key] = (byAccount[key] ?? 0) + (r.value || 0);
  }

  res.json({ summary: { totalUSD: Number(total.toFixed(2)) }, byAccount, holdings: enriched });
});

/* ----------------------- Legacy SSE (hourly tick) ----------------------- */
router.get("/stream", protect, async (req: AuthRequest, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const userId = new mongoose.Types.ObjectId(String(req.user));
  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  req.on("close", () => { closed = true; });

  const doTick = async () => {
    try {
      const holdings = await Asset.find({ userId, kind: "crypto" });
      const ids = Array.from(new Set(holdings.map((h) => h.cgId).filter(Boolean))) as string[];
      const priceMap = ids.length ? await getCoinGeckoPricesByIds(ids) : {};

      let total = 0;
      const rows = holdings.map((h) => {
        const price = h.cgId ? priceMap[h.cgId] ?? h.lastPrice ?? 0 : h.lastPrice ?? 0;
        const value = (h.quantity || 0) * (price || 0);
        total += value;
        return { id: String(h._id), cgId: h.cgId, symbol: h.symbol, quantity: h.quantity, price, value };
      });

      send("prices", { totalUSD: Number(total.toFixed(2)), rows });

      const now = new Date();
      for (const h of holdings) {
        const p = h.cgId ? priceMap[h.cgId] ?? null : null;
        if (p != null) {
          await Asset.updateOne({ _id: h._id }, { $set: { lastPrice: p, lastPriceAt: now } });
        }
      }
    } catch (e) {
      send("error", { message: (e as any)?.message || "tick failed" });
    }
  };

  doTick();
  const interval = setInterval(() => { if (!closed) doTick(); }, 60 * 60 * 1000);
  req.on("close", () => clearInterval(interval));
});

/* ----------------------- Price series by cgId ----------------------- */
router.get("/price-series", protect, async (req: AuthRequest, res) => {
  try {
    const { cgId, days = "365" } = req.query as { cgId?: string; days?: string };
    if (!cgId) return res.status(400).json({ error: "cgId required" });

    const period: number | "max" = days === "max" ? "max" : Math.max(1, Number(days) || 365);
    const series = await getUsdMarketChart(cgId, period);
    if (!Array.isArray(series) || series.length === 0) return res.status(204).end();

    res.json({ series });
  } catch (e: any) {
    if (e?.statusCode === 429 || /rate_limited/i.test(e?.message)) {
      // Surface 429 so the frontend can back off but keep last-good cache
      return res.status(429).json({ error: "rate_limited" });
    }
    console.error("price-series error:", e?.message);
    res.status(500).json({ error: e?.message || "failed to get price series" });
  }
});

/* ----------------------- PnL series (invested vs value) ----------------------- */
router.get("/pnl-series", protect, async (req: AuthRequest, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user));
    const { holdingId, days = "365" } = req.query as { holdingId?: string; days?: string };

    if (!holdingId || !OID.isValid(holdingId)) {
      return res.status(400).json({ error: "holdingId required/invalid" });
    }
    const period: number | "max" = days === "max" ? "max" : Math.max(1, Number(days) || 365);

    const h = await Asset.findOne({ _id: new OID(holdingId), userId, kind: "crypto" });
    if (!h) return res.status(404).json({ error: "holding not found" });
    if (!h.cgId) return res.status(400).json({ error: "holding missing cgId" });

    const lots = (h.lots || [])
      .filter((l: any) => Number.isFinite(l?.quantity) && l.quantity > 0)
      .sort((a: any, b: any) =>
        new Date(a.purchasedAt || 0).getTime() - new Date(b.purchasedAt || 0).getTime()
      );
    if (lots.length === 0) return res.status(204).end();

    const priceSeries = await getUsdMarketChart(h.cgId, period);
    if (!Array.isArray(priceSeries) || priceSeries.length === 0) return res.status(204).end();

    type Step = { t: number; qty: number; invested: number };
    let runningQty = 0;
    let runningInvested = 0;

    const lotSteps: Step[] = [];
    for (const lot of lots) {
      const ts = lot.purchasedAt ? new Date(lot.purchasedAt).getTime() : Date.now();
      let unit = lot.unitCostUSD ?? null;
      if (unit == null) {
        try {
          unit = await getUsdPriceOnDate(h.cgId, new Date(ts));
        } catch {
          unit = 0;
        }
      }
      runningQty += lot.quantity;
      runningInvested += lot.quantity * (unit || 0);
      lotSteps.push({ t: ts, qty: runningQty, invested: runningInvested });
    }

    let i = 0;
    const series = priceSeries.map((p) => {
      while (i + 1 < lotSteps.length && lotSteps[i + 1].t <= p.t) i++;
      const step = lotSteps[i] || { qty: 0, invested: 0, t: p.t };
      const value = step.qty * p.price;
      const pnl = value - step.invested;
      const pnlPct = step.invested > 0 ? (pnl / step.invested) * 100 : 0;
      return { t: p.t, price: p.price, qty: step.qty, invested: step.invested, value, pnl, pnlPct };
    });

    if (series.length === 0) return res.status(204).end();
    res.json({ cgId: h.cgId, holdingId: String(h._id), series });
  } catch (e: any) {
    if (e?.statusCode === 429 || /rate_limited/i.test(e?.message)) {
      return res.status(429).json({ error: "rate_limited" });
    }
    console.error("pnl-series error:", e?.message);
    res.status(500).json({ error: e?.message || "failed to build pnl series" });
  }
});

/* ----------------------- Health / debug ----------------------- */
router.get("/health", (_req, res) => res.json({ ok: true, where: "cryptoRoutes" }));
router.get("/_debug-routes", (_req, res) => {
  const list = (router as any).stack
    .filter((l: any) => l.route)
    .flatMap((l: any) => Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${l.route.path}`));
  res.json({ base: "/api/crypto", routes: list });
});

export default router;
