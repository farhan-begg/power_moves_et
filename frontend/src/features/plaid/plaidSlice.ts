import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

type NetWorth = {
  summary: { assets: number; debts: number; netWorth: number };
  breakdownByType: Record<string, number>;
  currencyHint: string;
};
type Card = {
  accountId: string;
  name: string;
  mask: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
  lastPaymentDate?: string | null;
  nextPaymentDueDate?: string | null;
};
type Holding = {
  accountId: string;
  securityId: string;
  quantity: number;
  name: string | null;
  ticker: string | null;
  value: number;
  isoCurrencyCode: string | null;
};

function authHeader() {
  const jwt = localStorage.getItem("token") ?? "";
  return { Authorization: `Bearer ${jwt}` };
}

export const fetchNetWorth = createAsyncThunk("plaid/netWorth", async () => {
  const res = await fetch("http://localhost:5000/api/plaid/net-worth", { headers: authHeader() });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as NetWorth;
});

export const fetchCards = createAsyncThunk("plaid/cards", async () => {
  const res = await fetch("http://localhost:5000/api/plaid/cards", { headers: authHeader() });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { source: "liabilities" | "accounts"; cards: Card[] };
});

export const fetchInvestments = createAsyncThunk("plaid/investments", async () => {
  const res = await fetch("http://localhost:5000/api/plaid/investments", { headers: authHeader() });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as { totalValue: number; holdings: Holding[] };
});

export const fetchAllPlaid = createAsyncThunk("plaid/fetchAll", async (_, { dispatch }) => {
  await Promise.all([
    dispatch(fetchNetWorth()),
    dispatch(fetchCards()),
    dispatch(fetchInvestments()),
  ]);
});

type State = {
  loading: boolean;
  error: string | null;
  netWorth: NetWorth | null;
  cards: Card[];
  holdings: Holding[];
  lastLoadedAt: string | null;
};
const initialState: State = {
  loading: false,
  error: null,
  netWorth: null,
  cards: [],
  holdings: [],
  lastLoadedAt: null,
};

const plaidSlice = createSlice({
  name: "plaid",
  initialState,
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchAllPlaid.pending, (s) => { s.loading = true; s.error = null; });
    b.addCase(fetchAllPlaid.fulfilled, (s) => { s.loading = false; s.lastLoadedAt = new Date().toISOString(); });
    b.addCase(fetchAllPlaid.rejected, (s, a) => { s.loading = false; s.error = a.error.message || "Failed to load"; });

    b.addCase(fetchNetWorth.fulfilled, (s, a) => { s.netWorth = a.payload; });
    b.addCase(fetchCards.fulfilled, (s, a) => { s.cards = a.payload.cards || []; });
    b.addCase(fetchInvestments.fulfilled, (s, a) => { s.holdings = a.payload.holdings || []; });
  },
});

export default plaidSlice.reducer;
