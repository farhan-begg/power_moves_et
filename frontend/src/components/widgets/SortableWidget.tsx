import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { XMarkIcon } from "@heroicons/react/24/outline";

type Props = {
  id: string;
  title: string;
  onRemove?: () => void;
  children?: React.ReactNode;
};

export default function SortableWidget({ id, title, onRemove, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          className="cursor-grab active:cursor-grabbing text-white/70 text-sm"
          {...attributes}
          {...listeners}
          title="Drag"
        >
          ⠿
        </button>
        <div className="font-semibold">{title}</div>
        {onRemove && (
          <button onClick={onRemove} className="p-1 hover:bg-white/10 rounded-lg">
            <XMarkIcon className="h-5 w-5 text-white/70" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
