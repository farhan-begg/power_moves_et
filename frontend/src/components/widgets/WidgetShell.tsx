import { XMarkIcon, ArrowsUpDownIcon } from "@heroicons/react/24/outline";

type Props = {
  title: string;
  onRemove?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  children: React.ReactNode;
};

export default function WidgetShell({ title, onRemove, dragHandleProps, children }: Props) {
  return (
    <div className="rounded-2xl p-4 bg-white/10 backdrop-blur-md border border-white/15 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            {...dragHandleProps}
            className="p-2 rounded-lg hover:bg-white/10 active:cursor-grabbing cursor-grab"
            title="Drag"
          >
            <ArrowsUpDownIcon className="h-5 w-5 text-white/70" />
          </button>
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-2 rounded-lg hover:bg-white/10"
            title="Remove"
          >
            <XMarkIcon className="h-5 w-5 text-white/70" />
          </button>
        )}
      </div>
      <div className="text-white">{children}</div>
    </div>
  );
}
