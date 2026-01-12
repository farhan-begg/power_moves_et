// frontend/src/components/widgets/PlaceholderWidget.tsx
// Placeholder for widgets that are temporarily disabled

export default function PlaceholderWidget({ title }: { title?: string }) {
  return (
    <div className="flex items-center justify-center h-32 rounded-lg border border-[var(--widget-border)] bg-[var(--widget-bg)]">
      <div className="text-center">
        <div className="text-sm text-[var(--text-muted)]">
          {title || "Widget"} is temporarily disabled
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          Coming soon...
        </div>
      </div>
    </div>
  );
}
