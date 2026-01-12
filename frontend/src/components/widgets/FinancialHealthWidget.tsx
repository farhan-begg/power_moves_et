// frontend/src/components/widgets/FinancialHealthWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchSummary } from "../../api/transaction";
import { fetchNetWorth } from "../../api/plaid";
import { fetchGoals } from "../../api/goals";
import { GlassCard } from "../common";
import { motion } from "framer-motion";
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon, 
  LightBulbIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from "@heroicons/react/24/solid";

const currency = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface HealthMetric {
  name: string;
  score: number; // 0-100
  status: "excellent" | "good" | "warning" | "critical";
  message: string;
  action?: string;
  impact: "high" | "medium" | "low";
}

export default function FinancialHealthWidget() {
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

  const healthMetrics = React.useMemo<HealthMetric[]>(() => {
    const metrics: HealthMetric[] = [];
    
    // Calculate averages from last 3 months
    const recentMonths = summary?.data?.slice(-3) || [];
    const avgIncome = recentMonths.reduce((sum: number, m: any) => sum + (m.income || 0), 0) / Math.max(1, recentMonths.length);
    const avgExpense = recentMonths.reduce((sum: number, m: any) => sum + (m.expense || 0), 0) / Math.max(1, recentMonths.length);
    const savingsRate = avgIncome > 0 ? ((avgIncome - avgExpense) / avgIncome) * 100 : 0;
    
    const netWorth = netWorthData?.summary?.netWorth || 0;
    const emergencyFundMonths = avgExpense > 0 ? netWorth / avgExpense : 0;
    
    // 1. Savings Rate
    let savingsScore = 0;
    let savingsStatus: HealthMetric["status"] = "critical";
    if (savingsRate >= 20) {
      savingsScore = 100;
      savingsStatus = "excellent";
    } else if (savingsRate >= 15) {
      savingsScore = 80;
      savingsStatus = "good";
    } else if (savingsRate >= 10) {
      savingsScore = 60;
      savingsStatus = "warning";
    } else if (savingsRate > 0) {
      savingsScore = 40;
      savingsStatus = "warning";
    } else {
      savingsScore = 20;
      savingsStatus = "critical";
    }
    
    metrics.push({
      name: "Savings Rate",
      score: savingsScore,
      status: savingsStatus,
      message: savingsRate >= 20 
        ? `Excellent! You're saving ${savingsRate.toFixed(1)}% of your income`
        : savingsRate > 0
        ? `You're saving ${savingsRate.toFixed(1)}% - aim for 20%+`
        : "You're spending more than you earn - urgent action needed",
      action: savingsRate < 20 ? "Reduce expenses or increase income to reach 20% savings rate" : undefined,
      impact: "high",
    });

    // 2. Emergency Fund
    let emergencyScore = 0;
    let emergencyStatus: HealthMetric["status"] = "critical";
    if (emergencyFundMonths >= 6) {
      emergencyScore = 100;
      emergencyStatus = "excellent";
    } else if (emergencyFundMonths >= 3) {
      emergencyScore = 75;
      emergencyStatus = "good";
    } else if (emergencyFundMonths >= 1) {
      emergencyScore = 50;
      emergencyStatus = "warning";
    } else {
      emergencyScore = 25;
      emergencyStatus = "critical";
    }
    
    metrics.push({
      name: "Emergency Fund",
      score: emergencyScore,
      status: emergencyStatus,
      message: emergencyFundMonths >= 6
        ? `Great! You have ${emergencyFundMonths.toFixed(1)} months saved`
        : emergencyFundMonths >= 3
        ? `You have ${emergencyFundMonths.toFixed(1)} months - aim for 6 months`
        : emergencyFundMonths >= 1
        ? `You have ${emergencyFundMonths.toFixed(1)} month - build to 3-6 months`
        : "No emergency fund - start saving immediately",
      action: emergencyFundMonths < 6 ? `Save ${currency.format(avgExpense * 6 - netWorth)} to reach 6 months` : undefined,
      impact: "high",
    });

    // 3. Spending Consistency
    const spendingVariance = recentMonths.length > 1 
      ? recentMonths.reduce((sum: number, m: any, i: number, arr: any[]) => {
          if (i === 0) return 0;
          return sum + Math.abs((m.expense || 0) - (arr[i-1].expense || 0));
        }, 0) / (recentMonths.length - 1)
      : 0;
    const variancePercent = avgExpense > 0 ? (spendingVariance / avgExpense) * 100 : 0;
    
    let consistencyScore = variancePercent < 10 ? 100 : variancePercent < 20 ? 75 : variancePercent < 30 ? 50 : 25;
    let consistencyStatus: HealthMetric["status"] = variancePercent < 10 ? "excellent" : variancePercent < 20 ? "good" : variancePercent < 30 ? "warning" : "critical";
    
    metrics.push({
      name: "Spending Consistency",
      score: consistencyScore,
      status: consistencyStatus,
      message: variancePercent < 10
        ? "Very consistent spending - great budgeting!"
        : variancePercent < 20
        ? "Fairly consistent - minor fluctuations"
        : "High spending variance - create a budget to stabilize",
      action: variancePercent >= 20 ? "Create a monthly budget and track spending categories" : undefined,
      impact: "medium",
    });

    // 4. Goals Progress
    const activeGoals = goals.filter((g: any) => g.status === "active");
    const goalsOnTrack = activeGoals.filter((g: any) => {
      if (!g.deadline) return true;
      const progress = g.currentAmount / g.targetAmount;
      const daysElapsed = (Date.now() - new Date(g.startDate || g.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const daysTotal = (new Date(g.deadline).getTime() - new Date(g.startDate || g.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return progress >= (daysElapsed / daysTotal);
    });
    
    const goalsScore = activeGoals.length === 0 ? 50 : (goalsOnTrack.length / activeGoals.length) * 100;
    const goalsStatus: HealthMetric["status"] = goalsScore >= 80 ? "excellent" : goalsScore >= 60 ? "good" : goalsScore >= 40 ? "warning" : "critical";
    
    metrics.push({
      name: "Goals Progress",
      score: goalsScore,
      status: goalsStatus,
      message: activeGoals.length === 0
        ? "No active goals - set financial goals to stay motivated"
        : goalsOnTrack.length === activeGoals.length
        ? `All ${activeGoals.length} goals on track!`
        : `${goalsOnTrack.length} of ${activeGoals.length} goals on track`,
      action: activeGoals.length === 0 ? "Create a savings or spending goal" : goalsScore < 80 ? "Review goals and adjust contributions" : undefined,
      impact: "medium",
    });

    return metrics;
  }, [summary, netWorthData, goals]);

  const overallScore = React.useMemo(() => {
    const total = healthMetrics.reduce((sum, m) => {
      const weight = m.impact === "high" ? 3 : m.impact === "medium" ? 2 : 1;
      return sum + (m.score * weight);
    }, 0);
    const totalWeight = healthMetrics.reduce((sum, m) => {
      return sum + (m.impact === "high" ? 3 : m.impact === "medium" ? 2 : 1);
    }, 0);
    return totalWeight > 0 ? Math.round(total / totalWeight) : 0;
  }, [healthMetrics]);

  const overallStatus: HealthMetric["status"] = overallScore >= 80 ? "excellent" : overallScore >= 60 ? "good" : overallScore >= 40 ? "warning" : "critical";
  
  const topActions = healthMetrics
    .filter(m => m.action && m.status !== "excellent")
    .sort((a, b) => {
      const impactOrder = { high: 3, medium: 2, low: 1 };
      return impactOrder[b.impact] - impactOrder[a.impact];
    })
    .slice(0, 3);

  const getStatusColor = (status: HealthMetric["status"]) => {
    switch (status) {
      case "excellent": return "text-green-400 bg-green-400/10 ring-green-400/20";
      case "good": return "text-blue-400 bg-blue-400/10 ring-blue-400/20";
      case "warning": return "text-yellow-400 bg-yellow-400/10 ring-yellow-400/20";
      case "critical": return "text-red-400 bg-red-400/10 ring-red-400/20";
    }
  };

  const getStatusIcon = (status: HealthMetric["status"]) => {
    switch (status) {
      case "excellent": return <CheckCircleIcon className="w-5 h-5" />;
      case "good": return <ArrowTrendingUpIcon className="w-5 h-5" />;
      case "warning": return <ExclamationTriangleIcon className="w-5 h-5" />;
      case "critical": return <ArrowTrendingDownIcon className="w-5 h-5" />;
    }
  };

  return (
    <GlassCard className="p-4 md:p-6">
      <div className="mb-4 md:mb-6">
        <h3 className="text-base md:text-lg font-semibold text-[var(--text-primary)] mb-2">Financial Health Score</h3>
        <div className="flex items-center gap-3 md:gap-4">
          <div className={`text-3xl md:text-4xl font-bold ${getStatusColor(overallStatus).split(" ")[0]}`}>
            {overallScore}
          </div>
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(overallStatus)}`}>
              {getStatusIcon(overallStatus)}
              {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
            </div>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {overallScore >= 80 
                ? "You're in great financial shape!"
                : overallScore >= 60
                ? "Good foundation, room for improvement"
                : overallScore >= 40
                ? "Some areas need attention"
                : "Urgent action needed"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {healthMetrics.map((metric, idx) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="rounded-lg bg-[var(--btn-bg)] border border-[var(--widget-border)] p-2 md:p-3"
          >
            <div className="flex items-start justify-between gap-2 md:gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs md:text-sm font-medium text-[var(--text-primary)]">{metric.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(metric.status)}`}>
                    {metric.score}/100
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{metric.message}</p>
              </div>
              <div className={`${getStatusColor(metric.status).split(" ")[0]}`}>
                {getStatusIcon(metric.status)}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {topActions.length > 0 && (
        <div className="border-t border-[var(--widget-border)] pt-4">
          <div className="flex items-center gap-2 mb-3">
            <LightBulbIcon className="w-5 h-5 text-[var(--positive)]" />
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Top Priorities</h4>
          </div>
          <div className="space-y-2">
            {topActions.map((action, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
                className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
              >
                <span className="text-[var(--positive)] mt-0.5">•</span>
                <span>{action.action}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
