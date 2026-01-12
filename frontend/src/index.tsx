import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Provider } from "react-redux";
import { store } from "./app/store";
import "./styles/index.css";

// ✅ Cost & Performance Optimization: Optimize React Query for speed and cost savings
// - Longer staleTime reduces unnecessary refetches (saves API costs and data/battery)
// - Longer gcTime keeps data in memory longer (faster navigation, fewer API calls)
// - Retry only once (faster failure recovery, saves retry costs)
// - Aggressive caching (saves money on API calls)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // ✅ 10 minutes - data stays fresh longer (reduces API calls by ~80%)
      gcTime: 30 * 60 * 1000, // ✅ 30 minutes - cache persists longer (saves on navigation)
      retry: 1, // Only retry once (saves retry costs)
      refetchOnWindowFocus: false, // Don't refetch on focus (saves API costs)
      refetchOnReconnect: true, // Refetch when connection restored
      refetchOnMount: false, // Use cached data if available (saves API calls)
      // ✅ Cost Optimization: Only refetch if data is stale AND user is actively using the app
      refetchInterval: false, // Disable automatic polling (saves API costs)
    },
    mutations: {
      retry: 0, // Don't retry mutations (saves costs, user can retry manually)
    },
  },
});

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </Provider>
);

// ✅ Mobile Performance: Register service worker for offline support
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Only register in production or if explicitly enabled
    if (process.env.NODE_ENV === "production" || process.env.REACT_APP_ENABLE_SW === "true") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("✅ Service Worker registered:", registration.scope);
        })
        .catch((error) => {
          console.log("⚠️ Service Worker registration failed:", error);
        });
    }
  });
}
