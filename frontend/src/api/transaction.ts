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
  date: string; // ISO (UTC instant) stored in DB
  description?: string;
  source: SourceType;
  accountId?: string;
  accountName?: string;
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

  /** UTC ISO inclusive start (from helpers/toIsoStartEndExclusive) */
  startDate?: string;

  /** UTC ISO exclusive end (from helpers/toIsoStartEndExclusive) */
  endDate?: string;

  sortBy?: string;
  order?: "asc" | "desc";

  /** Single account filter */
  accountId?: string;
  /** Multiple accounts (CSV) */
  accountIds?: string;
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

export const fetchTransactions = async (
  token: string,
  params: TransactionsQuery = {}
): Promise<PagedTransactionsResponse> => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  ) as [string, string][];

  const qs = new URLSearchParams(entries).toString();
  const url = qs ? `/api/transactions?${qs}` : "/api/transactions";

  // 🔊
  console.log("%c[HTTP] GET " + url, "color:#34d399;font-weight:bold");

  const { data } = await http.get<PagedTransactionsResponse>(url, auth(token));
  return data;
};


// Add a manual transaction. `date` should be local YYYY-MM-DD.
export const addTransaction = async (
  token: string,
  data: Omit<Transaction, "_id" | "userId" | "createdAt" | "updatedAt" | "source"> & {
    date?: string; // local YYYY-MM-DD
  }
) => {
  const res = await http.post<Transaction>("/api/transactions", data, auth(token));
  return res.data;
};

export const updateTransaction = async (
  token: string,
  id: string,
  data: Partial<
    Pick<
      Transaction,
      "type" | "category" | "amount" | "date" | "description" | "accountId" | "accountName"
    >
  >
) => {
  const res = await http.put<Transaction>(`/api/transactions/${id}`, data, auth(token));
  return res.data;
};

export const deleteTransaction = async (token: string, id: string) => {
  const res = await http.delete<{ message: string; id: string }>(
    `/api/transactions/${id}`,
    auth(token)
  );
  return res.data;
};

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

export const fetchSummary = async (
  token: string,
  params: {
    granularity: Granularity;
    startDate?: string;   // inclusive UTC ISO
    endDate?: string;     // exclusive UTC ISO
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
