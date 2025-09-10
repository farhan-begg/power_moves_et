// src/components/widgets/WidgetHost.tsx (or wherever this file lives)
import React from "react";
import PlaidConnectWidget from "../widgets/PlaidConnectWidget";
import StatTodayWidget from "../widgets/StatTodayWidget";
import StatMonthWidget from "../widgets/StatMonthWidget";
import StatYearWidget from "../widgets/StatYearWidget";
import IncomeExpenseChartWidget from "../widgets/IncomeExpenseChartWidget";
import BankFlowWidget from "../widgets/BankFlowWidget";
import TransactionsListWidget from "../widgets/TransactionsListWidget";
import NetWorthWidget from "../widgets/NetWorthWidget";
import AccountsWidget from "../widgets/AccountsWidget";
import CardsWidget from "../widgets/CardsWidget";
import InvestmentsWidget from "../widgets/InvestmentsWidget";
import StocksPortfolioWidget from "../widgets/StocksPortfolioWidget";
import type { WidgetType } from "../../features/widgets/widgetsSlice";
import AdviceWidget from "../widgets/AdviceWidget";
import PlaidLinkButton from "../PlaidLinkButton";
import GoalsWidget from "../widgets/GoalsWidget";
import CategoryPieWidget from "../widgets/CategoryPieWidget";

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
  "cards": CardsWidget,
  "investments": InvestmentsWidget,
  "stocks-portfolio": StocksPortfolioWidget,
  "advice": AdviceWidget, 
      "goals": GoalsWidget,          
        "category-pie": CategoryPieWidget,             // 👈 added
};

export default function WidgetHost({ type }: { type: WidgetType }) {
  const Cmp = registry[type];
  return Cmp ? <Cmp /> : null;
}
