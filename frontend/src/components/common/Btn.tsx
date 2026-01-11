// src/components/common/Btn.tsx
import React from "react";

export interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: "solid" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  type?: "button" | "submit" | "reset";
}

/**
 * Button component with solid/ghost/danger variants.
 */
export function Btn({
  children,
  onClick,
  disabled = false,
  kind = "solid",
  size = "md",
  className = "",
  type = "button",
}: BtnProps) {
  const kindStyles = {
    solid: "bg-white/10 hover:bg-white/15 focus:ring-white/20",
    ghost: "bg-transparent hover:bg-white/10 focus:ring-white/20",
    danger: "bg-rose-500/20 hover:bg-rose-500/30 focus:ring-rose-400/30 text-rose-200",
  };

  const sizeStyles = {
    sm: "px-2 py-1.5 text-[11px]",
    md: "px-3 py-2 text-xs",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-2 rounded-lg text-white focus:outline-none focus:ring-2",
        kindStyles[kind],
        sizeStyles[size],
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

export interface IconBtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/**
 * Icon-only button for toolbar actions.
 */
export function IconBtn({ children, onClick, title, className = "" }: IconBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={[
        "inline-flex items-center justify-center rounded-md p-1.5",
        "text-white/80 hover:text-white hover:bg-white/10",
        "focus:outline-none focus:ring-2 focus:ring-white/20",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default Btn;
