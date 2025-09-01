// src/components/widgets/registry.ts
import PlaidConnectWidget from "./PlaidConnectWidget";
import StatTodayWidget from "./StatTodayWidget";
import StatMonthWidget from "./StatMonthWidget";
import StatYearWidget from "./StatYearWidget";
import IncomeExpenseChartWidget from "./IncomeExpenseChartWidget";
import BankFlowWidget from "./BankFlowWidget";
import TransactionsListWidget from "./TransactionsListWidget";
import NetWorthWidget from "./NetWorthWidget";
import AccountsWidget from "./AccountsWidget";
import CardsWidget from "./CardsWidget";
import InvestmentsWidget from "./InvestmentsWidget";
import StocksPortfolioWidget from "./StocksPortfolioWidget";

import type { WidgetType } from "../../features/widgets/widgetsSlice";
import AdviceWidget from "./AdviceWidget";
import PlaidLinkButton from "../PlaidLinkButton";
import GoalsWidget from "./GoalsWidget";

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
  "cards": CardsWidget,
  "investments": InvestmentsWidget,
  "stocks-portfolio": StocksPortfolioWidget,
  "advice": AdviceWidget,       
        "goals": GoalsWidget,       // 👈 added
};
