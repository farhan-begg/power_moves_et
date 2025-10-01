import { http, auth } from "./http";

export type SearchItem = {
  symbol: string;
  name: string;
  currency?: string;
  exchangeShortName?: string;
  type?: string;
};

export type PositionResp = {
  _id: string;
  symbol: string;
  name?: string;
  currency?: string;
  purchaseDate: string;
  amountInvested: number;
  shares: number;
  purchasePrice: number;
  currentPrice?: number;
  currentValue?: number;
  gain?: number;
  gainPct?: number;
};

export async function searchSymbols(token: string, q: string) {
  const { data } = await http.get(`/stocks/search?q=${encodeURIComponent(q)}`, auth(token));
  return data as SearchItem[];
}

export async function createPosition(token: string, body: {
  symbol: string; amountInvested: number; purchaseDate: string;
}) {
  const { data } = await http.post("/stocks/positions", body, auth(token));
  return data as PositionResp;
}

export async function listPositions(token: string) {
  const { data } = await http.get("/stocks/positions", auth(token));
  return data as { positions: PositionResp[]; totals: { invested: number; current: number; gain: number; gainPct: number; } };
}

export async function updatePosition(token: string, id: string, body: Partial<{ symbol: string; amountInvested: number; purchaseDate: string; }>) {
  const { data } = await http.put(`/stocks/positions/${id}`, body, auth(token));
  return data as PositionResp;
}

export async function deletePosition(token: string, id: string) {
  const { data } = await http.delete(`/stocks/positions/${id}`, auth(token));
  return data as { message: string; id: string };
}


export async function liveQuotes(token: string) {
  const { data } = await http.get("/stocks/quotes", auth(token));
  return data as { quotes: { symbol: string; price: number; t: string }[] };
}


export type HistoryResp = {
  series: Record<string, { t: string; close: number }[]>;
};

export async function fetchHistory(
  token: string,
  params: { symbols?: string[]; from?: string; to?: string }
) {
  const qs = new URLSearchParams();
  if (params.symbols?.length) qs.set("symbols", params.symbols.join(","));
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  const { data } = await http.get<HistoryResp>(`/stocks/history?${qs.toString()}`, auth(token));
  return data;
}
