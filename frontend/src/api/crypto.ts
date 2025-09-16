// src/api/crypto.ts
import { http, auth } from "./http";

/* ----------------------------- Types ----------------------------- */
export type CryptoLot = {
  _id: string;
  purchasedAt?: string | null;     // ISO string (server returns ISO)
  quantity: number;
  unitCostUSD?: number | null;     // may be inferred if not provided
  valueNow?: number;
  costBasis?: number;
  pnl?: number;
  pnlPct?: number | null;
  note?: string | null;
};

export type CryptoHolding = {
  _id: string;
  name?: string | null;
  symbol?: string | null;
  cgId?: string | null;
  accountId?: string | null;
  quantity: number;
  price: number;                   // live price (USD)
  value: number;                   // quantity * price
  lastPriceAt?: string | null;
  lots?: CryptoLot[];
  totalCostBasis?: number;
  pnl?: number;
  pnlPct?: number | null;
};

export type CryptoPortfolioResponse = {
  summary: { totalUSD: number };
  byAccount: Record<string, number>;
  holdings: CryptoHolding[];
};

export type CreateOrUpdateHoldingPayload = {
  id?: string;                 // for update
  kind?: "crypto";
  source?: "manual" | "wallet" | "exchange";
  accountScope?: "global" | "account";
  accountId?: string | null;

  name?: string | null;
  symbol?: string | null;
  cgId?: string | null;
  chainId?: number | null;
  contractAddress?: string | null;
  decimals?: number | null;

  quantity?: number;           // optional if lots provided
  lots?: Array<{
    purchasedAt?: string | null;  // ISO date string from UI
    quantity: number;
    unitCostUSD?: number | null;
    note?: string | null;
  }>;
};

export type AddLotPayload = {
  id: string; // holding _id
  purchasedAt?: string | null;
  quantity: number;
  unitCostUSD?: number | null;
  note?: string | null;
};

export type UpdateLotPayload = {
  id: string;    // holding _id
  lotId: string; // lot _id
  purchasedAt?: string | null;
  quantity?: number; // if provided, will re-total
  unitCostUSD?: number | null;
  note?: string | null;
};

export type DeleteLotPayload = { id: string; lotId: string };

/* ---- SSE event typing (what /api/crypto/stream sends on "prices") ---- */
export type CryptoPriceRow = {
  id: string;              // holding _id
  cgId?: string | null;
  symbol?: string | null;
  quantity: number;
  price: number;           // USD
  value: number;           // quantity * price
};

export type CryptoPricesEvent = {
  totalUSD: number;
  rows: CryptoPriceRow[];
};

/* ------------------------ Helpers / Fallback ------------------------ */
async function getWithFallback<T>(
  token: string,
  primaryPath: string,
  fallbackPath: string,
  params?: Record<string, any>
): Promise<T> {
  try {
    const { data } = await http.get(primaryPath, { ...auth(token), params });
    return data as T;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.get(fallbackPath, { ...auth(token), params });
      return data as T;
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    throw new Error(msg);
  }
}

async function postWithFallback<T>(
  token: string,
  primaryPath: string,
  fallbackPath: string,
  body?: any
): Promise<T> {
  try {
    const { data } = await http.post(primaryPath, body, auth(token));
    return data as T;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.post(fallbackPath, body, auth(token));
      return data as T;
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    throw new Error(msg);
  }
}

async function putWithFallback<T>(
  token: string,
  primaryPath: string,
  fallbackPath: string,
  body?: any
): Promise<T> {
  try {
    const { data } = await http.put(primaryPath, body, auth(token));
    return data as T;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.put(fallbackPath, body, auth(token));
      return data as T;
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    throw new Error(msg);
  }
}

async function deleteWithFallback<T>(
  token: string,
  primaryPath: string,
  fallbackPath: string
): Promise<T> {
  try {
    const { data } = await http.delete(primaryPath, auth(token));
    return data as T;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.delete(fallbackPath, auth(token));
      return data as T;
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    throw new Error(msg);
  }
}

/* ----------------------------- Reads ----------------------------- */
export async function fetchCryptoPortfolio(token: string, accountId?: string): Promise<CryptoPortfolioResponse> {
  return getWithFallback<CryptoPortfolioResponse>(
    token,
    "/api/crypto/portfolio",
    "/crypto/portfolio",
    accountId ? { accountId } : undefined
  );
}

export async function listHoldings(token: string, accountId?: string) {
  return getWithFallback<any[]>(
    token,
    "/api/crypto/holdings",
    "/crypto/holdings",
    accountId ? { accountId } : undefined
  );
}

