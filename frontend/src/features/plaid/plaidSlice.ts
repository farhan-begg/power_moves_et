// src/features/plaid/plaidSlice.ts
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

const API = "http://localhost:5000/api/plaid";
const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
});

type NetWorthResponse = {
  summary: { assets: number; debts: number; netWorth: number };
  manual?: { cash: number; assets: number };
  breakdownByType: Record<string, number>;
  currencyHint?: string;
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
    // backend returns { totalValue, holdings, securities }
    return { totalValue: json.totalValue ?? 0, holdings: json.holdings ?? [] };
  }
);

/**
 * Net worth with optional per-account filtering.
 * Call like: dispatch(fetchNetWorth()) or dispatch(fetchNetWorth({ accountId }))
 */
export const fetchNetWorth = createAsyncThunk(
  "plaid/netWorth",
  async ({ accountId }: { accountId?: string } = {}) => {
    const token = localStorage.getItem("token") ?? "";
    const url = new URL("http://localhost:5000/api/plaid/net-worth");

    // ✅ Only set when it's a specific account, not "all"/"__all__"/empty/undefined/null
    if (accountId && !["all", "__all__", "undefined", "null", ""].includes(String(accountId))) {
      url.searchParams.set("accountId", accountId);
    }

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed to fetch net worth");
    return json;
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
      // ❌ don't wipe state.netWorth here; keep previous data to avoid flicker
    })
    b.addCase(fetchNetWorth.fulfilled, (state, action) => {
      state.loading = false;
      state.netWorth = action.payload;
    })
      b.addCase(fetchNetWorth.rejected, (state, action) => {
      state.loading = false;
      state.error = action.error.message || "Failed to fetch net worth";
      // keep last good state.netWorth
    });
  },
});

export default slice.reducer;
