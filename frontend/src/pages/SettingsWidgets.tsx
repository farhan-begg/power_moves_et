// src/pages/SettingsWidgets.tsx
import React from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../hooks/hooks";
import { removeWidget, addWidget, DEFAULT_WIDGETS, type WidgetType } from "../features/widgets/widgetsSlice";
import { ArrowLeftIcon, PlusIcon, TrashIcon, CheckIcon } from "@heroicons/react/24/outline";
import { GlassCard } from "../components/common";

// Widget metadata with descriptions
const WIDGET_METADATA: Record<WidgetType, { title: string; description: string; category: string }> = {
  "plaid-connect": { title: "Connect your bank", description: "Link your bank accounts via Plaid", category: "Setup" },
  "stat-today": { title: "Today", description: "Today's income and expenses", category: "Stats" },
  "stat-month": { title: "This Month", description: "Monthly financial summary", category: "Stats" },
  "stat-year": { title: "Year to Date", description: "Year-to-date financial overview", category: "Stats" },
  "income-expense-chart": { title: "Income vs Expense", description: "Visualize income and expenses over time", category: "Charts" },
  "bank-flow": { title: "Bank Flow", description: "Account balance trends", category: "Charts" },
  "transactions-list": { title: "Recent Spending", description: "List of recent transactions", category: "Details" },
  "net-worth": { title: "Net Worth", description: "Your current net worth", category: "Overview" },
  "accounts": { title: "Accounts", description: "All connected accounts", category: "Overview" },
  "cards": { title: "Credit Cards", description: "Credit card information", category: "Overview" },
  "investments": { title: "Investments", description: "Investment portfolio", category: "Investments" },
  "stocks-portfolio": { title: "Stocks & ETFs", description: "Stock portfolio tracking", category: "Investments" },
  "advice": { title: "AI Money Coach", description: "AI-powered financial advice", category: "AI Assistant" },
  "goals": { title: "Goals", description: "Track your financial goals", category: "Planning" },
  "category-pie": { title: "Category Summary", description: "Spending by category breakdown", category: "Charts" },
  "upcoming-bills": { title: "Upcoming Bills", description: "Recurring bills and payments", category: "Planning" },
  "crypto-portfolio": { title: "Crypto Portfolio", description: "Cryptocurrency holdings", category: "Investments" },
  "net-worth-projection": { title: "Net Worth Projection", description: "Future net worth predictions", category: "Planning" },
  "financial-health": { title: "Financial Health", description: "Overall financial health score", category: "AI Assistant" },
  "action-items": { title: "Action Items", description: "Prioritized financial actions", category: "AI Assistant" },
};

const CATEGORIES = ["AI Assistant", "Overview", "Stats", "Charts", "Planning", "Details", "Investments", "Setup"];

