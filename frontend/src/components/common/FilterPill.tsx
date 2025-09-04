// put this near the top of the file
import React from "react";

const FilterPill = React.memo(function FilterPill({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: "all" | "expense" | "income";
  active: boolean;
  onClick: (v: "all" | "expense" | "income") => void;
}) {
  const base =
    "px-3 py-1.5 rounded-full text-sm border transition-colors duration-150 " +
    "backdrop-blur select-none";
  // constant border/ring to avoid reflow
  const activeCls =
    "bg-white/15 text-white border-white/15";
  const idleCls =
    "bg-white/5 text-white/70 border-white/10 hover:bg-white/10";

  // prevent focus-steal flicker on mousedown
  const handleMouseDown = (e: React.MouseEvent) => e.preventDefault();

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onClick={() => onClick(value)}
      aria-pressed={active}
      className={`${base} ${active ? activeCls : idleCls}`}
    >
      {label}
    </button>
  );
});

export default FilterPill