// src/pages/Dashboard.tsx
import React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  MeasuringStrategy,
  DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import SortableWidget from "../components/widgets/SortableWidget";
import { widgetRenderer } from "../components/widgets/registry";
import { useAppDispatch, useAppSelector } from "../hooks/hooks";
import {
  reorder,
  removeWidget,
  ensureDefaults,
} from "../features/widgets/widgetsSlice";
import GlobalAccountFilter from "../components/filters/GlobalAccountFilter";

import { useQueryClient } from "@tanstack/react-query";
import { syncPlaidTransactions } from "../api/plaid";
import LogoLoader from "../components/common/LogoLoader";

// Heroicons
import {
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

const INITIAL_SYNC_KEY = "pm_initial_sync_done";

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const order = useAppSelector((s) => s.widgets.order);
  const byId = useAppSelector((s) => s.widgets.byId);

  const token = useAppSelector((s) => s.auth.token);
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = React.useState<string | null>(null);

  // overlay shown ONLY during first-time initial sync after login
  const [showInitialLoader, setShowInitialLoader] = React.useState<boolean>(() => {
    const done = typeof window !== "undefined" && localStorage.getItem(INITIAL_SYNC_KEY) === "1";
    return !done; // show if not done yet
  });

  // keep a separate flag for the manual refresh button spinner (doesn't show overlay)
  const [isSyncing, setIsSyncing] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  React.useEffect(() => {
    dispatch(ensureDefaults());
  }, [dispatch]);

  // Helper: run the initial sync with overlay, then mark done
  const runInitialSync = React.useCallback(async () => {
    if (!token) return;
    setShowInitialLoader(true);
    try {
      await syncPlaidTransactions(token);
      // invalidate core queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["plaid", "net-worth"] }),
      ]);
    } catch (e) {
      console.error("❌ initial sync failed:", e);
      // Even on failure, don't trap user behind a loader; let widgets handle their own retries.
    } finally {
      localStorage.setItem(INITIAL_SYNC_KEY, "1");
      setShowInitialLoader(false);
    }
  }, [token, queryClient]);

  // 🔄 On first load after login: run the initial sync ONCE
  React.useEffect(() => {
    if (!token) return;
    const alreadyDone = localStorage.getItem(INITIAL_SYNC_KEY) === "1";
    if (!alreadyDone) {
      runInitialSync();
    }
  }, [token, runInitialSync]);

  // 🔔 If Plaid is just linked for the first time, treat it as initial sync (if not done yet)
  React.useEffect(() => {
    const onLinked = async () => {
      const alreadyDone = localStorage.getItem(INITIAL_SYNC_KEY) === "1";
      if (!alreadyDone) {
        await runInitialSync();
      } else {
        // if initial sync already done, do a light background refresh without overlay
        await handleManualRefresh();
      }
    };
    window.addEventListener("plaid:linked", onLinked);
    return () => window.removeEventListener("plaid:linked", onLinked);
  }, [runInitialSync]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (overId && overId !== activeId) {
      dispatch(reorder({ activeId, overId }));
    }
    setActiveId(null);
  };

  // Manual refresh (no full-screen overlay, just spins the icon)
  const handleManualRefresh = async () => {
    if (!token || isSyncing) return;
    try {
      setIsSyncing(true);
      await syncPlaidTransactions(token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["plaid", "net-worth"] }),
      ]);
    } catch (e) {
      console.error("❌ Manual sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem(INITIAL_SYNC_KEY); // reset so next login shows initial loader again
    window.location.reload();
  };

  // Grid span rules
  const spanFor = (w: { type: string; size: "sm" | "lg" }) => {
    const defaultSm = w.size === "lg" ? "sm:col-span-6" : "sm:col-span-3";
    const defaultXl = w.size === "lg" ? "xl:col-span-8" : "xl:col-span-4";

    const byTypeSm: Record<string, string | undefined> = {
      "income-expense-chart": "sm:col-span-6",
    };
    const byTypeXl: Record<string, string | undefined> = {
      "income-expense-chart": "xl:col-span-8",
    };

    return `${byTypeSm[w.type] ?? defaultSm} ${byTypeXl[w.type] ?? defaultXl}`;
  };

  const Overlay = () => {
    if (!activeId) return null;
    const w = byId[activeId];
    if (!w) return null;
    const Comp = widgetRenderer[w.type];
    if (!Comp) return null;
    return (
      <div className="min-w-[280px] max-w-[900px] w-[600px] rounded-2xl overflow-hidden backdrop-blur-xl bg-white/10 border border-white/15 shadow-2xl">
        <div className="px-3 py-2 border-b border-white/10 text-sm font-medium">
          {w.title}
        </div>
        <div className="p-3 pointer-events-none">
          <Comp />
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white">
      {/* 🔵 Full-screen loader ONLY for the very first sync after login */}
      {showInitialLoader && <LogoLoader  />}

      <h1 className="text-2xl font-semibold mb-4">Your Dashboard</h1>

      {/* Overview + Filter + Buttons */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl text-white font-semibold">Overview</h1>

        <div className="flex items-center gap-3">
          <GlobalAccountFilter />

          {/* Sync button (icon spins but no full overlay) */}
          <button
            onClick={handleManualRefresh}
            disabled={!token || isSyncing}
            className="p-2 rounded-md bg-white/10 border border-white/15 hover:bg-white/15 disabled:opacity-50 transition"
            title="Sync latest transactions"
          >
            <ArrowPathIcon
              className={`w-5 h-5 ${
                isSyncing ? "animate-spin text-blue-400" : "text-white"
              }`}
            />
          </button>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="p-2 rounded-md bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition"
            title="Logout"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      {/* Widgets */}
      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <SortableContext
          items={order.map(String)}
          strategy={rectSortingStrategy}
        >
          <div className="grid gap-3 sm:gap-4 xl:gap-5 grid-cols-1 sm:grid-cols-6 xl:grid-cols-12">
            {order.map((id) => {
              const w = byId[id];
              if (!w) return null;
              const Comp = widgetRenderer[w.type];
              if (!Comp) return null;

              return (
                <SortableWidget
                  key={id}
                  id={id}
                  title={w.title}
                  className={spanFor(w)}
                  onRemove={() => dispatch(removeWidget(id))}
                >
                  <Comp />
                </SortableWidget>
              );
            })}
          </div>
        </SortableContext>

        <DragOverlay
          adjustScale={false}
          dropAnimation={{ duration: 180, easing: "ease-out" }}
        >
          <Overlay />
        </DragOverlay>
      </DndContext>
    </div>
  );
}
