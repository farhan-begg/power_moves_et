// src/components/form/FormPrimitives.tsx
import React from "react";

/* ---------- Field Wrapper ---------- */
export interface FieldProps {
  children: React.ReactNode;
  className?: string;
}

export function Field({ children, className = "" }: FieldProps) {
  return <div className={["flex flex-col gap-1", className].join(" ")}>{children}</div>;
}

/* ---------- Label ---------- */
export interface LabelProps {
  children: React.ReactNode;
  htmlFor?: string;
}

export function Label({ children, htmlFor }: LabelProps) {
  return (
    <label htmlFor={htmlFor} className="text-[11px] text-white/60">
      {children}
    </label>
  );
}

/* ---------- Help Text ---------- */
export interface HelpProps {
  children: React.ReactNode;
}

export function Help({ children }: HelpProps) {
  return <div className="text-[11px] text-white/50">{children}</div>;
}

/* ---------- Error Text ---------- */
export interface ErrorTextProps {
  children: React.ReactNode;
}

export function ErrorText({ children }: ErrorTextProps) {
  return <div className="mt-1 text-[11px] text-rose-300">{children}</div>;
}

/* ---------- Divider ---------- */
export function Divider() {
  return <div className="my-3 h-px w-full bg-white/10" />;
}

/* ---------- Input ---------- */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  prefix?: string;
  error?: boolean;
};

export function Input({ prefix, className = "", error, ...props }: InputProps) {
  const ariaInvalid = (props as any)["aria-invalid"] || error;

  const baseStyles = [
    "w-full rounded-lg bg-white/10 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40",
    "focus:outline-none focus:ring-white/20",
    ariaInvalid ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
    className,
  ].join(" ");

  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-white/50">
          {prefix}
        </span>
        <input {...props} className={[baseStyles, "pl-7 pr-3"].join(" ")} />
      </div>
    );
  }

  return <input {...props} className={[baseStyles, "px-3"].join(" ")} />;
}

/* ---------- Select ---------- */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean | string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variantSize?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: React.ReactNode;
};

export function Select({
  className = "",
  error,
  leftIcon,
  rightIcon,
  variantSize = "md",
  isLoading = false,
  disabled,
  children,
  ...props
}: SelectProps) {
  const sizeCls =
    variantSize === "sm"
      ? "py-1.5 text-[13px]"
      : variantSize === "lg"
      ? "py-2.5 text-[15px]"
      : "py-2 text-sm";

  const isErrored = typeof error === "string" ? true : !!error;
  const isDisabled = disabled || isLoading;

  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/60">
          {leftIcon}
        </span>
      )}

      <select
        {...props}
        disabled={isDisabled}
        className={[
          "w-full rounded-lg bg-white/10 pr-8 text-white ring-1 ring-white/10",
          "placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20",
          "appearance-none [color-scheme:dark] backdrop-blur-md",
          sizeCls,
          leftIcon ? "pl-8" : "px-3",
          isDisabled ? "opacity-60 cursor-not-allowed" : "",
          isErrored ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
          className,
        ].join(" ")}
      >
        {isLoading ? (
          <option className="bg-slate-900 text-white">Loading…</option>
        ) : (
          children
        )}
      </select>

      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        {rightIcon ?? (
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-white/70">
            <path
              fill="currentColor"
              d="M5.6 7.6a1 1 0 0 1 1.4 0L10 10.6l3-3a1 1 0 1 1 1.4 1.4l-3.7 3.7a1 1 0 0 1-1.4 0L5.6 9a1 1 0 0 1 0-1.4Z"
            />
          </svg>
        )}
      </span>

      {typeof error === "string" && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

/* ---------- Textarea ---------- */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export function Textarea({ className = "", error, ...props }: TextareaProps) {
  const ariaInvalid = (props as any)["aria-invalid"] || error;

  return (
    <textarea
      {...props}
      className={[
        "min-h-[72px] w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10",
        "focus:outline-none focus:ring-white/20",
        ariaInvalid ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
        className,
      ].join(" ")}
    />
  );
}
