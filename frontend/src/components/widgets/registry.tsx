// src/components/widgets/registry.ts
import StatTodayWidget from "./StatTodayWidget";
import StatMonthWidget from "./StatMonthWidget";
import StatYearWidget from "./StatYearWidget";
import IncomeExpenseChartWidget from "./IncomeExpenseChartWidget";
import BankFlowWidget from "./BankFlowWidget";
import TransactionsListWidget from "./TransactionsListWidget";
import NetWorthWidget from "./NetWorthWidget";
import AccountsWidget from "./AccountsWidget";
// import CardsWidget from "./CardsWidget"; // TODO: Fix widget
// import InvestmentsWidget from "./InvestmentsWidget"; // TODO: Fix widget
// import StocksPortfolioWidget from "./StocksPortfolioWidget"; // TODO: Fix widget

import type { WidgetType } from "../../features/widgets/widgetsSlice";
// import AdviceWidget from "./AdviceWidget"; // TODO: Fix widget
import PlaidLinkButton from "./PlaidLinkButton";
import GoalsWidget from "./GoalsWidget";
import CategoryPieWidget from "./CategoryPieWidget";
import UpcomingBillsWidget from "./UpcomingBillsWidget";
// import CryptoPortfolioWidget from "./CryptoPortfolioWidget"; // TODO: Fix widget
import NetWorthProjectionWidget from "./NetWorthProjectionWidget";
import PlaceholderWidget from "./PlaceholderWidget";

export const widgetRenderer: Record<WidgetType, React.ComponentType> = {
  "plaid-connect": PlaidLinkButton,
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
