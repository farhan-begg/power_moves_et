// src/api/transaction.ts
import { http, auth } from "./http";

/** ------------------ Types ------------------ */
export type SourceType = "manual" | "plaid";
export type TxnType = "income" | "expense";
export type Granularity = "day" | "month" | "year";

export interface Transaction {
  _id: string;
  userId: string;
  type: TxnType;
  category: string;
  amount: number;
  date: string; // ISO
  description?: string;
  source: SourceType;
  accountId?: string;   // 👈 make sure your backend saves this when ingesting Plaid
  accountName?: string; // optional convenience for display
  createdAt: string;
  updatedAt: string;
}

export interface PagedTransactionsResponse {
  total: number;
  page: number;
  pages: number;
  transactions: Transaction[];
  sourceBreakdown?: Record<string, number>;
}

export type TransactionsQuery = {
  page?: number;
  limit?: number;
  type?: "income" | "expense";
  category?: string;
  source?: "manual" | "plaid";
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  order?: "asc" | "desc";
  accountId?: string;   // 👈 single account filter
  accountIds?: string;  // 👈 multiple (csv: "id1,id2")
};

export interface CategoryStatRow {
  category: string;
  income: number;
  incomeCount: number;
  expense: number;
  expenseCount: number;
}

export interface SummaryPoint {
  period: string;
  income: number;
  expense: number;
  net: number;
}

export interface SummaryResponse {
  granularity: Granularity;
  data: SummaryPoint[];
}

/** ------------------ Endpoints ------------------ */

// Get transactions (paged + filters)
export const fetchTransactions = async (
  token: string,
  params: TransactionsQuery = {}
): Promise<PagedTransactionsResponse> => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  ) as [string, string][];

  const qs = new URLSearchParams(entries).toString();
  const url = qs ? `/api/transactions?${qs}` : "/api/transactions";

  const { data } = await http.get<PagedTransactionsResponse>(url, auth(token));
  return data;
};

// Add a transaction (manual)
export const addTransaction = async (
  token: string,
  data: Omit<Transaction, "_id" | "userId" | "createdAt" | "updatedAt" | "source"> & { date?: string }
) => {
  const res = await http.post<Transaction>("/api/transactions", data, auth(token));
  return res.data;
};

// Update a transaction
export const updateTransaction = async (
  token: string,
  id: string,
  data: Partial<
    Pick<Transaction, "type" | "category" | "amount" | "date" | "description" | "accountId" | "accountName">
  >
) => {
  const res = await http.put<Transaction>(`/api/transactions/${id}`, data, auth(token));
  return res.data;
};

// Delete a transaction
export const deleteTransaction = async (token: string, id: string) => {
  const res = await http.delete<{ message: string; id: string }>(
    `/api/transactions/${id}`,
    auth(token)
  );
  return res.data;
};

// Category stats (✅ now supports accountId/accountIds)
export const fetchCategoryStats = async (
  token: string,
  params: { startDate?: string; endDate?: string; accountId?: string; accountIds?: string } = {},
  signal?: AbortSignal
): Promise<CategoryStatRow[]> => {
  const { data } = await http.get<CategoryStatRow[]>("/api/transactions/stats", {
    ...auth(token),
    params,
    signal,
  });
  return data;
};

// Time-series summary (✅ now supports accountId/accountIds)
export const fetchSummary = async (
  token: string,
  params: {
    granularity: Granularity;
    startDate?: string;
    endDate?: string;
    accountId?: string;
    accountIds?: string;
  },
  signal?: AbortSignal
): Promise<SummaryResponse> => {
  const { data } = await http.get<SummaryResponse>("/api/transactions/summary", {
    ...auth(token),
    params,
    signal,
  });
  return data;
};
