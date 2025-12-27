// src/hooks/transactionsHooks.ts
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";
import {
  fetchTransactions,
  fetchSummary,
  fetchTopCategories,
  fetchTopMerchants,
  fetchLargestExpenses,
  fetchBurnRate,
  type PagedTransactionsResponse,
  type TransactionsQuery,
  type SummaryResponse,
  type TopCategoryRow,
  type TopMerchantRow,
  type LargestExpenseRow,
  type BurnRateResponse,
  type Granularity,
} from "../api/transaction";

export type TxnFilter = "all" | "income" | "expense";

/* --------------------------------------------
   Account sanitizing (important)
-------------------------------------------- */

const BAD = new Set([
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

function normAccountId(v?: string) {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (BAD.has(s) || BAD.has(s.toUpperCase())) return undefined;
  return s;
}

function normAccountIdsCsv(v?: string) {
  if (!v) return undefined;
  const raw = String(v).trim();
  if (!raw) return undefined;
  if (BAD.has(raw) || BAD.has(raw.toUpperCase())) return undefined;

  const ids = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x && !BAD.has(x) && !BAD.has(x.toUpperCase()));

  const deduped = Array.from(new Set(ids));
  return deduped.length ? deduped.join(",") : undefined;
}

/* --------------------------------------------
   Recent / paged transactions
-------------------------------------------- */

export function useRecentTransactions(params: {
  filter?: TxnFilter;
  startDate?: string; // UTC ISO inclusive
  endDate?: string; // UTC ISO exclusive
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);

  const filter = params.filter ?? "all";
  const startDate = params.startDate;
  const endDate = params.endDate;
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const sortBy = params.sortBy ?? "date";
  const order = params.order ?? "desc";

  const accountId = normAccountId(params.accountId);
  const accountIdsCsv = normAccountIdsCsv(params.accountIdsCsv);

  return useQuery<PagedTransactionsResponse>({
    queryKey: [
      "transactions",
      "list",
      filter,
      startDate || "",
      endDate || "",
      page,
      limit,
      sortBy,
      order,
      accountId || "",
      accountIdsCsv || "",
    ],
    queryFn: () =>
      fetchTransactions(token!, {
        type: filter === "all" ? undefined : filter,
        startDate,
        endDate,
        page,
        limit,
        sortBy,
        order,
        ...(accountId ? { accountId } : {}),
        ...(accountIdsCsv ? { accountIds: accountIdsCsv } : {}),
      } as TransactionsQuery),
    enabled: !!token && !!startDate && !!endDate,
    staleTime: 30_000,

    // ✅ React Query v5 replacement for keepPreviousData
    placeholderData: (prev) => prev,
  });
}

/* --------------------------------------------
   Summary (chart)
-------------------------------------------- */

export function useTxnSummary(params: {
  granularity: Granularity;
  startDate?: string; // UTC ISO inclusive
  endDate?: string; // UTC ISO exclusive
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);

  const granularity = params.granularity;
  const startDate = params.startDate;
  const endDate = params.endDate;

  const accountId = normAccountId(params.accountId);
  const accountIdsCsv = normAccountIdsCsv(params.accountIdsCsv);

  return useQuery<SummaryResponse>({
    queryKey: [
      "transactions",
      "summary",
      granularity,
      startDate || "",
      endDate || "",
      accountId || "",
      accountIdsCsv || "",
    ],
    queryFn: ({ signal }) =>
      fetchSummary(
        token!,
        {
          granularity,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
          ...(accountId ? { accountId } : {}),
          ...(accountIdsCsv ? { accountIds: accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token && (!!startDate || !!endDate),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

/* --------------------------------------------
   Insights
-------------------------------------------- */

export function useTopCategories(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);

  const startDate = params.startDate;
  const endDate = params.endDate;
  const limit = params.limit ?? 5;
  const accountId = normAccountId(params.accountId);
  const accountIdsCsv = normAccountIdsCsv(params.accountIdsCsv);

  return useQuery<TopCategoryRow[]>({
    queryKey: [
      "transactions",
      "insights",
      "top-categories",
      startDate || "",
      endDate || "",
      limit,
      accountId || "",
      accountIdsCsv || "",
    ],
    queryFn: ({ signal }) =>
      fetchTopCategories(
        token!,
        {
          startDate,
          endDate,
          limit,
          ...(accountId ? { accountId } : {}),
          ...(accountIdsCsv ? { accountIds: accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useTopMerchants(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);

  const startDate = params.startDate;
  const endDate = params.endDate;
  const limit = params.limit ?? 5;
  const accountId = normAccountId(params.accountId);
  const accountIdsCsv = normAccountIdsCsv(params.accountIdsCsv);

  return useQuery<TopMerchantRow[]>({
    queryKey: [
      "transactions",
      "insights",
      "top-merchants",
      startDate || "",
      endDate || "",
      limit,
      accountId || "",
      accountIdsCsv || "",
    ],
    queryFn: ({ signal }) =>
      fetchTopMerchants(
        token!,
        {
          startDate,
          endDate,
          limit,
          ...(accountId ? { accountId } : {}),
          ...(accountIdsCsv ? { accountIds: accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useLargestExpenses(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);

  const startDate = params.startDate;
  const endDate = params.endDate;
  const limit = params.limit ?? 5;
  const accountId = normAccountId(params.accountId);
  const accountIdsCsv = normAccountIdsCsv(params.accountIdsCsv);

  return useQuery<LargestExpenseRow[]>({
    queryKey: [
      "transactions",
      "insights",
      "largest",
      startDate || "",
      endDate || "",
      limit,
      accountId || "",
      accountIdsCsv || "",
    ],
    queryFn: ({ signal }) =>
      fetchLargestExpenses(
        token!,
        {
          startDate,
          endDate,
          limit,
          ...(accountId ? { accountId } : {}),
          ...(accountIdsCsv ? { accountIds: accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useBurnRate(params: {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);

  const startDate = params.startDate;
  const endDate = params.endDate;
  const accountId = normAccountId(params.accountId);
  const accountIdsCsv = normAccountIdsCsv(params.accountIdsCsv);

  return useQuery<BurnRateResponse>({
    queryKey: [
      "transactions",
      "insights",
      "burn-rate",
      startDate || "",
      endDate || "",
      accountId || "",
      accountIdsCsv || "",
    ],
    queryFn: ({ signal }) =>
      fetchBurnRate(
        token!,
        {
          startDate,
          endDate,
          ...(accountId ? { accountId } : {}),
          ...(accountIdsCsv ? { accountIds: accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
