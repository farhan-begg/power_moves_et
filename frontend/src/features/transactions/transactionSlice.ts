import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface TransactionFilters {
  type?: "income" | "expense";
  category?: string;
  page: number;
  limit: number;
  source?: "manual" | "plaid";
}

interface TransactionState {
  filters: TransactionFilters;
}

const initialState: TransactionState = {
  filters: {
    page: 1,
    limit: 10,
  },
};

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
});

export const { setFilters, resetFilters } = transactionSlice.actions;
export default transactionSlice.reducer;
