// src/transaction.ts
import { http, auth } from "./http";

/** ------------------ Types ------------------ */
export type SourceType = "manual" | "plaid";
export type TxnType = "income" | "expense";
export type Granularity = "day" | "month" | "year";

export interface Transaction {
  _id: string;
  userId: string;
  type: TxnType;

  /** Denormalized name (always present for fast reads/back-compat) */
  category: string;

  /** Normalized reference to Category (optional on old rows / when not set) */
  categoryId?: string;

  amount: number;
  date: string; // ISO string
  description?: string;
  source: SourceType;

  // Account scoping
  accountId?: string;
  accountName?: string;

  // Plaid original id (optional; present when source === 'plaid' or when we link by plaidTxId)
  plaidTxId?: string | null;

  // Recurring links (optional; set by detector or manual "match" flows)
  matchedRecurringId?: string | null;
  matchedBillId?: string | null;
  matchedPaycheckId?: string | null;
  matchConfidence?: number | null;

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
  category?: string; // backend filters by denormalized name (string)
  source?: "manual" | "plaid";

  /** UTC ISO inclusive start */
  startDate?: string;
  /** UTC ISO exclusive end */
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

/* ---------- Insights types ---------- */
export type InsightsRangeParams = {
  /** UTC ISO inclusive */
  startDate?: string;
  /** UTC ISO exclusive */
  endDate?: string;
  accountId?: string;
  accountIds?: string; // CSV
};

export interface TopCategoryRow {
  category: string;
  spend: number; // absolute summed spend
  count: number;
}
export interface TopMerchantRow {
  merchant: string;
  spend: number; // absolute summed spend
  count: number;
}
export interface LargestExpenseRow {
  date: string;      // ISO
  amount: number;    // absolute (largest by magnitude)
  merchant: string;
  category: string;
}
export interface BurnRateResponse {
  avgDaily: number;
  projectedMonthly: number;
  daysCounted: number;
  total: number;
}

/** ------------------ Helpers ------------------ */

const buildQueryString = (params: Record<string, unknown>) => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  ) as [string, string][];
  return new URLSearchParams(entries).toString();
};

const logGet = (url: string) =>
  console.log("%c[HTTP] GET " + url, "color:#34d399;font-weight:bold");

/** ------------------ Endpoints ------------------ */

export const fetchTransactions = async (
  token: string,
  params: TransactionsQuery = {}
): Promise<PagedTransactionsResponse> => {
  const qs = buildQueryString(params);
  const url = qs ? `/transactions?${qs}` : "/transactions";
  logGet(url);
  const { data } = await http.get<PagedTransactionsResponse>(url, auth(token));
  return data;
};

/**
 * Create a transaction (usually source="manual").
 * - `date` should be local YYYY-MM-DD (your backend does new Date(date))
 * - You may supply EITHER `categoryId` OR `category` (string). If both are sent,
 *   backend currently prioritizes `categoryId`.
 */
export const addTransaction = async (
  token: string,
  data: {
    type: TxnType;
    amount: number;
    date: string; // local YYYY-MM-DD
    description?: string;

    /** Prefer this when known; backend will set `category` name to match */
    categoryId?: string;

    /** Fallback name; backend will find-or-create a Category and set categoryId */
    category?: string;

    /** Usually "manual" when adding via UI */
    source: SourceType;

    /** Optional account scoping */
    accountId?: string;
    accountName?: string;

    /** Optional plaid id if you want to associate a manual row with a Plaid-origin id */
    plaidTxId?: string | null;
  }
) => {
  const res = await http.post<Transaction>("/transactions", data, auth(token));
  return res.data;
};

/**
 * Update a transaction.
 * - You can change the category by sending `categoryId` (preferred) or `category` (name).
 * - You can also re-scope to an account or clear scoping (send `accountId: ""` or null).
 * - `manualAccountName` / `manualAccountCurrency` are supported by your backend to
 *    create/find a manual account on the fly when `accountId` isn’t provided.
 */
