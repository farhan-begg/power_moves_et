import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import SortableWidget from "../components/widgets/SortableWidget";
import { widgetRenderer } from "../components/widgets/registry";
import { useAppDispatch, useAppSelector } from "../hooks/hooks";
import { reorder, removeWidget } from "../features/widgets/widgetsSlice";

export default function Dashboard() {
  const dispatch = useAppDispatch();
  const order: string[] = useAppSelector((s) => s.widgets.order);
  const byId = useAppSelector((s) => s.widgets.byId);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (overId && overId !== activeId) {
      dispatch(reorder({ activeId, overId }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white">
      <h1 className="text-2xl font-semibold mb-4">Your Dashboard</h1>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={order.map(String)} strategy={rectSortingStrategy}>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[1fr]">
            {order.map((id: string) => {
              const w = byId[id];
              if (!w) return null;
              const Comp = widgetRenderer[w.type];
              if (!Comp) return null;
              return (
                <div key={id} className="min-h-[180px]">
                  <SortableWidget id={id} title={w.title} onRemove={() => dispatch(removeWidget(id))}>
                    <Comp />
                  </SortableWidget>
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
