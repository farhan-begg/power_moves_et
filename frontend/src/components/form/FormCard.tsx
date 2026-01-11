// src/components/form/FormCard.tsx
import React from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Divider } from "./FormPrimitives";

export interface FormCardProps {
  title: string;
  saving?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Card container for form sections with title and optional saving indicator.
 */
export function FormCard({ title, saving, children, className = "" }: FormCardProps) {
  return (
    <div
      className={[
        "mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 shadow-lg",
        className,
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white/90">{title}</h4>
        {saving && <ArrowPathIcon className="h-4 w-4 animate-spin text-white/70" />}
      </div>
      <Divider />
      {children}
    </div>
  );
}

export default FormCard;
