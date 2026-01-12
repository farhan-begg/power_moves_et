// frontend/src/components/widgets/ActionItemsWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchSummary } from "../../api/transaction";
import { fetchNetWorth } from "../../api/plaid";
import { fetchGoals } from "../../api/goals";
import { fetchRecurringOverview } from "../../api/recurring";
import { GlassCard } from "../common";
import { motion } from "framer-motion";
import { 
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  LightBulbIcon,
  ArrowRightIcon
} from "@heroicons/react/24/outline";

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface ActionItem {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  category: "budget" | "savings" | "debt" | "goals" | "bills" | "general";
  actionUrl?: string;
  estimatedImpact?: string;
}

export default function ActionItemsWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  
  const { data: summary } = useQuery({
    queryKey: ["summary", "month"],
    queryFn: () => fetchSummary(token!, { granularity: "month" }),
    enabled: !!token,
  });

  const { data: netWorthData } = useQuery({
    queryKey: ["plaid", "net-worth"],
    queryFn: () => fetchNetWorth(token!),
    enabled: !!token,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", "list"],
    queryFn: () => fetchGoals(token!),
    enabled: !!token,
  });

  const { data: recurringData } = useQuery({
    queryKey: ["recurring", "overview"],
    queryFn: () => fetchRecurringOverview(token!),
    enabled: !!token,
  });

  const actionItems = React.useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    
    // Calculate financial metrics
    const recentMonths = summary?.data?.slice(-3) || [];
    const avgIncome = recentMonths.reduce((sum: number, m: any) => sum + (m.income || 0), 0) / Math.max(1, recentMonths.length);
    const avgExpense = recentMonths.reduce((sum: number, m: any) => sum + (m.expense || 0), 0) / Math.max(1, recentMonths.length);
    const savingsRate = avgIncome > 0 ? ((avgIncome - avgExpense) / avgIncome) * 100 : 0;
    const netWorth = netWorthData?.summary?.netWorth || 0;
    const emergencyFundMonths = avgExpense > 0 ? netWorth / avgExpense : 0;

    // 1. Low savings rate
    if (savingsRate < 20 && savingsRate > 0) {
      const needed = avgIncome * 0.2 - (avgIncome - avgExpense);
      items.push({
        id: "increase-savings",
        title: "Increase Your Savings Rate",
        description: `You're saving ${savingsRate.toFixed(1)}% - aim for 20%+ to build wealth faster`,
        priority: savingsRate < 10 ? "high" : "medium",
        category: "savings",
        estimatedImpact: `Save ${currency.format(needed)} more per month`,
      });
    } else if (savingsRate <= 0) {
      items.push({
        id: "negative-savings",
        title: "Stop Overspending - Urgent",
        description: "You're spending more than you earn. Review your expenses immediately.",
        priority: "high",
        category: "budget",
        estimatedImpact: `Reduce expenses by ${currency.format(Math.abs(avgIncome - avgExpense))} per month`,
      });
    }

    // 2. Emergency fund
    if (emergencyFundMonths < 6) {
      const needed = avgExpense * 6 - netWorth;
      items.push({
        id: "build-emergency-fund",
        title: "Build Emergency Fund",
        description: emergencyFundMonths < 1
          ? "Start an emergency fund - aim for 3-6 months of expenses"
          : `You have ${emergencyFundMonths.toFixed(1)} months - build to 6 months`,
        priority: emergencyFundMonths < 3 ? "high" : "medium",
        category: "savings",
        estimatedImpact: `Save ${currency.format(needed)} to reach 6 months`,
      });
    }

    // 3. No goals
    const activeGoals = goals.filter((g: any) => g.status === "active");
    if (activeGoals.length === 0) {
      items.push({
        id: "create-goals",
        title: "Set Financial Goals",
        description: "Create savings or spending goals to stay motivated and track progress",
        priority: "medium",
        category: "goals",
        actionUrl: "#goals",
      });
    }

    // 4. Goals behind schedule
    activeGoals.forEach((goal: any) => {
      if (goal.deadline && goal.status === "active") {
        const progress = goal.currentAmount / goal.targetAmount;
        const daysElapsed = (Date.now() - new Date(goal.startDate || goal.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const daysTotal = (new Date(goal.deadline).getTime() - new Date(goal.startDate || goal.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const expectedProgress = daysElapsed / daysTotal;
        
        if (progress < expectedProgress - 0.1) {
          const needed = goal.targetAmount - goal.currentAmount;
          const remainingDays = (new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          const monthlyNeeded = remainingDays > 0 ? (needed / remainingDays) * 30 : needed;
          
          items.push({
            id: `goal-${goal._id}`,
            title: `Catch Up on "${goal.name}"`,
            description: `You're ${((expectedProgress - progress) * 100).toFixed(0)}% behind schedule`,
            priority: progress < expectedProgress - 0.2 ? "high" : "medium",
            category: "goals",
            estimatedImpact: `Save ${currency.format(monthlyNeeded)}/month to catch up`,
          });
        }
      }
    });

    // 5. High recurring expenses (calculate from upcoming bills in next 40 days)
    const recurringExpenses = recurringData?.bills || [];
    // Calculate monthly equivalent: sum all bills in next 40 days, then extrapolate to monthly
    const totalUpcomingBills = recurringExpenses.reduce((sum: number, bill: any) => {
      return sum + (bill.amount || 0);
    }, 0);
    // If we have bills over 40 days, estimate monthly: (total / 40) * 30
    const monthlyRecurring = recurringExpenses.length > 0 ? (totalUpcomingBills / 40) * 30 : 0;
    
    if (monthlyRecurring > avgIncome * 0.5 && avgIncome > 0) {
      items.push({
        id: "review-subscriptions",
        title: "Review Subscriptions & Recurring Bills",
        description: `You have ${recurringExpenses.length} upcoming bills totaling ${currency.format(totalUpcomingBills)}`,
        priority: "medium",
        category: "bills",
        estimatedImpact: `Estimated ${currency.format(monthlyRecurring)}/month on recurring expenses - review for savings`,
      });
    }

    // 6. No budget tracking
    const spendingVariance = recentMonths.length > 1 
      ? recentMonths.reduce((sum: number, m: any, i: number, arr: any[]) => {
          if (i === 0) return 0;
          return sum + Math.abs((m.expense || 0) - (arr[i-1].expense || 0));
        }, 0) / (recentMonths.length - 1)
      : 0;
    const variancePercent = avgExpense > 0 ? (spendingVariance / avgExpense) * 100 : 0;
    
    if (variancePercent > 20) {
      items.push({
        id: "create-budget",
        title: "Create a Monthly Budget",
        description: "Your spending varies significantly month-to-month. A budget will help stabilize it.",
        priority: "medium",
        category: "budget",
        estimatedImpact: "Reduce spending variance and save more consistently",
      });
    }

    // Sort by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return items.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  }, [summary, netWorthData, goals, recurringData]);

  const getPriorityColor = (priority: ActionItem["priority"]) => {
    switch (priority) {
      case "high": return "text-red-400 bg-red-400/10 border-red-400/20";
      case "medium": return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
      case "low": return "text-blue-400 bg-blue-400/10 border-blue-400/20";
    }
  };

  const getCategoryIcon = (category: ActionItem["category"]) => {
    switch (category) {
      case "budget": return "💰";
      case "savings": return "💵";
      case "debt": return "💳";
      case "goals": return "🎯";
      case "bills": return "📅";
      default: return "💡";
    }
  };

  if (actionItems.length === 0) {
    return (
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <LightBulbIcon className="w-6 h-6 text-[var(--positive)]" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Action Items</h3>
        </div>
        <div className="text-center py-8">
          <CheckCircleIcon className="w-12 h-12 text-[var(--positive)] mx-auto mb-3 opacity-50" />
          <p className="text-sm text-[var(--text-muted)]">You're on track! No urgent actions needed.</p>
        </div>
      </GlassCard>
    );
  }

  return (
      <GlassCard className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <LightBulbIcon className="w-5 h-5 md:w-6 md:h-6 text-[var(--positive)]" />
          <h3 className="text-base md:text-lg font-semibold text-[var(--text-primary)]">Action Items</h3>
          <span className="text-xs px-2 py-1 rounded-full bg-[var(--btn-bg)] text-[var(--text-secondary)]">
            {actionItems.length}
          </span>
        </div>

      <div className="space-y-3">
        {actionItems.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`rounded-lg border p-3 md:p-4 ${getPriorityColor(item.priority)}`}
          >
            <div className="flex items-start gap-2 md:gap-3">
              <div className="text-xl md:text-2xl">{getCategoryIcon(item.category)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(item.priority)}`}>
                    {item.priority}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-2">{item.description}</p>
                {item.estimatedImpact && (
                  <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <ClockIcon className="w-3 h-3" />
                    <span>{item.estimatedImpact}</span>
                  </div>
                )}
              </div>
              {/* ✅ Desktop: Show next button, Mobile: Hide */}
              {item.actionUrl && (
                <ArrowRightIcon className="hidden md:block w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--widget-border)]">
        <p className="text-xs text-[var(--text-muted)] text-center">
          Focus on high-priority items first for maximum impact
        </p>
      </div>
    </GlassCard>
  );
}
