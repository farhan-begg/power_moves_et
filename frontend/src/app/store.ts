import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../features/auth/authSlice";
import transactionsReducer from "../features/transactions/transactionSlice";
import widgetsReducer from "../features/widgets/widgetsSlice";
import plaidReducer from "../features/plaid/plaidSlice";
import accountFilterReducer from "../features/filters/globalAccountFilterSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    transactions: transactionsReducer,
    widgets: widgetsReducer, 
    plaid: plaidReducer,
      accountFilter: accountFilterReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
