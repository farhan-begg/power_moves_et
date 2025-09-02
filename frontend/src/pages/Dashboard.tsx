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

// ⬇️ Heroicons
import {
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const order = useAppSelector((s) => s.widgets.order);
  const byId = useAppSelector((s) => s.widgets.byId);

  const token = useAppSelector((s) => s.auth.token);
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  React.useEffect(() => {
    dispatch(ensureDefaults());
  }, [dispatch]);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        setIsSyncing(true);
        await syncPlaidTransactions(token);
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["transactions", "list"] });
        queryClient.invalidateQueries({ queryKey: ["accounts"] });
        queryClient.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
      } catch (e) {
        console.error("❌ syncPlaidTransactions failed:", e);
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, queryClient]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (overId && overId !== activeId) {
      dispatch(reorder({ activeId, overId }));
    }
    setActiveId(null);
  };

  const handleManualRefresh = async () => {
    if (!token || isSyncing) return;
    try {
      setIsSyncing(true);
      await syncPlaidTransactions(token);
      queryClient.invalidateQueries({ queryKey: ["transactions", "list"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
    } catch (e) {
      console.error("❌ Manual sync failed:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.reload();
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white">
      <h1 className="text-2xl font-semibold mb-4">Your Dashboard</h1>

      {/* Overview + Filter + Buttons */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl text-white font-semibold">Overview</h1>

        <div className="flex items-center gap-3">
          <GlobalAccountFilter />

          {/* Sync button */}
          <button
            onClick={handleManualRefresh}
            disabled={!token || isSyncing}
            className="p-2 rounded-md bg-white/10 border border-white/15 hover:bg-white/15 disabled:opacity-50 transition"
            title="Sync latest transactions"
          >
            <ArrowPathIcon
              className={`w-5 h-5 ${isSyncing ? "animate-spin text-blue-400" : "text-white"}`}
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
        <SortableContext items={order.map(String)} strategy={rectSortingStrategy}>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {order.map((id: string) => {
              const w = byId[id];
              if (!w) return null;
              const Comp = widgetRenderer[w.type];
              if (!Comp) return null;

              return (
                <SortableWidget
                  key={id}
                  id={id}
                  title={w.title}
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
