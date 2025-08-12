// src/api/transaction.ts
import axios from "axios";

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
  date: string; // ISO string
  description?: string;
  source: SourceType;
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
};

export interface CategoryStatRow {
  category: string;
  income: number;
  incomeCount: number;
  expense: number;
  expenseCount: number;
}

export interface SummaryPoint {
  period: string; // e.g. 2025-08 or 2025-08-07
  income: number;
  expense: number;
  net: number;
}

export interface SummaryResponse {
  granularity: Granularity;
  data: SummaryPoint[];
}

/** Axios helper */
const authHeader = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

/** ------------------ Endpoints ------------------ */

/** Get transactions (paged + filters) */
export const fetchTransactions = async (
  token: string,
  params: { page?: number; limit?: number; type?: "income"|"expense"; category?: string; source?: "manual"|"plaid" } = {}
) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null) as [string,string][]);
  const url = qs.toString() ? `/api/transactions?${qs.toString()}` : "/api/transactions";
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }});
  return res.data;
};
/** Add a transaction (manual) */
export const addTransaction = async (
  token: string,
  data: Omit<Transaction, "_id" | "userId" | "createdAt" | "updatedAt" | "source"> & {
    date?: string;
  }
) => {
  const res = await axios.post<Transaction>("/api/transactions", data, authHeader(token));
  return res.data;
};

/** Update a transaction */
export const updateTransaction = async (
  token: string,
  id: string,
  data: Partial<Pick<Transaction, "type" | "category" | "amount" | "date" | "description">>
) => {
  const res = await axios.put<Transaction>(`/api/transactions/${id}`, data, authHeader(token));
  return res.data;
};

/** Delete a transaction */
export const deleteTransaction = async (token: string, id: string) => {
  const res = await axios.delete<{ message: string; id: string }>(
    `/api/transactions/${id}`,
    authHeader(token)
  );
  return res.data;
};

/** Category stats (income vs expense per category) */
export const fetchCategoryStats = async (
  token: string,
  params: { startDate?: string; endDate?: string } = {},
  signal?: AbortSignal
): Promise<CategoryStatRow[]> => {
  const res = await axios.get<CategoryStatRow[]>("/api/transactions/stats", {
    ...authHeader(token),
    params,
    signal,
  });
  return res.data;
};

/** Time-series summary (income/expense/net) */
export const fetchSummary = async (
  token: string,
  params: { granularity: Granularity; startDate?: string; endDate?: string },
  signal?: AbortSignal
): Promise<SummaryResponse> => {
  const res = await axios.get<SummaryResponse>("/api/transactions/summary", {
    ...authHeader(token),
    params,
    signal,
  });
  return res.data;
};