export default function SettingsWidgets() {
  const dispatch = useAppDispatch();
  const order = useAppSelector((s) => s.widgets.order);
  const byId = useAppSelector((s) => s.widgets.byId);

  // Get active widget IDs
  const activeWidgetIds = new Set(order);

  // Get all available widgets grouped by category
  const widgetsByCategory = React.useMemo(() => {
    const grouped: Record<string, Array<{ type: WidgetType; id?: string; isActive: boolean }>> = {};
    
    // Initialize categories
    CATEGORIES.forEach(cat => grouped[cat] = []);

    // Add all default widgets
    Object.values(DEFAULT_WIDGETS).forEach((widget) => {
      const metadata = WIDGET_METADATA[widget.type];
      const category = metadata?.category || "Other";
      if (!grouped[category]) grouped[category] = [];
      
      // Find if this widget type is active
      const activeWidget = Object.values(byId).find(w => w.type === widget.type);
      grouped[category].push({
        type: widget.type,
        id: activeWidget?.id,
        isActive: !!activeWidget,
      });
    });

    return grouped;
  }, [byId]);

  const handleAddWidget = (type: WidgetType) => {
    // Find the default widget config
    const defaultWidget = Object.values(DEFAULT_WIDGETS).find(w => w.type === type);
    if (!defaultWidget) return;

    // Check if widget type already exists
    const existing = Object.values(byId).find(w => w.type === type);
    if (existing) {
      // If exists but not in order, add it back to order
      if (!order.includes(existing.id)) {
        // Just add the existing ID back to order
        dispatch(addWidget({ id: existing.id, type, title: defaultWidget.title, size: defaultWidget.size }));
      }
      // If already in order, do nothing
      return;
    }

    // Find default ID for this widget type
    const defaultId = Object.keys(DEFAULT_WIDGETS).find(id => DEFAULT_WIDGETS[id].type === type);
    
    // Add new widget
    dispatch(addWidget({
      id: defaultId, // Use default ID if available, otherwise will be generated
      type,
      title: defaultWidget.title,
      size: defaultWidget.size,
    }));
  };

  const handleRemoveWidget = (widgetId: string) => {
    dispatch(removeWidget(widgetId));
  };

  return (
    <div
      className="min-h-screen p-4 sm:p-6"
      style={{
        background: `linear-gradient(to bottom right, var(--page-bg-from), var(--page-bg-to))`,
      }}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 sm:mb-8">
          <Link
            to="/settings"
            className="p-2 rounded-md bg-[var(--btn-bg)] border border-[var(--btn-border)] hover:bg-[var(--btn-hover)] transition touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            style={{
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <ArrowLeftIcon className="w-5 h-5 text-[var(--text-primary)]" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)]">
              Manage Widgets
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] mt-1">
              Add or remove widgets from your dashboard
            </p>
          </div>
        </div>

        {/* Widgets by Category */}
        {CATEGORIES.map((category) => {
          const widgets = widgetsByCategory[category];
          if (!widgets || widgets.length === 0) return null;

          return (
            <div key={category} className="mb-6 sm:mb-8">
              <h2 className="text-lg sm:text-xl font-medium text-[var(--text-primary)] mb-4">
                {category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {widgets.map(({ type, id, isActive }) => {
                  const metadata = WIDGET_METADATA[type];
                  const defaultWidget = Object.values(DEFAULT_WIDGETS).find(w => w.type === type);
                  
                  return (
                    <GlassCard
                      key={type}
                      className="p-4 sm:p-5 relative"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-[var(--text-primary)] text-sm sm:text-base mb-1">
                            {metadata?.title || defaultWidget?.title || type}
                          </h3>
                          <p className="text-xs sm:text-sm text-[var(--text-secondary)] line-clamp-2">
                            {metadata?.description || "Widget description"}
                          </p>
                          {defaultWidget && (
                            <span className="inline-block mt-2 px-2 py-0.5 text-xs rounded bg-[var(--btn-bg)] text-[var(--text-secondary)] border border-[var(--btn-border)]">
                              {defaultWidget.size === "lg" ? "Large" : "Small"}
                            </span>
                          )}
                        </div>

                        {/* Action Button */}
                        {isActive && id ? (
                          <button
                            onClick={() => handleRemoveWidget(id)}
                            className="flex-shrink-0 p-2 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 transition touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                            style={{
                              WebkitTapHighlightColor: "transparent",
                            }}
                            title="Remove widget"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAddWidget(type)}
                            className="flex-shrink-0 p-2 rounded-md bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] border border-[var(--btn-border)] text-[var(--text-primary)] transition touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                            style={{
                              WebkitTapHighlightColor: "transparent",
                            }}
                            title="Add widget"
                          >
                            <PlusIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      {/* Active Indicator */}
                      {isActive && (
                        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-5 h-5 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center">
                          <CheckIcon className="w-3 h-3 text-green-500" />
                        </div>
                      )}
                    </GlassCard>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Info */}
        <div className="mt-8 p-4 rounded-xl bg-[var(--widget-bg)] border border-[var(--widget-border)]">
          <p className="text-sm text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Tip:</strong> You can also drag widgets on the dashboard to reorder them. 
            Removing a widget doesn't delete your data—you can always add it back here.
          </p>
        </div>
      </div>
    </div>
  );
}
