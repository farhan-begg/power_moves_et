import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch } from "../../hooks/hooks";
import { toggleWidgetSize } from "../../features/widgets/widgetsSlice";
import { ArrowsUpDownIcon, XMarkIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";

type Props = {
  id: string;
  title: string;
  size?: "sm" | "lg";
  onRemove?: () => void;
  children: React.ReactNode;
};

export default function SortableWidget({ id, title, size = "sm", onRemove, children }: Props) {
  const dispatch = useAppDispatch();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id,
    transition: { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" },
    animateLayoutChanges: ({ isSorting, wasDragging }) => isSorting || wasDragging,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      data-grid-item
      style={style}
      className={`
        group rounded-2xl overflow-hidden
        backdrop-blur-lg bg-white/7.5 border border-white/15 shadow-xl ring-1 ring-white/10
        ${isDragging ? "opacity-70 scale-[0.98]" : ""}
        ${size === "lg" ? "sm:col-span-2 lg:col-span-2" : "sm:col-span-1 lg:col-span-1"}
      `}
    >
      <header
        className="
          flex items-center justify-between px-4 py-2
          bg-white/5 border-b border-white/10
          cursor-grab active:cursor-grabbing select-none
        "
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          <ArrowsUpDownIcon className="h-4 w-4 opacity-70" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => dispatch(toggleWidgetSize(id))}
            className="p-1 rounded-md hover:bg-white/10 text-white/80"
            title="Toggle size"
          >
            <ArrowsPointingOutIcon className="h-4 w-4" />
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded-md hover:bg-white/10 text-white/80"
              title="Remove widget"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="p-4">
        <div className={isDragging || isSorting ? "pointer-events-none opacity-80" : ""}>
          {children}
        </div>
      </div>
    </article>
  );
}
