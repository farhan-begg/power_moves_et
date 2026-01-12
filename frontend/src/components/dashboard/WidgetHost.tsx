// src/components/widgets/WidgetHost.tsx (or wherever this file lives)
import React, { Suspense, lazy } from "react";
import type { WidgetType } from "../../features/widgets/widgetsSlice";
import { SkeletonCard } from "../common";

// ✅ Mobile Performance: Lazy load widgets for code splitting
// Only load widgets when they're actually rendered
const StatTodayWidget = lazy(() => import("../widgets/StatTodayWidget"));
const StatMonthWidget = lazy(() => import("../widgets/StatMonthWidget"));
const StatYearWidget = lazy(() => import("../widgets/StatYearWidget"));
const IncomeExpenseChartWidget = lazy(() => import("../widgets/IncomeExpenseChartWidget"));
const BankFlowWidget = lazy(() => import("../widgets/BankFlowWidget"));
const TransactionsListWidget = lazy(() => import("../widgets/TransactionsListWidget"));
const NetWorthWidget = lazy(() => import("../widgets/NetWorthWidget"));
const AccountsWidget = lazy(() => import("../widgets/AccountsWidget"));
const PlaidLinkButton = lazy(() => import("../widgets/PlaidLinkButton"));
const GoalsWidget = lazy(() => import("../widgets/GoalsWidget"));
const CategoryPieWidget = lazy(() => import("../widgets/CategoryPieWidget"));
const UpcomingBillsWidget = lazy(() => import("../widgets/UpcomingBillsWidget"));
const NetWorthProjectionWidget = lazy(() => import("../widgets/NetWorthProjectionWidget"));
const FinancialHealthWidget = lazy(() => import("../widgets/FinancialHealthWidget"));
const ActionItemsWidget = lazy(() => import("../widgets/ActionItemsWidget"));
const PlaceholderWidget = lazy(() => import("../widgets/PlaceholderWidget"));

const registry: Record<WidgetType, React.ComponentType> = {
  "plaid-connect":  PlaidLinkButton,
  "stat-today": StatTodayWidget,
  "stat-month": StatMonthWidget,
  "stat-year": StatYearWidget,
  "income-expense-chart": IncomeExpenseChartWidget,
  "bank-flow": BankFlowWidget,
  "transactions-list": TransactionsListWidget,
  "net-worth": NetWorthWidget,
  "accounts": AccountsWidget,
  "cards": () => <PlaceholderWidget title="Credit Cards" />, // TODO: Fix widget
  "investments": () => <PlaceholderWidget title="Investments" />, // TODO: Fix widget
  "stocks-portfolio": () => <PlaceholderWidget title="Stocks & ETFs" />, // TODO: Fix widget
  "advice": () => <PlaceholderWidget title="AI Money Coach" />, // TODO: Fix widget
  "goals": GoalsWidget,
  "category-pie": CategoryPieWidget,
  "upcoming-bills": UpcomingBillsWidget,
  "crypto-portfolio": () => <PlaceholderWidget title="Crypto Portfolio" />, // TODO: Fix widget
  "net-worth-projection": NetWorthProjectionWidget,
  "financial-health": FinancialHealthWidget,
  "action-items": ActionItemsWidget,
};

// ✅ Mobile Performance: Widget loading fallback
const WidgetLoader = () => <SkeletonCard className="h-48" />;

export default function WidgetHost({ type }: { type: WidgetType }) {
  const Cmp = registry[type];
  return Cmp ? (
    <Suspense fallback={<WidgetLoader />}>
      <Cmp />
    </Suspense>
  ) : null;
}
