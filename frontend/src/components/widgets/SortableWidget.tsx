// src/components/widgets/SortableWidget.tsx
import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch } from "../../hooks/hooks";
import { toggleWidgetSize } from "../../features/widgets/widgetsSlice";
import {
  ArrowsUpDownIcon,
  XMarkIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";

// ✅ accepts className from parent grid for spans like sm:col-span-3 xl:col-span-4
type Props = {
  id: string;
  title: string;
  size?: "sm" | "lg";          // kept for compatibility (toggle still works)
  onRemove?: () => void;
  className?: string;          // 👈 NEW
  children: React.ReactNode;
};

export default function SortableWidget({
  id,
  title,
  size = "sm",
  onRemove,
  className,
  children,
}: Props) {
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

  const combinedStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    backdropFilter: "var(--widget-blur)",
    WebkitBackdropFilter: "var(--widget-blur)",
    boxShadow: "var(--widget-shadow)",
  };

  return (
    <article
      ref={setNodeRef}
      data-grid-item
      style={combinedStyle}
      className={[
        // base card
        "group rounded-2xl overflow-hidden",
        "bg-[var(--widget-bg)] border border-[var(--widget-border)] ring-1 ring-[var(--widget-ring)]",
        // density + hover
        "p-3 sm:p-4 xl:p-5 hover:shadow-2xl transition",
        // drag state
        isDragging ? "opacity-70 scale-[0.98]" : "",
        // spans come from parent grid (Dashboard) via className
        className || "",
      ].join(" ")}
    >
      <header
        className="
          flex items-center justify-between mb-2 sm:mb-3
          px-2 sm:px-0 pt-1 sm:pt-0
          cursor-grab active:cursor-grabbing select-none
        "
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2 text-sm sm:text-base font-medium text-[var(--text-primary)]">
          <div className="flex items-center justify-center">
            <ArrowsUpDownIcon className="h-4 w-4 opacity-70" />
          </div>
          <span className="truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => dispatch(toggleWidgetSize(id))}
            className="flex items-center justify-center p-1.5 rounded-md hover:bg-[var(--btn-hover)] text-[var(--text-secondary)] transition-colors"
            title={`Toggle size (${size === "lg" ? "shrink" : "expand"})`}
          >
            <ArrowsPointingOutIcon className="h-4 w-4" />
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="flex items-center justify-center p-1.5 rounded-md hover:bg-[var(--btn-hover)] text-[var(--text-secondary)] transition-colors"
              title="Remove widget"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className={isDragging || isSorting ? "pointer-events-none opacity-80" : ""}>
        {children}
      </div>
    </article>
  );
}
