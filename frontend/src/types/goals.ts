export type GoalType =
  | "savings"
  | "emergency_fund"
  | "spending_limit"
  | "debt_paydown"
  | "investment"
  | "custom";

export type GoalStatus = "active" | "paused" | "completed" | "failed";

export interface Contribution {
  _id?: string;
  amount: number;
  date?: string;
  source?: "manual" | "auto";
  note?: string;
  txIds?: string[];
}

export interface Goal {
  _id: string;
  userId?: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currency: string;
  currentAmount: number;
  startDate?: string;
  deadline?: string;
  recurrence?: { freq: "none" | "weekly" | "monthly" | "quarterly" | "yearly"; anchorDay?: number };
  linkages?: { accountIds?: string[]; categories?: string[]; direction?: "income" | "expense"; aggregator?: "sum" | "net" };
  contributions: Contribution[];
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}
