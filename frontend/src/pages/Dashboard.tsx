import React from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  closestCenter,
  MeasuringStrategy,
  DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import SortableWidget from "../components/widgets/SortableWidget";
import { widgetRenderer } from "../components/widgets/registry";
import { useAppDispatch, useAppSelector } from "../hooks/hooks";
import { reorder, removeWidget } from "../features/widgets/widgetsSlice";
import { DragOverlay } from "@dnd-kit/core";

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const order = useAppSelector((s) => s.widgets.order);
  const byId = useAppSelector((s) => s.widgets.byId);

  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (overId && overId !== activeId) {
      dispatch(reorder({ activeId, overId }));
    }
    setActiveId(null);
  };

  const onDragCancel = () => setActiveId(null);

  // Overlay preview of the active widget (prevents the grid from “jumping”)
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

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        collisionDetection={closestCenter}
        measuring={{
          droppable: { strategy: MeasuringStrategy.Always }, // keep sizes measured
        }}
      >
        <SortableContext items={order.map(String)} strategy={rectSortingStrategy}>
          {/* Make rows consistent to reduce “weird gaps”.
              You can tweak this min height to match your widgets. */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[minmax(220px,auto)]">
       {order.map((id: string) => {
              const w = byId[id];
              if (!w) return null;
              const Comp = widgetRenderer[w.type];
              if (!Comp) return null;

              return (
                <div key={id} className="min-h-[180px]">
                  <SortableWidget
                    id={id}
                    title={w.title}
                    onRemove={() => dispatch(removeWidget(id))}
                  >
                    <Comp />
                  </SortableWidget>
                </div>
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
