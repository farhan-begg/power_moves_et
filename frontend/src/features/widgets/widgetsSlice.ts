// src/features/widgets/widgetsSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { fetchWidgetPreferences, saveWidgetPreferences, type WidgetPreferences } from "../../api/widgetPreferences";

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
  | "advice"
  | "goals"
  | "category-pie"
  | "upcoming-bills"
  | "crypto-portfolio"
  | "net-worth-projection"
  | "financial-health"
  | "action-items";

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

// Async thunks for loading and saving preferences
export const loadWidgetPreferences = createAsyncThunk(
  "widgets/loadPreferences",
  async (_, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        return rejectWithValue("No token");
      }
      const preferences = await fetchWidgetPreferences();
      return preferences;
    } catch (error: any) {
      // If 404 or no preferences, return null to use defaults
      if (error?.response?.status === 404) {
        return null;
      }
      return rejectWithValue(error?.response?.data?.error || "Failed to load preferences");
    }
  }
);

export const persistWidgetPreferences = createAsyncThunk(
  "widgets/persistPreferences",
  async (preferences: WidgetPreferences, { rejectWithValue }) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        return rejectWithValue("No token");
      }
      const saved = await saveWidgetPreferences(preferences);
      return saved;
    } catch (error: any) {
      return rejectWithValue(error?.response?.data?.error || "Failed to save preferences");
    }
  }
);

export const DEFAULT_WIDGETS: Record<string, Widget> = {
  w1:  { id: "w1",  type: "plaid-connect",        title: "Connect your bank",   size: "sm" },
  w2:  { id: "w2",  type: "stat-today",           title: "Today",               size: "sm" },
  w3:  { id: "w3",  type: "stat-month",           title: "This Month",          size: "sm" },
  w4:  { id: "w4",  type: "stat-year",            title: "Year to Date",        size: "sm" },
  w5:  { id: "w5",  type: "income-expense-chart", title: "Income vs Expense",   size: "lg" },
  w6:  { id: "w6",  type: "bank-flow",            title: "Bank Flow",           size: "sm" },
  w7:  { id: "w7",  type: "transactions-list",    title: "Recent Spending",     size: "sm" },
  w8:  { id: "w8",  type: "net-worth",            title: "Net Worth",           size: "sm" },
  w9:  { id: "w9",  type: "accounts",             title: "Accounts",            size: "lg" },
  // w10: { id: "w10", type: "cards",                title: "Credit Cards",        size: "sm" }, // TODO: Fix widget
  // w11: { id: "w11", type: "investments",          title: "Investments",         size: "sm" }, // TODO: Fix widget
  // w12: { id: "w12", type: "stocks-portfolio",     title: "Stocks & ETFs",       size: "sm" }, // TODO: Fix widget
  // w13: { id: "w13", type: "advice",               title: "AI Money Coach",      size: "lg" }, // TODO: Fix widget
  w14: { id: "w14", type: "goals",                title: "Goals",               size: "sm" },
  w15: { id: "w15", type: "category-pie",         title: "Category Summary",    size: "sm" },
  w16: { id: "w16", type: "upcoming-bills",       title: "Upcoming Bills",      size: "sm" },
  // w17: { id: "w17", type: "crypto-portfolio",     title: "Crypto Portfolio",    size: "lg" }, // TODO: Fix widget
  w18: { id: "w18", type: "net-worth-projection", title: "Net Worth Projection", size: "lg" },
  w19: { id: "w19", type: "financial-health",     title: "Financial Health",     size: "lg" },
  w20: { id: "w20", type: "action-items",         title: "Action Items",         size: "sm" },
};

