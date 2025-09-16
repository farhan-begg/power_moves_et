// backend/src/services/coinGeckoService.ts
import axios from "axios";

const BASE = "https://api.coingecko.com/api/v3";

// in-memory cache with TTL
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

// 🔵 Live prices for multiple ids
export async function getLiveUsdPrices(
  coinGeckoIds: string[]
): Promise<Record<string, number>> {
  const key = `live:${coinGeckoIds.sort().join(",")}`;
  const cached = getCache<Record<string, number>>(key);
  if (cached) return cached;

  if (coinGeckoIds.length === 0) return {};
  const { data } = await axios.get(`${BASE}/simple/price`, {
    params: { ids: coinGeckoIds.join(","), vs_currencies: "usd" },
  });

  const result: Record<string, number> = {};
  for (const id of coinGeckoIds) {
    const usd = data?.[id]?.usd;
    if (typeof usd === "number") result[id] = usd;
  }

  // cache (60s – bump to 3600s for hourly if you want)
  setCache(key, result, 60 * 1000);
  return result;
}

// 🔵 Friendlier alias so routes don’t care about function name
export async function getCoinGeckoPricesByIds(ids: string[]) {
  return getLiveUsdPrices(ids);
}

// 🔵 Historical price lookup (close of date)
export async function getUsdPriceOnDate(
  coinGeckoId: string,
  date: Date
): Promise<number | null> {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const key = `hist:${coinGeckoId}:${date.getUTCFullYear()}-${month}-${day}`;
  const cached = getCache<number | null>(key);
  if (cached !== null && cached !== undefined) return cached;

  const ds = `${day}-${month}-${date.getUTCFullYear()}`;
  const { data } = await axios.get(`${BASE}/coins/${coinGeckoId}/history`, {
    params: { date: ds, localization: "false" },
  });

  const usd = data?.market_data?.current_price?.usd;
  const price = typeof usd === "number" ? usd : null;
  setCache(key, price, 24 * 60 * 60 * 1000); // cache daily
  return price;
}


// add near top with others
export async function getUsdMarketChart(coinGeckoId: string, days: number | "max"): Promise<Array<{ t: number; price: number }>> {
  const key = `chart:${coinGeckoId}:${days}`;
  const cached = getCache<Array<{ t:number; price:number }>>(key);
  if (cached) return cached;

  const { data } = await axios.get(`${BASE}/coins/${coinGeckoId}/market_chart`, {
    params: { vs_currency: "usd", days }
  });

  const out: Array<{ t: number; price: number }> =
    (data?.prices ?? []).map((p: [number, number]) => ({ t: p[0], price: p[1] }));

  // cache 60s (tune as you like)
  setCache(key, out, 60 * 1000);
  return out;
}
