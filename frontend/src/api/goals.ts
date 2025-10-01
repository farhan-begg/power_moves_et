import { http, auth } from "./http";

/* ========= Types ========= */
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
  date?: string;                   // ISO
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

/* ========= Endpoints ========= */

// List
export const fetchGoals = async (
  token: string,
  params?: { type?: string; status?: string }
): Promise<Goal[]> => {
  const qs = params ? `?${new URLSearchParams(params as any).toString()}` : "";
  const { data } = await http.get(`/goals${qs}`, auth(token));
  return Array.isArray(data) ? data : [];
};

// Create
export const createGoal = async (
  token: string,
  body: Pick<Goal, "name" | "type" | "targetAmount" | "currency"> &
        Partial<Pick<Goal, "startDate" | "deadline" | "recurrence" | "linkages">>
): Promise<Goal> => {
  const { data } = await http.post(`/goals`, body, auth(token));
  return data;
};

// Update (partial)
export const updateGoal = async (
  token: string,
  id: string,
  patch: Partial<Omit<Goal, "_id" | "createdAt" | "updatedAt">>
): Promise<Goal> => {
  const { data } = await http.patch(`/goals/${id}`, patch, auth(token));
  return data;
};

// Delete
export const deleteGoal = async (token: string, id: string): Promise<{ ok: true }> => {
  const { data } = await http.delete(`/goals/${id}`, auth(token));
  return data;
};

// Add contribution
export const addGoalContribution = async (
  token: string,
  id: string,
  contrib: Contribution
): Promise<Goal> => {
  const { data } = await http.post(`/goals/${id}/contributions`, contrib, auth(token));
  return data;
};

// Recalculate cache
export const recalcGoal = async (token: string, id: string): Promise<Goal> => {
  const { data } = await http.post(`/goals/${id}/recalculate`, {}, auth(token));
  return data;
};

// Rollover (spending_limit)
export const rolloverGoal = async (token: string, id: string): Promise<Goal> => {
  const { data } = await http.post(`/goals/${id}/rollover`, {}, auth(token));
  return data;
};
