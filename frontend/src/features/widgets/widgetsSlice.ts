// src/features/widgets/widgetsSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type WidgetType =
  | "plaid-connect"
  | "stat-today"
  | "stat-month"
  | "stat-year"
  | "income-expense-chart"
  | "bank-flow"
  | "transactions-list"
  | "net-worth"
  | "accounts"
  | "cards"
  | "investments"
  | "stocks-portfolio"
  | "advice";                      // 👈 added

export type WidgetSize = "sm" | "lg";

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
}

interface WidgetsState {
  order: string[];
  byId: Record<string, Widget>;
}

const genId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const DEFAULT_WIDGETS: Record<string, Widget> = {
  w1:  { id: "w1",  type: "plaid-connect",        title: "Connect your bank",   size: "sm" },
  w2:  { id: "w2",  type: "stat-today",           title: "Today",               size: "sm" },
  w3:  { id: "w3",  type: "stat-month",           title: "This Month",          size: "sm" },
  w4:  { id: "w4",  type: "stat-year",            title: "Year to Date",        size: "sm" },
  w5:  { id: "w5",  type: "income-expense-chart", title: "Income vs Expense",   size: "lg" }, // wide by default
  w6:  { id: "w6",  type: "bank-flow",            title: "Bank Flow",           size: "sm" },
  w7:  { id: "w7",  type: "transactions-list",    title: "Recent Spending",     size: "sm" },
  w8:  { id: "w8",  type: "net-worth",            title: "Net Worth",           size: "sm" },
  w9:  { id: "w9",  type: "accounts",             title: "Accounts",            size: "lg" }, // wide by default
  w10: { id: "w10", type: "cards",                title: "Credit Cards",        size: "sm" },
  w11: { id: "w11", type: "investments",          title: "Investments",         size: "sm" },
  w12: { id: "w12", type: "stocks-portfolio",     title: "Stocks & ETFs",       size: "sm" },
  w13: { id: "w13", type: "advice",               title: "AI Money Coach",      size: "lg" }, // 👈 new default
};

export const DEFAULT_ORDER = [
  "w2", "w3", "w8",
  "w5", "w7",
  "w9", "w12",
  "w10", "w11",
  "w13",                              // 👈 place Advice at the end (or wherever you like)
];

const initialState: WidgetsState = {
  byId: { ...DEFAULT_WIDGETS },
  order: [...DEFAULT_ORDER],
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
    addWidget: (
      state,
      action: PayloadAction<{ id?: string; type: WidgetType; title?: string; size?: WidgetSize }>
    ) => {
      const id = action.payload.id ?? genId();
      const title = action.payload.title ?? action.payload.type;
      const size: WidgetSize = action.payload.size ?? "sm";
      state.byId[id] = { id, type: action.payload.type, title, size };
      state.order.push(id);
    },
    renameWidget: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const w = state.byId[action.payload.id];
      if (w) w.title = action.payload.title;
    },
    setWidgetSize: (state, action: PayloadAction<{ id: string; size: WidgetSize }>) => {
      const w = state.byId[action.payload.id];
      if (w) w.size = action.payload.size;
    },
    toggleWidgetSize: (state, action: PayloadAction<string>) => {
      const w = state.byId[action.payload];
      if (w) w.size = w.size === "lg" ? "sm" : "lg";
    },
    ensureDefaults: (state) => {
      for (const id of DEFAULT_ORDER) {
        if (!state.byId[id]) state.byId[id] = { ...DEFAULT_WIDGETS[id] };
        if (!state.order.includes(id)) state.order.push(id);
      }
    },
  },
});

export const {
  reorder,
  removeWidget,
  addWidget,
  renameWidget,
  setWidgetSize,
  toggleWidgetSize,
  ensureDefaults,
} = widgetsSlice.actions;

export default widgetsSlice.reducer;
