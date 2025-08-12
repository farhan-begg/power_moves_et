import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { XMarkIcon, Bars3Icon } from "@heroicons/react/24/outline";

type Props = {
  id: string;
  title: string;
  onRemove?: () => void;
  children: React.ReactNode;
};

export default function SortableWidget({ id, title, onRemove, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // make dragged item float above others
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      {/* keep the slot in the grid occupied while dragging */}
      <div
        className={`h-full rounded-2xl overflow-hidden backdrop-blur-md bg-white/5 border border-white/10 shadow-lg ring-1 ring-white/5 ${
          isDragging ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            {/* drag handle */}
            <button
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20"
              {...attributes}
              {...listeners}
              aria-label="Drag"
              title="Drag to move"
            >
              <Bars3Icon className="h-5 w-5 text-white/70" />
            </button>
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/20"
              title="Remove"
            >
              <XMarkIcon className="h-5 w-5 text-white/70" />
            </button>
          )}
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}
