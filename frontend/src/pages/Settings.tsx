// src/pages/Settings.tsx
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../hooks/hooks";
import { setTheme, ThemeMode } from "../features/theme/themeSlice";
import {
  ArrowLeftIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

const themeOptions: {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  preview: {
    bg: string;
    card: string;
    text: string;
  };
}[] = [
  {
    mode: "glass",
    label: "Glass",
    description: "Glassmorphism with blur effects and transparency",
    icon: <SparklesIcon className="w-6 h-6" />,
    preview: {
      bg: "bg-gradient-to-br from-slate-900 to-slate-950",
      card: "bg-white/10 backdrop-blur-md border-white/20",
      text: "text-white",
    },
  },
  {
    mode: "light",
    label: "Light",
    description: "Clean light theme with solid colors",
    icon: <SunIcon className="w-6 h-6" />,
    preview: {
      bg: "bg-gray-100",
      card: "bg-white border-gray-200",
      text: "text-gray-900",
    },
  },
  {
    mode: "dark",
    label: "Dark",
    description: "Dark theme with solid colors",
    icon: <MoonIcon className="w-6 h-6" />,
    preview: {
      bg: "bg-gray-900",
      card: "bg-gray-800 border-gray-700",
      text: "text-white",
    },
  },
];

export default function Settings() {
  const dispatch = useAppDispatch();
  const currentTheme = useAppSelector((s) => s.theme.mode);

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background: `linear-gradient(to bottom right, var(--page-bg-from), var(--page-bg-to))`,
      }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/dashboard"
            className="p-2 rounded-md bg-[var(--btn-bg)] border border-[var(--btn-border)] hover:bg-[var(--btn-hover)] transition"
          >
            <ArrowLeftIcon className="w-5 h-5 text-[var(--text-primary)]" />
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
            Settings
          </h1>
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
            Appearance
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Choose how your dashboard looks. Select a theme that suits your preference.
          </p>

          <div className="grid gap-4">
            {themeOptions.map((option) => {
              const isSelected = currentTheme === option.mode;

              return (
                <button
                  key={option.mode}
                  onClick={() => dispatch(setTheme(option.mode))}
                  className={[
                    "relative flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left",
                    "bg-[var(--widget-bg)]",
                    isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/20"
                      : "border-[var(--widget-border)] hover:border-[var(--text-muted)]",
                  ].join(" ")}
                  style={{
                    backdropFilter: "var(--widget-blur)",
                    WebkitBackdropFilter: "var(--widget-blur)",
                  }}
                >
                  {/* Theme preview */}
                  <div
                    className={[
                      "w-16 h-16 rounded-lg flex items-center justify-center shrink-0",
                      option.preview.bg,
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "w-10 h-8 rounded border",
                        option.preview.card,
                      ].join(" ")}
                    />
                  </div>

                  {/* Theme info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-primary)]">
                        {option.icon}
                      </span>
                      <span className="font-medium text-[var(--text-primary)]">
                        {option.label}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      {option.description}
                    </p>
                  </div>

                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                      <CheckIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-medium text-[var(--text-primary)] mb-4">
            Dashboard Settings
          </h2>
          <div className="grid gap-4">
            <Link
              to="/settings/widgets"
              className="block p-4 rounded-xl bg-[var(--widget-bg)] border border-[var(--widget-border)] hover:border-[var(--text-muted)] transition text-[var(--text-primary)]"
              style={{
                backdropFilter: "var(--widget-blur)",
                WebkitBackdropFilter: "var(--widget-blur)",
              }}
            >
              <div className="font-medium mb-1">Manage Widgets</div>
              <div className="text-sm text-[var(--text-secondary)]">
                Add or remove widgets from your dashboard
              </div>
            </Link>
            <Link
              to="/settings/categories"
              className="block p-4 rounded-xl bg-[var(--widget-bg)] border border-[var(--widget-border)] hover:border-[var(--text-muted)] transition text-[var(--text-primary)]"
              style={{
                backdropFilter: "var(--widget-blur)",
                WebkitBackdropFilter: "var(--widget-blur)",
              }}
            >
              <div className="font-medium mb-1">Manage Categories</div>
              <div className="text-sm text-[var(--text-secondary)]">
                Customize transaction categories
              </div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
