// src/features/plaid/plaidSlice.ts
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";
const API = `${API_BASE}/plaid`;

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
});

/** ✅ Match backend net-worth response */
type NetWorthResponse = {
  itemId: string; // "__all__" or actual Plaid itemId
  source: "cache" | "plaid" | "cache-stale" | "multi";
  fetchedAt: string | null;
  currencyHint?: string;
  summary: { assets: number; debts: number; netWorth: number };
  warning?: string;
};

type InvestmentsResponse = {
  totalValue: number;
  holdings: any[];
};

type PlaidState = {
  accounts: any[];
  cards: any[];
  holdings: any[];
  totalValue: number;
  netWorth: NetWorthResponse | null;
  loading: boolean;
  error: string | null;
};

export const fetchAccounts = createAsyncThunk("plaid/accounts", async () => {
  const res = await fetch(`${API}/accounts`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to fetch accounts");
  return json.accounts ?? json;
});

export const fetchCards = createAsyncThunk("plaid/cards", async () => {
  const res = await fetch(`${API}/cards`, { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to fetch cards");
  return json.cards ?? json;
});

export const fetchInvestments = createAsyncThunk<InvestmentsResponse>(
  "plaid/investments",
  async () => {
    const res = await fetch(`${API}/investments`, { headers: authHeaders() });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(
        (json.details && JSON.stringify(json.details)) ||
          json.error ||
          "Failed to fetch investments"
      );
    }
    return { totalValue: json.totalValue ?? 0, holdings: json.holdings ?? [] };
  }
);

/**
 * ✅ UPDATED:
 * - itemId="__all__" => aggregate across all banks
 * - accountId only valid when itemId is a real bank itemId (NOT "__all__")
 */
export const fetchNetWorth = createAsyncThunk(
  "plaid/netWorth",
  async (
    opts: { itemId?: string; accountId?: string; force?: boolean } = {}
  ) => {
    const token = localStorage.getItem("token") ?? "";
    const url = new URL(`${API}/net-worth`);

    if (opts.itemId) url.searchParams.set("itemId", opts.itemId);
    if (opts.force) url.searchParams.set("force", "true");

    // only allow accountId when NOT aggregating all banks
    if (opts.accountId && opts.itemId && opts.itemId !== "__all__") {
      url.searchParams.set("accountId", opts.accountId);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to fetch net worth");
    return json as NetWorthResponse;
  }
);

const initialState: PlaidState = {
  accounts: [],
  cards: [],
  holdings: [],
  totalValue: 0,
  netWorth: null,
  loading: false,
  error: null,
};

const slice = createSlice({
  name: "plaid",
  initialState,
  reducers: {},
  extraReducers: (b) => {
    const start = (s: PlaidState) => {
      s.loading = true;
      s.error = null;
    };
    const fail = (s: PlaidState, a: any) => {
      s.loading = false;
      s.error = a.error?.message || String(a.payload || a.error);
    };

    b.addCase(fetchAccounts.pending, start);
    b.addCase(fetchAccounts.fulfilled, (s, a) => {
      s.loading = false;
      s.accounts = a.payload as any[];
    });
    b.addCase(fetchAccounts.rejected, fail);

    b.addCase(fetchCards.pending, start);
    b.addCase(fetchCards.fulfilled, (s, a) => {
      s.loading = false;
      s.cards = a.payload as any[];
    });
    b.addCase(fetchCards.rejected, fail);

    b.addCase(fetchInvestments.pending, start);
    b.addCase(fetchInvestments.fulfilled, (s, a) => {
      s.loading = false;
      s.holdings = a.payload.holdings;
      s.totalValue = a.payload.totalValue;
    });
    b.addCase(fetchInvestments.rejected, fail);

    b.addCase(fetchNetWorth.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    b.addCase(fetchNetWorth.fulfilled, (state, action) => {
      state.loading = false;
      state.netWorth = action.payload;
    });
    b.addCase(fetchNetWorth.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || "Failed to fetch net worth";
    });
  },
});

export default slice.reducer;
