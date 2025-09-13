import { useQuery } from "@tanstack/react-query";
import { http, auth } from "../api/http";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";

export type Txn = {
  _id: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  description?: string;
  source: "manual" | "plaid";
  category?: string;

  accountId?: string;
  accountName?: string;

  // recurring links (server/model supports these)
  matchedRecurringId?: string | null;
  matchedBillId?: string | null;
  matchedPaycheckId?: string | null;
  matchConfidence?: number | null;
};

export type PagedTxnResponse = {
  total: number;
  page: number;
  pages: number;
  transactions: Txn[];
};

export type TxnFilter =
  | "all"
  | "income"
  | "expense";

export function useRecentTransactions(params: {
  filter?: TxnFilter;              // "all" | "income" | "expense"
  startDate?: string;              // ISO (yyyy-mm-dd) start inclusive
  endDate?: string;                // ISO (yyyy-mm-dd) end-exclusive
  page?: number;
  limit?: number;
  sortBy?: string;                 // default "date"
  order?: "asc" | "desc";          // default "desc"
  accountId?: string;              // optional
}) {
  const {
    filter = "all",
    startDate,
    endDate,
    page = 1,
    limit = 20,
    sortBy = "date",
    order = "desc",
    accountId,
  } = params;

  const token = useSelector((s: RootState) => s.auth.token);

  return useQuery<PagedTxnResponse>({
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
      },
    ],
    queryFn: async () => {
    const { data } = await http.get<PagedTxnResponse>("/api/transactions", {
  ...auth(token ?? undefined), // 👈 convert null → undefined
        params: {
          type: filter === "all" ? undefined : filter,
          startDate,
          endDate,
          page,
          limit,
          sortBy,
          order,
          accountId,
        },
      });
      return data;
    },
    enabled: !!token && !!startDate && !!endDate,
    staleTime: 30_000,
  });
}
