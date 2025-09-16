// backend/src/services/coinGeckoService.ts
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Small TTL cache + gentle rate limiter + optional CoinGecko API key.
// All exported function names match your existing imports.

import axios from "axios";

const BASE = "https://api.coingecko.com/api/v3";

// ----- optional API key (if you have one) -----
const CG_API_KEY = process.env.COINGECKO_API_KEY?.trim();
const axiosCG = axios.create({
  baseURL: BASE,
  timeout: 12_000,
  headers: CG_API_KEY ? { "x-cg-pro-api-key": CG_API_KEY } : undefined,
});

// ----- in-memory TTL cache -----
type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<any>>();

function setCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}
function getCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value as T;
}

// ----- very-light rate limiter (serialize calls; gap ~1.4s) -----
let lastCallTs = 0;
async function rateLimit(minGapMs = 1400) {
  const now = Date.now();
  const wait = Math.max(0, minGapMs - (now - lastCallTs));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCallTs = Date.now();
}

// ----- normalize 429 into a typed Error we can catch in routes -----
function coingeckoizeError(e: any) {
  if (e?.response?.status === 429) {
    const err = new Error("coingecko_rate_limited");
    // @ts-ignore
    err.statusCode = 429;
    return err;
  }
  return e;
}

// 🔵 Live prices for multiple ids
export async function getLiveUsdPrices(
  coinGeckoIds: string[]
): Promise<Record<string, number>> {
  if (!coinGeckoIds?.length) return {};

  const key = `live:${coinGeckoIds.slice().sort().join(",")}`;
  const cached = getCache<Record<string, number>>(key);
  if (cached) return cached;

  await rateLimit();

  try {
    const { data } = await axiosCG.get(`/simple/price`, {
      params: { ids: coinGeckoIds.join(","), vs_currencies: "usd" },
    });

    const out: Record<string, number> = {};
    for (const id of coinGeckoIds) {
      const usd = data?.[id]?.usd;
      if (typeof usd === "number") out[id] = usd;
    }

    // short cache (15–30s is a good UX/safety balance)
    setCache(key, out, 20_000);
    return out;
  } catch (e: any) {
    throw coingeckoizeError(e);
  }
}

// 🔵 Alias used by your routes (keep signature)
export async function getCoinGeckoPricesByIds(ids: string[]) {
  return getLiveUsdPrices(ids);
}

// 🔵 Historical price lookup (close of date)
export async function getUsdPriceOnDate(
  coinGeckoId: string,
  date: Date
): Promise<number | null> {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const key = `hist:${coinGeckoId}:${date.getUTCFullYear()}-${month}-${day}`;
  const cached = getCache<number | null>(key);
  if (cached !== null) return cached;

  await rateLimit();

  try {
    // dd-mm-yyyy per CG docs
    const ds = `${day}-${month}-${date.getUTCFullYear()}`;
    const { data } = await axiosCG.get(`/coins/${coinGeckoId}/history`, {
      params: { date: ds, localization: "false" },
    });

    const usd = data?.market_data?.current_price?.usd;
    const price = typeof usd === "number" ? usd : null;

    // daily cache
    setCache(key, price, 24 * 60 * 60 * 1000);
    return price;
  } catch (e: any) {
    throw coingeckoizeError(e);
  }
}

// 🔵 OHLC/market chart -> [{ t, price }]
export async function getUsdMarketChart(
  coinGeckoId: string,
  days: number | "max"
): Promise<Array<{ t: number; price: number }>> {
  const key = `chart:${coinGeckoId}:${days}`;
  const cached = getCache<Array<{ t: number; price: number }>>(key);
  if (cached) return cached;

  await rateLimit();

  try {
    const { data } = await axiosCG.get(`/coins/${coinGeckoId}/market_chart`, {
      params: { vs_currency: "usd", days },
    });

    const out: Array<{ t: number; price: number }> =
      (data?.prices ?? []).map((p: [number, number]) => ({ t: Math.floor(p[0]), price: p[1] }));

    // cache 45s (enough to ride out bursty UI interactions)
    setCache(key, out, 45_000);
    return out;
  } catch (e: any) {
    throw coingeckoizeError(e);
  }
}
