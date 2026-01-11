// src/components/common/Modal.tsx
import React from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { GlassCard } from "./GlassCard";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Modal dialog with glassmorphism styling.
 */
export function Modal({ open, onClose, title, children, className = "" }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <GlassCard className={["relative w-full max-w-lg mx-4", className].join(" ")}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/70 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {children}
      </GlassCard>
    </div>
  );
}

export default Modal;
