// src/components/common/ThemeToggle.tsx
import { useAppDispatch, useAppSelector } from "../../hooks/hooks";
import { cycleTheme, ThemeMode } from "../../features/theme/themeSlice";
import { SunIcon, MoonIcon, SparklesIcon } from "@heroicons/react/24/outline";

const themeLabels: Record<ThemeMode, string> = {
  glass: "Glass",
  light: "Light",
  dark: "Dark",
};

const themeIcons: Record<ThemeMode, React.ReactNode> = {
  glass: <SparklesIcon className="w-5 h-5" />,
  light: <SunIcon className="w-5 h-5" />,
  dark: <MoonIcon className="w-5 h-5" />,
};

export default function ThemeToggle() {
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((s) => s.theme.mode);

  return (
    <button
      onClick={() => dispatch(cycleTheme())}
      className="p-2 rounded-md bg-[var(--btn-bg)] border border-[var(--btn-border)] hover:bg-[var(--btn-hover)] transition flex items-center gap-2"
      title={`Theme: ${themeLabels[themeMode]} (click to change)`}
    >
      <span className="text-[var(--text-primary)]">{themeIcons[themeMode]}</span>
      <span className="text-sm text-[var(--text-secondary)] hidden sm:inline">
        {themeLabels[themeMode]}
      </span>
    </button>
  );
}
