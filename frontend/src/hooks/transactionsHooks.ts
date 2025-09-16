// src/hooks/transactionHooks.ts
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

/** Recent/paged transactions (date-bounded) */
export function useRecentTransactions(params: {
  filter?: TxnFilter;
  startDate?: string; // UTC ISO inclusive
  endDate?: string;   // UTC ISO exclusive
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: "asc" | "desc";
  accountId?: string;   // optional single
  accountIdsCsv?: string; // optional CSV for multi
}) {
  const token = useSelector((s: RootState) => s.auth.token);
  const {
    filter = "all",
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = "date",
    order = "desc",
    accountId,
    accountIdsCsv,
  } = params;

  return useQuery<PagedTransactionsResponse>({
    queryKey: [
      "transactions",
      {
        filter,
        startDate,
        endDate,
        page,
        limit,
        sortBy,
        order,
        accountId: accountId ?? "ALL",
        accountIdsCsv: accountIdsCsv ?? "NONE",
      },
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
  });
}

/** Income/Expense summary for chart */
export function useTxnSummary(params: {
  granularity: Granularity;
  startDate?: string; // UTC ISO inclusive
  endDate?: string;   // UTC ISO exclusive
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);
  const { granularity, startDate, endDate, accountId, accountIdsCsv } = params;

  return useQuery<SummaryResponse>({
    queryKey: [
      "summary",
      granularity,
      startDate ?? null,
      endDate ?? null,
      accountId ?? "ALL",
      accountIdsCsv ?? "NONE",
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
    placeholderData: (p) => p as any,
  });
}

/** Top expense categories */
export function useTopCategories(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);
  return useQuery<TopCategoryRow[]>({
    queryKey: ["insights", "top-categories", params],
    queryFn: ({ signal }) =>
      fetchTopCategories(
        token!,
        {
          ...params,
          ...(params.accountId ? { accountId: params.accountId } : {}),
          ...(params.accountIdsCsv ? { accountIds: params.accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
  });
}

/** Top merchants by expense */
export function useTopMerchants(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);
  return useQuery<TopMerchantRow[]>({
    queryKey: ["insights", "top-merchants", params],
    queryFn: ({ signal }) =>
      fetchTopMerchants(
        token!,
        {
          ...params,
          ...(params.accountId ? { accountId: params.accountId } : {}),
          ...(params.accountIdsCsv ? { accountIds: params.accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
  });
}

/** Largest single expenses */
export function useLargestExpenses(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);
  return useQuery<LargestExpenseRow[]>({
    queryKey: ["insights", "largest-expenses", params],
    queryFn: ({ signal }) =>
      fetchLargestExpenses(
        token!,
        {
          ...params,
          ...(params.accountId ? { accountId: params.accountId } : {}),
          ...(params.accountIdsCsv ? { accountIds: params.accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
  });
}

/** Burn-rate KPIs (avg daily + projected monthly) */
export function useBurnRate(params: {
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountIdsCsv?: string;
}) {
  const token = useSelector((s: RootState) => s.auth.token);
  return useQuery<BurnRateResponse>({
    queryKey: ["insights", "burn-rate", params],
    queryFn: ({ signal }) =>
      fetchBurnRate(
        token!,
        {
          ...params,
          ...(params.accountId ? { accountId: params.accountId } : {}),
          ...(params.accountIdsCsv ? { accountIds: params.accountIdsCsv } : {}),
        },
        signal
      ),
    enabled: !!token,
    staleTime: 60_000,
  });
}
