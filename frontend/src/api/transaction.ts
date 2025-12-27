// src/api/transactions.ts   (or src/transaction.ts if that's your file name)
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
  categoryId?: string;

  amount: number;
  date: string; // ISO string
  description?: string;
  source: SourceType;

  accountId?: string;
  accountName?: string;

  plaidTxId?: string | null;

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
  category?: string;
  source?: "manual" | "plaid";

  /** UTC ISO inclusive start */
  startDate?: string;
  /** UTC ISO exclusive end */
  endDate?: string;

  sortBy?: string;
  order?: "asc" | "desc";

  accountId?: string;   // single
  accountIds?: string;  // CSV
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
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountIds?: string;
};

export interface TopCategoryRow {
  category: string;
  spend: number;
  count: number;
}
export interface TopMerchantRow {
  merchant: string;
  spend: number;
  count: number;
}
export interface LargestExpenseRow {
  date: string;
  amount: number;
  merchant: string;
  category: string;
}
export interface BurnRateResponse {
  avgDaily: number;
  projectedMonthly: number;
  daysCounted: number;
  total: number;
}

/** ------------------ Param Sanitizers ------------------ */

// Anything in here must NEVER be sent to backend as an account filter.
const BAD_ACCOUNT = new Set([
  "__all__",
  "__all_accounts__",
  "all",
  "ALL",
  "undefined",
  "UNDEFINED",
  "null",
  "NULL",
  "",
]);

function isBadAccountValue(v: unknown) {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  if (!s) return true;
  if (BAD_ACCOUNT.has(s)) return true;
  if (BAD_ACCOUNT.has(s.toUpperCase())) return true;
  return false;
}

/**
 * Removes:
 * - undefined/null/"" params
 * - accountId/accountIds when they’re "ALL"/sentinels
 * - normalizes accountIds CSV (dedupe, strips bad)
 */
function sanitizeParams<T extends Record<string, any>>(params?: T): Partial<T> {
  const out: Record<string, any> = {};
  if (!params) return out as Partial<T>;

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;

    // accountId special-case
    if (k === "accountId") {
      if (isBadAccountValue(v)) continue;
      out[k] = String(v).trim();
      continue;
    }

    // accountIds special-case
    if (k === "accountIds") {
      if (isBadAccountValue(v)) continue;

      const ids = String(v)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !isBadAccountValue(s));

      const deduped = Array.from(new Set(ids));
      if (!deduped.length) continue;

      out[k] = deduped.join(",");
      continue;
    }

    out[k] = v;
  }

  return out as Partial<T>;
}

/** Pretty log for debugging the *actual* outgoing request */
function logGet(url: string, params?: Record<string, any>) {
  const qs = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : "";
  const full = qs ? `${url}?${qs}` : url;
  console.log("%c[HTTP] GET " + full, "color:#34d399;font-weight:bold");
}

/** ------------------ Endpoints ------------------ */

export const fetchTransactions = async (
  token: string,
  params: TransactionsQuery = {}
): Promise<PagedTransactionsResponse> => {
  const clean = sanitizeParams(params);
  logGet("/transactions", clean as any);

  const { data } = await http.get<PagedTransactionsResponse>("/transactions", {
    ...auth(token),
    params: clean,
  });
  return data;
};

export const addTransaction = async (
  token: string,
  data: {
    type: TxnType;
    amount: number;
    date: string; // local YYYY-MM-DD
    description?: string;
    categoryId?: string;
    category?: string;
    source: SourceType;
    accountId?: string;
    accountName?: string;
    plaidTxId?: string | null;
  }
) => {
  const res = await http.post<Transaction>("/transactions", data, auth(token));
  return res.data;
};

export const updateTransaction = async (
  token: string,
  id: string,
  data: Partial<{
    type: TxnType;
    amount: number;
    date: string;
    description: string;

    categoryId: string | null;
    category: string;

    accountId: string | null;
    accountName: string | null;

    manualAccountName: string;
    manualAccountCurrency: string;

    plaidTxId: string | null;

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
  const clean = sanitizeParams(params);
  logGet("/transactions/stats", clean as any);

  const { data } = await http.get<CategoryStatRow[]>("/transactions/stats", {
    ...auth(token),
    params: clean,
    signal,
  });
  return data;
};

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
  const clean = sanitizeParams(params);
  logGet("/transactions/summary", clean as any);

  const { data } = await http.get<SummaryResponse>("/transactions/summary", {
    ...auth(token),
    params: clean,
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

export const fetchTopCategories = async (
  token: string,
  params: InsightsRangeParams & { limit?: number } = {},
  signal?: AbortSignal
): Promise<TopCategoryRow[]> => {
  const clean = sanitizeParams(params);
  logGet("/transactions/insights/top-categories", clean as any);

  const { data } = await http.get<{ rows: TopCategoryRow[] }>(
    "/transactions/insights/top-categories",
    { ...auth(token), params: clean, signal }
  );
  return data.rows;
};

export const fetchTopMerchants = async (
  token: string,
  params: InsightsRangeParams & { limit?: number } = {},
  signal?: AbortSignal
): Promise<TopMerchantRow[]> => {
  const clean = sanitizeParams(params);
  logGet("/transactions/insights/top-merchants", clean as any);

  const { data } = await http.get<{ rows: TopMerchantRow[] }>(
    "/transactions/insights/top-merchants",
    { ...auth(token), params: clean, signal }
  );
  return data.rows;
};

export const fetchLargestExpenses = async (
  token: string,
  params: InsightsRangeParams & { limit?: number } = {},
  signal?: AbortSignal
): Promise<LargestExpenseRow[]> => {
  const clean = sanitizeParams(params);
  logGet("/transactions/insights/largest", clean as any);

  const { data } = await http.get<{ rows: LargestExpenseRow[] }>(
    "/transactions/insights/largest",
    { ...auth(token), params: clean, signal }
  );
  return data.rows;
};

export const fetchBurnRate = async (
  token: string,
  params: InsightsRangeParams = {},
  signal?: AbortSignal
): Promise<BurnRateResponse> => {
  const clean = sanitizeParams(params);
  logGet("/transactions/insights/burn-rate", clean as any);

  const { data } = await http.get<BurnRateResponse>(
    "/transactions/insights/burn-rate",
    { ...auth(token), params: clean, signal }
  );
  return data;
};
