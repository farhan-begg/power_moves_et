// src/features/theme/themeSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ThemeMode = "glass" | "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
}

const STORAGE_KEY = "pm_theme";

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "glass";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "glass" || stored === "light" || stored === "dark") {
    return stored;
  }
  return "glass";
};

const initialState: ThemeState = {
  mode: getInitialTheme(),
};

const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.mode = action.payload;
      localStorage.setItem(STORAGE_KEY, action.payload);
    },
    cycleTheme: (state) => {
      const order: ThemeMode[] = ["glass", "light", "dark"];
      const currentIndex = order.indexOf(state.mode);
      const nextIndex = (currentIndex + 1) % order.length;
      state.mode = order[nextIndex];
      localStorage.setItem(STORAGE_KEY, state.mode);
    },
  },
});

export const { setTheme, cycleTheme } = themeSlice.actions;
export default themeSlice.reducer;
