// src/features/transactions/transactionSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { fetchTransactions } from "../../api/transaction";
import { RootState } from "../../app/store";

export interface Transaction {
  _id: string;
  type: "income" | "expense";
  category: string;
  amount: number;
  date: string;
  description?: string;
  source: "manual" | "plaid";
}

export interface TransactionFilters {
  type?: "income" | "expense";
  category?: string;
  page: number;
  limit: number;
  source?: "manual" | "plaid";
}

interface PagedTransactionsResponse {
  total: number;
  page: number;
  pages: number;
  transactions: Transaction[];
  sourceBreakdown?: Record<string, number>;
}

interface TransactionState {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  filters: TransactionFilters;
  total: number;
  pages: number;
}

const initialState: TransactionState = {
  transactions: [],
  loading: false,
  error: null,
  filters: { page: 1, limit: 10 },
  total: 0,
  pages: 0,
};

export const loadTransactions = createAsyncThunk<
  PagedTransactionsResponse,
  { token: string },
  { state: RootState; rejectValue: string }
>("transactions/load", async ({ token }, thunkAPI) => {
  try {
    const { filters } = (thunkAPI.getState() as RootState).transactions;

    const data = await fetchTransactions(token, {
      page: filters.page,
      limit: filters.limit,
      type: filters.type,
      category: filters.category,
      source: filters.source,
      // add startDate/endDate/sort if you later include them in filters
    });

    return data;
  } catch (err: any) {
    return thunkAPI.rejectWithValue(
      err?.response?.data?.error || "Failed to fetch transactions"
    );
  }
});

const transactionSlice = createSlice({
  name: "transactions",
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<TransactionFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters: (state) => {
      state.filters = { page: 1, limit: 10 };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = action.payload.transactions;
        state.total = action.payload.total;
        state.pages = action.payload.pages;
      })
      .addCase(loadTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) ?? "Failed to fetch transactions";
      });
  },
});

export const { setFilters, resetFilters } = transactionSlice.actions;
export default transactionSlice.reducer;