export const updateTransaction = async (
  token: string,
  id: string,
  data: Partial<{
    type: TxnType;
    amount: number;
    date: string; // local YYYY-MM-DD or ISO
    description: string;

    // 🔽 category updates
    categoryId: string | null; // if provided, backend validates and sets both categoryId+category
    category: string;          // plain name; backend will find-or-create and set both fields

    // account scoping
    accountId: string | null;
    accountName: string | null;

    // convenience for creating/selecting manual account by name
    manualAccountName: string;
    manualAccountCurrency: string;

    // (rare) allow patching plaidTxId if you need to
    plaidTxId: string | null;

    // recurring links are typically set by backend; included for completeness
    matchedRecurringId: string | null;
    matchedBillId: string | null;
    matchedPaycheckId: string | null;
    matchConfidence: number | null;
  }>
) => {
  const res = await http.put<Transaction>(`/transactions/${id}`, data, auth(token));
  return res.data;
};

export const deleteTransaction = async (token: string, id: string) => {
  const res = await http.delete<{ message: string; id: string }>(
    `/transactions/${id}`,
    auth(token)
  );
  return res.data;
};

export const fetchCategoryStats = async (
  token: string,
  params: { startDate?: string; endDate?: string; accountId?: string; accountIds?: string } = {},
  signal?: AbortSignal
): Promise<CategoryStatRow[]> => {
  const { data } = await http.get<CategoryStatRow[]>("/transactions/stats", {
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
    startDate?: string; // inclusive UTC ISO
    endDate?: string;   // exclusive UTC ISO
    accountId?: string;
    accountIds?: string;
  },
  signal?: AbortSignal
): Promise<SummaryResponse> => {
  const { data } = await http.get<SummaryResponse>("/transactions/summary", {
    ...auth(token),
    params,
    signal,
  });
  return data;
};

export const bulkCategorize = async (
  token: string,
  payload: { ids: string[]; categoryId?: string; categoryName?: string }
): Promise<{ ok: boolean; matched: number; modified: number }> => {
  const { data } = await http.post("/transactions/bulk-categorize", payload, auth(token));
  return data;
};

/** ------------------ Insights endpoints ------------------ */

// Top categories (expenses)
export const fetchTopCategories = async (
  token: string,
  params: InsightsRangeParams & { limit?: number } = {},
  signal?: AbortSignal
): Promise<TopCategoryRow[]> => {
  const { data } = await http.get<{ rows: TopCategoryRow[] }>(
    "/transactions/insights/top-categories",
    { ...auth(token), params, signal }
  );
  return data.rows;
};

// Top merchants (by expense)
export const fetchTopMerchants = async (
  token: string,
  params: InsightsRangeParams & { limit?: number } = {},
  signal?: AbortSignal
): Promise<TopMerchantRow[]> => {
  const { data } = await http.get<{ rows: TopMerchantRow[] }>(
    "/transactions/insights/top-merchants",
    { ...auth(token), params, signal }
  );
  return data.rows;
};

// Largest single expenses
export const fetchLargestExpenses = async (
  token: string,
  params: InsightsRangeParams & { limit?: number } = {},
  signal?: AbortSignal
): Promise<LargestExpenseRow[]> => {
  const { data } = await http.get<{ rows: LargestExpenseRow[] }>(
    "/transactions/insights/largest",
    { ...auth(token), params, signal }
  );
  return data.rows;
};

// Burn-rate (avg daily + 30d projection)
export const fetchBurnRate = async (
  token: string,
  params: InsightsRangeParams = {},
  signal?: AbortSignal
): Promise<BurnRateResponse> => {
  const { data } = await http.get<BurnRateResponse>(
    "/transactions/insights/burn-rate",
    { ...auth(token), params, signal }
  );
  return data;
};
