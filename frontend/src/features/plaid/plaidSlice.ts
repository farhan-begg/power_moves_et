// src/features/plaid/plaidSlice.ts
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const API = "http://localhost:5000/api/plaid";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
});

export const fetchAccounts = createAsyncThunk("plaid/accounts", async () => {
  const res = await fetch(`${API}/accounts`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to fetch accounts");
  // backend returns { accounts }
  return json.accounts ?? json; // ← handles old shape too
});

export const fetchCards = createAsyncThunk("plaid/cards", async () => {
  const res = await fetch(`${API}/cards`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to fetch cards");
  // backend returns { source, cards }
  return json.cards ?? json;
});

export const fetchInvestments = createAsyncThunk("plaid/investments", async () => {
  const res = await fetch(`${API}/investments`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(
    (json.details && JSON.stringify(json.details)) || json.error || "Failed to fetch investments"
  );
  // backend returns { totalValue, holdings, securities }
  return { totalValue: json.totalValue ?? 0, holdings: json.holdings ?? [] };
});

export const fetchNetWorth = createAsyncThunk("plaid/netWorth", async () => {
  const res = await fetch(`${API}/net-worth`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to fetch net worth");
  // backend returns { summary, breakdownByType, currencyHint }
  return json; // keep full object
});

const slice = createSlice({
  name: "plaid",
  initialState: {
    accounts: [] as any[],
    cards: [] as any[],
    holdings: [] as any[],
    totalValue: 0,
    netWorth: null as null | { summary: { assets: number; debts: number; netWorth: number }; breakdownByType: Record<string, number>; currencyHint?: string },
    loading: false,
    error: null as null | string,
  },
  reducers: {},
  extraReducers: (b) => {
    const start = (s: any) => { s.loading = true; s.error = null; };
    const fail = (s: any, a: any) => { s.loading = false; s.error = a.error?.message || String(a.payload || a.error); };

    b.addCase(fetchAccounts.pending, start);
    b.addCase(fetchAccounts.fulfilled, (s, a) => { s.loading = false; s.accounts = a.payload; });
    b.addCase(fetchAccounts.rejected, fail);

    b.addCase(fetchCards.pending, start);
    b.addCase(fetchCards.fulfilled, (s, a) => { s.loading = false; s.cards = a.payload; });
    b.addCase(fetchCards.rejected, fail);

    b.addCase(fetchInvestments.pending, start);
    b.addCase(fetchInvestments.fulfilled, (s, a) => {
      s.loading = false; s.holdings = a.payload.holdings; s.totalValue = a.payload.totalValue;
    });
    b.addCase(fetchInvestments.rejected, fail);

    b.addCase(fetchNetWorth.pending, start);
    b.addCase(fetchNetWorth.fulfilled, (s, a) => { s.loading = false; s.netWorth = a.payload; });
    b.addCase(fetchNetWorth.rejected, fail);
  }
});

export default slice.reducer;
