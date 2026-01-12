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
import { reorder, removeWidget, ensureDefaults } from "../features/widgets/widgetsSlice";

import GlobalAccountFilter from "../components/filters/GlobalAccountFilter";

import { useQueryClient } from "@tanstack/react-query";
import { syncPlaidTransactions } from "../api/plaid";

import LogoLoader from "../components/common/LogoLoader";
import ThemeToggle from "../components/common/ThemeToggle";

import { ArrowPathIcon, ArrowRightOnRectangleIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";

const INITIAL_SYNC_KEY = "pm_initial_sync_done";

export default function Dashboard() {
  const dispatch = useAppDispatch();

  const order = useAppSelector((s) => s.widgets.order);
  const byId = useAppSelector((s) => s.widgets.byId);

  // ✅ IMPORTANT: token may exist in localStorage first during signup/link flow
  const reduxToken = useAppSelector((s) => s.auth.token);
  const token = reduxToken || localStorage.getItem("token") || null;

  const queryClient = useQueryClient();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  // this loader is only for the first “sync transactions” run
  const [showInitialLoader, setShowInitialLoader] = React.useState<boolean>(() => {
    const done = typeof window !== "undefined" && localStorage.getItem(INITIAL_SYNC_KEY) === "1";
    return !done;
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // ✅ Ensure default widgets once
  React.useEffect(() => {
    dispatch(ensureDefaults());
  }, [dispatch]);

  const invalidateFinanceQueries = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["transactions", "list"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["plaid", "net-worth"] }),
    ]);
  }, [queryClient]);

  const runInitialSync = React.useCallback(async () => {
    if (!token) return;

    setShowInitialLoader(true);
    try {
      await syncPlaidTransactions(token);
      await invalidateFinanceQueries();
    } catch (e) {
      console.error("❌ initial sync failed:", e);
    } finally {
      localStorage.setItem(INITIAL_SYNC_KEY, "1");
      setShowInitialLoader(false);
    }
  }, [token, invalidateFinanceQueries]);

  const handleManualRefresh = React.useCallback(async () => {
    if (!token || isSyncing) return;

    try {
      setIsSyncing(true);
      await syncPlaidTransactions(token);
      await invalidateFinanceQueries();
    } catch (e) {
      console.error("❌ Manual sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  }, [token, isSyncing, invalidateFinanceQueries]);

  // ✅ First-time sync when dashboard is reached (PlaidLinkedGate ensures they’re linked already)
  React.useEffect(() => {
    if (!token) return;
    const alreadyDone = localStorage.getItem(INITIAL_SYNC_KEY) === "1";
    if (!alreadyDone) runInitialSync();
  }, [token, runInitialSync]);

  // ✅ When plaid links from anywhere, refresh data + userInfo
  React.useEffect(() => {
    const onLinked = async () => {
      // update UI gates that depend on this
      await queryClient.invalidateQueries({ queryKey: ["userInfo"] });

      const alreadyDone = localStorage.getItem(INITIAL_SYNC_KEY) === "1";
      if (!alreadyDone) {
        await runInitialSync();
      } else {
        await handleManualRefresh();
      }
    };

    window.addEventListener("plaid:linked", onLinked);
    return () => window.removeEventListener("plaid:linked", onLinked);
  }, [queryClient, runInitialSync, handleManualRefresh]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    const aId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;

    if (overId && overId !== aId) {
      dispatch(reorder({ activeId: aId, overId }));
    }
    setActiveId(null);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem(INITIAL_SYNC_KEY);
    window.location.reload();
  };

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
      <div className="min-w-[280px] max-w-[900px] w-[600px] rounded-2xl overflow-hidden backdrop-blur-xl bg-white/10 border border-white/15">
        <div className="px-3 py-2 border-b border-white/10 text-sm font-medium">{w.title}</div>
        <div className="p-3 pointer-events-none">
          <Comp />
        </div>
      </div>
    );
  };

  if (!token) return <LogoLoader show />;

  return (
    <div
      className="relative min-h-screen p-6"
      style={{
        background: `linear-gradient(to bottom right, var(--page-bg-from), var(--page-bg-to))`,
      }}
    >
      {showInitialLoader && <LogoLoader />}

      <h1 className="text-2xl font-semibold mb-4 text-[var(--text-primary)]">Your Dashboard</h1>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Overview</h2>

        <div className="flex items-center gap-3">
          <GlobalAccountFilter />

          <ThemeToggle />

          <Link
            to="/settings"
            className="p-2 rounded-md bg-[var(--btn-bg)] border border-[var(--btn-border)] hover:bg-[var(--btn-hover)] transition"
            title="Settings"
          >
            <Cog6ToothIcon className="w-5 h-5 text-[var(--text-primary)]" />
          </Link>

          <button
            onClick={handleManualRefresh}
            disabled={!token || isSyncing}
            className="p-2 rounded-md bg-[var(--btn-bg)] border border-[var(--btn-border)] hover:bg-[var(--btn-hover)] disabled:opacity-50 transition"
            title="Sync latest transactions"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isSyncing ? "animate-spin text-blue-400" : "text-[var(--text-primary)]"}`} />
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-md bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition"
            title="Logout"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 text-red-400" />
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        <SortableContext items={order.map(String)} strategy={rectSortingStrategy}>
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

        <DragOverlay adjustScale={false} dropAnimation={{ duration: 180, easing: "ease-out" }}>
          <Overlay />
        </DragOverlay>
      </DndContext>
    </div>
  );
}
