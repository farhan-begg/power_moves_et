import axios from "axios";

const FMP_KEY = process.env.FMP_API_KEY!;
if (!FMP_KEY) {
  console.warn("⚠️ FMP_API_KEY missing; set it in your .env");
}

const api = axios.create({
  baseURL: "https://financialmodelingprep.com/api/v3",
  timeout: 15000,
});

export async function fmpSearch(query: string, limit = 10) {
  const { data } = await api.get("/search", {
    params: { query, limit, exchange: "", apikey: FMP_KEY },
  });
  return data as Array<{
    symbol: string;
    name: string;
    currency: string;
    stockExchange: string;
    exchangeShortName: string;
    type: string; // "stock" | "etf" | ...
  }>;
}

export async function fmpQuote(symbols: string[]) {
  const joined = symbols.map((s) => s.trim().toUpperCase()).join(",");
  const { data } = await api.get(`/quote/${joined}`, {
    params: { apikey: FMP_KEY },
  });
  return data as Array<{
    symbol: string;
    price: number;
    name?: string;
    currency?: string;
  }>;
}

/** inclusive range; daily bars */
export async function fmpHistorical(symbol: string, from: string, to: string) {
  const { data } = await api.get(`/historical-price-full/${symbol}`, {
    params: { from, to, apikey: FMP_KEY, serietype: "line" },
  });
  // When serietype=line, result is { symbol, historical: [{date, close}, ...] }
  return (data?.historical ?? []) as Array<{ date: string; close: number }>;
}
