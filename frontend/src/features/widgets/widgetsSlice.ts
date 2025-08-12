import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type WidgetType = "plaid-connect" | "quick-stats";

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
}

interface WidgetsState {
  order: string[];
  byId: Record<string, Widget>;
}

const genId = () => (globalThis.crypto?.randomUUID?.() ?? `w_${Date.now()}_${Math.random().toString(36).slice(2,8)}`);

const initial: WidgetsState = {
  order: ["w1", "w2"],
  byId: {
    w1: { id: "w1", type: "plaid-connect", title: "Connect Bank" },
    w2: { id: "w2", type: "quick-stats",   title: "Quick Stats"  },
  },
};

const widgetsSlice = createSlice({
  name: "widgets",
  initialState: initial,
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
      const title = action.payload.title ?? (action.payload.type === "plaid-connect" ? "Connect Bank" : "Quick Stats");
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
