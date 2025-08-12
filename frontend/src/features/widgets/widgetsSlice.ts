import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type WidgetType =
  | "plaid-connect"
  | "stat-today"
  | "stat-month"
  | "stat-year"
  | "income-expense-chart"
  | "bank-flow"
  | "transactions-list";

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
}

interface WidgetsState {
  order: string[];
  byId: Record<string, Widget>;
}

const genId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const initialState: WidgetsState = {
  byId: {
    w1: { id: "w1", type: "plaid-connect", title: "Connect your bank" },
    w2: { id: "w2", type: "stat-today", title: "Today" },
    w3: { id: "w3", type: "stat-month", title: "This Month" },
    w4: { id: "w4", type: "stat-year", title: "Year to Date" },
    w5: { id: "w5", type: "income-expense-chart", title: "Income vs Expense" },
    w6: { id: "w6", type: "bank-flow", title: "Bank Flow" },
       "w7": { id: "w7", type: "transactions-list",   title: "Recent Spending" }, // 
  },
  order: ["w1", "w2", "w3", "w4", "w5", "w6", "w7"],
};

const widgetsSlice = createSlice({
  name: "widgets",
  initialState,
  reducers: {
    reorder: (state, action: PayloadAction<{ activeId: string; overId: string }>) => {
      const { activeId, overId } = action.payload;
      const from = state.order.indexOf(activeId);
      const to = state.order.indexOf(overId);
      if (from === -1 || to === -1) return;
      const [moved] = state.order.splice(from, 1);
      state.order.splice(to, 0, moved);
    },
    removeWidget: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      state.order = state.order.filter((w) => w !== id);
      delete state.byId[id];
    },
    addWidget: (state, action: PayloadAction<{ type: WidgetType; title?: string }>) => {
      const id = genId();
      const title = action.payload.title ?? action.payload.type;
      state.byId[id] = { id, type: action.payload.type, title };
      state.order.push(id);
    },
    renameWidget: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const w = state.byId[action.payload.id];
      if (w) w.title = action.payload.title;
    },
  },
});

export const { reorder, removeWidget, addWidget, renameWidget } = widgetsSlice.actions;
export default widgetsSlice.reducer;
