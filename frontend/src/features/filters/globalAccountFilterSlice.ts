// src/features/filters/globalAccountFilterSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export const ALL_ACCOUNTS_ID = "__all_accounts__";
export const ALL_BANKS_ID = "__all__";

type State = {
  selectedItemId: string;
  selectedItemLabel: string;
  selectedAccountId: string;
  selectedAccountLabel: string;
};

const initialState: State = {
  selectedItemId: ALL_BANKS_ID,
  selectedItemLabel: "All banks",
  selectedAccountId: ALL_ACCOUNTS_ID,
  selectedAccountLabel: "All accounts",
};

const slice = createSlice({
  name: "accountFilter",
  initialState,
  reducers: {
    setSelectedBank(state, action: PayloadAction<{ id: string; label: string }>) {
      state.selectedItemId = action.payload.id;
      state.selectedItemLabel = action.payload.label;
      state.selectedAccountId = ALL_ACCOUNTS_ID;
      state.selectedAccountLabel = "All accounts";
    },

    setSelectedAccount(state, action: PayloadAction<{ id: string; label: string }>) {
      state.selectedAccountId = action.payload.id;
      state.selectedAccountLabel = action.payload.label;
    },

    // ✅ ADD THIS for backward-compat
    setSelectedAccountId(state, action: PayloadAction<string>) {
      const id = action.payload || ALL_ACCOUNTS_ID;
      state.selectedAccountId = id;
      state.selectedAccountLabel = id === ALL_ACCOUNTS_ID ? "All accounts" : "Selected account";
    },

    resetAccountFilter(state) {
      state.selectedItemId = ALL_BANKS_ID;
      state.selectedItemLabel = "All banks";
      state.selectedAccountId = ALL_ACCOUNTS_ID;
      state.selectedAccountLabel = "All accounts";
    },
  },
});

export const {
  setSelectedBank,
  setSelectedAccount,
  setSelectedAccountId, // ✅ export it
  resetAccountFilter,
} = slice.actions;

export default slice.reducer;