export async function getHolding(token: string, id: string) {
  // If you add a backend GET /crypto/holdings/:id later, this is ready.
  return getWithFallback<any>(token, `/api/crypto/holdings/${id}`, `/crypto/holdings/${id}`);
}

/* ---------------------------- Mutations ---------------------------- */
export async function upsertHolding(token: string, payload: CreateOrUpdateHoldingPayload) {
  return postWithFallback<any>(token, "/api/crypto/holdings", "/crypto/holdings", payload);
}

export async function deleteHolding(token: string, id: string) {
  return deleteWithFallback<any>(token, `/api/crypto/holdings/${id}`, `/crypto/holdings/${id}`);
}

export async function addLot(token: string, payload: AddLotPayload) {
  const { id, ...body } = payload;
  return postWithFallback<any>(token, `/api/crypto/holdings/${id}/lots`, `/crypto/holdings/${id}/lots`, body);
}

export async function updateLot(token: string, payload: UpdateLotPayload) {
  const { id, lotId, ...body } = payload;
  return putWithFallback<any>(token, `/api/crypto/holdings/${id}/lots/${lotId}`, `/crypto/holdings/${id}/lots/${lotId}`, body);
}

export async function deleteLot(token: string, payload: DeleteLotPayload) {
  const { id, lotId } = payload;
  return deleteWithFallback<any>(token, `/api/crypto/holdings/${id}/lots/${lotId}`, `/crypto/holdings/${id}/lots/${lotId}`);
}

/* ----------------------------- SSE ----------------------------- */
/**
 * Live price stream.
 * NOTE: Native EventSource can't send headers. Two options:
 *  1) Use `event-source-polyfill` to pass Authorization header (recommended).
 *  2) (Alt) Add backend support for `?token=...` and read token server-side.
 */
export function openCryptoPriceStream(token: string, qs?: { accountId?: string }) {
  const params = new URLSearchParams();
  if (qs?.accountId) params.set("accountId", qs.accountId);

  // Try EventSourcePolyfill if available to send the Bearer token header
  const AnyES: any = (window as any).EventSourcePolyfill || (window as any).EventSource;
  const url = `/api/crypto/stream?${params.toString()}`;

  try {
    if ((window as any).EventSourcePolyfill) {
      const es = new (window as any).EventSourcePolyfill(url, {
        headers: { Authorization: `Bearer ${token}` },
        heartbeatTimeout: 60_000,
        withCredentials: true,
      });
      return es as EventSource;
    }
  } catch {}

  // Fallback: native EventSource (works if backend auth via cookie or query token)
  // If you implement query-token auth, do: params.set("auth", token)
  return new AnyES(url);
}

/** Convenience: attach listeners with proper typing + an easy close */
export function attachCryptoStreamHandlers(
  es: EventSource,
  onPrices: (data: CryptoPricesEvent) => void,
  onError?: (err: any) => void
) {
  const pricesHandler = (evt: MessageEvent) => {
    try {
      const data = JSON.parse(evt.data) as CryptoPricesEvent;
      onPrices(data);
    } catch (e) {
      onError?.(e);
    }
  };
  const errorHandler = (e: any) => onError?.(e);

  es.addEventListener("prices", pricesHandler as any);
  es.addEventListener("error", errorHandler as any);

  return () => {
    es.removeEventListener("prices", pricesHandler as any);
    es.removeEventListener("error", errorHandler as any);
    try { es.close(); } catch {}
  };
}





export type PnlPoint = { t: number; invested: number; value: number; qty: number; price: number; pnl: number; pnlPct: number };
export type PnlSeriesResponse = { cgId: string; holdingId: string; series: PnlPoint[] };




export async function fetchPnlSeries(holdingId: string, days: number | "max"): Promise<PnlSeriesResponse | null> {
  const url = new URL("/api/crypto/pnl-series", window.location.origin);
  url.searchParams.set("holdingId", holdingId);
  url.searchParams.set("days", String(days));
  const res = await fetch(url.toString(), { headers: authHeader() });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

// frontend/src/api/crypto.ts
export type PricePoint = { t: number; price: number };
export type PriceSeriesResponse = { series: PricePoint[] };

// build Authorization header however your app does it
function authHeader() {
  const token = localStorage.getItem("token") || "";
  return { Authorization: `Bearer ${token}` };
}

export async function fetchPriceSeries(cgId: string, days: number | "max"): Promise<PriceSeriesResponse> {
  const url = new URL("/api/crypto/price-series", window.location.origin);
  url.searchParams.set("cgId", cgId);
  url.searchParams.set("days", String(days));
  const res = await fetch(url.toString(), { headers: authHeader() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
