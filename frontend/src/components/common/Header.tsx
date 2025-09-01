import React from "react";

type HeaderProps = {
  title?: string;
  onRefresh?: () => void;
  loading?: boolean;
};

export default function Header({ title = "Widget", onRefresh, loading }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-medium">{title}</h3>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          className="text-xs underline disabled:opacity-60"
        >
          Refresh
        </button>
      )}
    </div>
  );
}
