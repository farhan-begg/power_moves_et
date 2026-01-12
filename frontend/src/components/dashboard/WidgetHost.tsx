// src/components/widgets/WidgetHost.tsx (or wherever this file lives)
import React from "react";
import StatTodayWidget from "../widgets/StatTodayWidget";
import StatMonthWidget from "../widgets/StatMonthWidget";
import StatYearWidget from "../widgets/StatYearWidget";
import IncomeExpenseChartWidget from "../widgets/IncomeExpenseChartWidget";
import BankFlowWidget from "../widgets/BankFlowWidget";
import TransactionsListWidget from "../widgets/TransactionsListWidget";
import NetWorthWidget from "../widgets/NetWorthWidget";
import AccountsWidget from "../widgets/AccountsWidget";
// import CardsWidget from "../widgets/CardsWidget"; // TODO: Fix widget
// import InvestmentsWidget from "../widgets/InvestmentsWidget"; // TODO: Fix widget
// import StocksPortfolioWidget from "../widgets/StocksPortfolioWidget"; // TODO: Fix widget
import type { WidgetType } from "../../features/widgets/widgetsSlice";
// import AdviceWidget from "../widgets/AdviceWidget"; // TODO: Fix widget
import PlaidLinkButton from "../widgets/PlaidLinkButton";
import GoalsWidget from "../widgets/GoalsWidget";
import CategoryPieWidget from "../widgets/CategoryPieWidget";
import UpcomingBillsWidget from "../widgets/UpcomingBillsWidget";
// import CryptoPortfolioWidget from "../widgets/CryptoPortfolioWidget"; // TODO: Fix widget
import NetWorthProjectionWidget from "../widgets/NetWorthProjectionWidget";
import PlaceholderWidget from "../widgets/PlaceholderWidget";

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
};

export default function WidgetHost({ type }: { type: WidgetType }) {
  const Cmp = registry[type];
  return Cmp ? <Cmp /> : null;
}