export const DEFAULT_ORDER = [
  // Top: AI Assistant widgets (what to do)
  "w19", // Financial Health Score - Overall status
  "w20", // Action Items - What to do next
  
  // Key Metrics: Net Worth (where you are)
  "w8",  // Net Worth - Current financial position
  
  // Daily/Recent Stats (quick overview)
  "w2",  // Today
  "w3",  // This Month
  "w4",  // Year to Date
  
  // Analysis & Planning (understanding & planning)
  "w5",  // Income vs Expense Chart - Spending patterns
  "w18", // Net Worth Projection - Future planning
  
  // Goals & Tracking (actionable)
  "w14", // Goals - Track progress
  "w16", // Upcoming Bills - What's due
  
  // Details (drill down)
  "w7",  // Recent Spending - Transaction list
  "w15", // Category Summary - Where money goes
  "w6",  // Bank Flow - Account breakdown
  "w9",  // Accounts - All accounts view
  
  // Connection (setup)
  "w1",  // Connect your bank - Setup
  
  // Disabled widgets
  // "w12", // Stocks & ETFs - TODO: Fix widget
  // "w10","w11", // Credit Cards, Investments - TODO: Fix widgets
  // "w17", // Crypto Portfolio - TODO: Fix widget
  // "w13", // AI Money Coach - TODO: Fix widget
];


interface WidgetsState {
  order: string[];
  byId: Record<string, Widget>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

const initialState: WidgetsState = {
  byId: { ...DEFAULT_WIDGETS },
  order: [...DEFAULT_ORDER],
  isLoading: false,
  isSaving: false,
  error: null,
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
      // Ensure all default widgets exist
      for (const id of DEFAULT_ORDER) {
        if (!state.byId[id] && DEFAULT_WIDGETS[id]) {
          state.byId[id] = { ...DEFAULT_WIDGETS[id] };
        }
      }
      // Ensure order contains all default widgets
      const missingIds = DEFAULT_ORDER.filter(id => !state.order.includes(id));
      if (missingIds.length > 0) {
        state.order = [...state.order, ...missingIds];
      }
      // If order is empty, use defaults
      if (state.order.length === 0) {
        state.order = [...DEFAULT_ORDER];
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Load preferences
      .addCase(loadWidgetPreferences.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadWidgetPreferences.fulfilled, (state, action) => {
        state.isLoading = false;
        if (action.payload && action.payload.order && action.payload.order.length > 0 && action.payload.widgets && Object.keys(action.payload.widgets).length > 0) {
          // Only update if we got valid preferences from backend
          // Validate and cast widgets from backend
          const widgets: Record<string, Widget> = {};
          if (action.payload.widgets) {
            for (const [id, widget] of Object.entries(action.payload.widgets)) {
              // Validate widget type is a valid WidgetType
              const validTypes: WidgetType[] = [
                "plaid-connect", "stat-today", "stat-month", "stat-year",
                "income-expense-chart", "bank-flow", "transactions-list",
                "net-worth", "accounts", "cards", "investments",
                "stocks-portfolio", "advice", "goals", "category-pie",
                "upcoming-bills", "crypto-portfolio", "net-worth-projection"
              ];
              
              if (validTypes.includes(widget.type as WidgetType)) {
                widgets[id] = {
                  id: widget.id,
                  type: widget.type as WidgetType,
                  title: widget.title,
                  size: widget.size === "sm" || widget.size === "lg" ? widget.size : "sm",
                };
              }
            }
          }
          
          // Merge with defaults to ensure all default widgets exist
          state.byId = { ...DEFAULT_WIDGETS, ...widgets };
          
          // Ensure order only contains valid widget IDs, fallback to defaults if empty
          const validOrder = action.payload.order.filter((id: string) => state.byId[id]);
          state.order = validOrder.length > 0 ? validOrder : [...DEFAULT_ORDER];
        } else {
          // No preferences found or empty, use defaults
          state.order = [...DEFAULT_ORDER];
          state.byId = { ...DEFAULT_WIDGETS };
        }
      })
      .addCase(loadWidgetPreferences.rejected, (state, action) => {
        state.isLoading = false;
        // If error is "No token", use defaults (user not logged in)
        if (action.payload === "No token") {
          state.order = [...DEFAULT_ORDER];
          state.byId = { ...DEFAULT_WIDGETS };
        } else {
          state.error = action.payload as string;
        }
      })
      // Save preferences
      .addCase(persistWidgetPreferences.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(persistWidgetPreferences.fulfilled, (state) => {
        state.isSaving = false;
      })
      .addCase(persistWidgetPreferences.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload as string;
      });
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
