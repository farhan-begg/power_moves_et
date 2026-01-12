// frontend/src/api/netWorthProjection.ts
import { http, auth } from "./http";

export interface NetWorthHistoryPoint {
  date: string;
  netWorth: number;
  income: number;
  expense: number;
  cashflow: number;
}

export interface NetWorthHistoryResponse {
  data: NetWorthHistoryPoint[];
  currentNetWorth: number;
}

export interface CategoryExpense {
  category: string;
  total: number;
  count: number;
  avgAmount: number;
  monthlyAvg: number;
}

export interface CategoriesResponse {
  categories: CategoryExpense[];
}

export async function fetchNetWorthHistory(
  token: string,
  params?: {
    startDate?: string;
    endDate?: string;
    granularity?: "day" | "month" | "week";
    accountId?: string;
    accountIds?: string;
    accountIdsCsv?: string;
  }
): Promise<NetWorthHistoryResponse> {
  const { data } = await http.get<NetWorthHistoryResponse>(
    "/net-worth-projection/history",
    {
      ...auth(token),
      params,
    }
  );
  return data;
}

export async function fetchExpenseCategories(
  token: string,
  params?: {
    startDate?: string;
    endDate?: string;
    accountId?: string;
    accountIds?: string;
    accountIdsCsv?: string;
  }
): Promise<CategoriesResponse> {
  const { data } = await http.get<CategoriesResponse>(
    "/net-worth-projection/categories",
    {
      ...auth(token),
      params,
    }
  );
  return data;
}
