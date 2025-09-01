// src/features/accountFilter/accountFilterSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export const ALL_ACCOUNTS_ID = "__all__";

export type AccountFilterState = {
  /** Global single-select filter. "__all__" = all accounts */
  selectedAccountId: string;
  /** Optional friendly label for the selected account (derived or stored) */
  selectedAccountLabel: string;
};

const initialState: AccountFilterState = {
  selectedAccountId: ALL_ACCOUNTS_ID,
  selectedAccountLabel: "All accounts",
};

const accountFilterSlice = createSlice({
  name: "accountFilter",
  initialState,
  reducers: {
    /** New: set id + optional label together */
    setSelectedAccount(
      state,
      action: PayloadAction<{ id: string; label?: string }>
    ) {
      const id = action.payload.id || ALL_ACCOUNTS_ID;
      state.selectedAccountId = id;
      state.selectedAccountLabel =
        action.payload.label ??
        (id === ALL_ACCOUNTS_ID ? "All accounts" : "Selected account");
    },

    /** Back-compat: only set the id (label will be derived/defaulted) */
    setSelectedAccountId(state, action: PayloadAction<string>) {
      const id = action.payload || ALL_ACCOUNTS_ID;
      state.selectedAccountId = id;
      state.selectedAccountLabel =
        id === ALL_ACCOUNTS_ID ? "All accounts" : "Selected account";
    },

    clearAccountFilter(state) {
      state.selectedAccountId = ALL_ACCOUNTS_ID;
      state.selectedAccountLabel = "All accounts";
    },
  },
});

export const {
  setSelectedAccount,
  setSelectedAccountId,
  clearAccountFilter,
} = accountFilterSlice.actions;

export default accountFilterSlice.reducer;

// Optional selectors
export const selectSelectedAccountId = (s: { accountFilter: AccountFilterState }) =>
  s.accountFilter.selectedAccountId;
export const selectSelectedAccountLabel = (s: { accountFilter: AccountFilterState }) =>
  s.accountFilter.selectedAccountLabel;
