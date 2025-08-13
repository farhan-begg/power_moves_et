// src/components/widgets/TransactionsListWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";
import {
  fetchTransactions,
  Transaction,
  PagedTransactionsResponse,
} from "../../api/transaction";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

type Filter = "all" | "expense" | "income";

const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function lastNDaysISO(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function TransactionsListWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { startDate, endDate } = React.useMemo(() => lastNDaysISO(30), []);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [page, setPage] = React.useState(1);
  const limit = 6;

  React.useEffect(() => setPage(1), [filter, startDate, endDate]);

  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
  });

  const { data: txRes, isLoading, isError, isFetching } = useQuery<PagedTransactionsResponse>({
    queryKey: ["transactions", "list", filter, startDate, endDate, page, limit],
    queryFn: () =>
      fetchTransactions(token!, {
        type: filter === "all" ? undefined : filter,
        startDate,
        endDate,
        page,
        limit,
        sortBy: "date",
        order: "desc",
      }),
    enabled: !!token,
    placeholderData: (prev) => prev,
  });

  const transactions: Transaction[] = txRes?.transactions ?? [];
  const total = txRes?.total ?? 0;
  const pages = txRes?.pages ?? 1;

  const accMap = React.useMemo(() => {
    const m = new Map<string, string>();
    (accounts || []).forEach((a: any) => {
      m.set(a.account_id, a.name || a.official_name || a.subtype || "Bank");
    });
    return m;
  }, [accounts]);

  const bankNameFor = (t: any) =>
    t.accountName ||
    (t.accountId && accMap.get(t.accountId)) ||
    (t.account_id && accMap.get(t.account_id)) ||
    "";

  const RowIcon = ({ type }: { type: "income" | "expense" }) =>
    type === "expense" ? (
      <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/20">
        <ArrowDownRightIcon className="h-5 w-5" />
      </div>
    ) : (
      <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20">
        <ArrowUpRightIcon className="h-5 w-5" />
      </div>
    );

  const FilterPill = ({ label, value }: { label: string; value: Filter }) => {
    const active = filter === value;
    const base = "px-3 py-1.5 rounded-full text-sm transition-all border backdrop-blur";
    const styles = active
      ? value === "income"
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
        : value === "expense"
        ? "bg-rose-500/15 text-rose-300 border-rose-400/30"
        : "bg-white/10 text-white border-white/20"
      : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10";
    return (
      <button onClick={() => setFilter(value)} className={`${base} ${styles}`}>
        {label}
      </button>
    );
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className={glass}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          <div className="text-xs text-white/60">
            {startDate} → {endDate}
            {isFetching && <span className="ml-2 text-white/40">(updating…)</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FilterPill label="All" value="all" />
          <FilterPill label="Spending" value="expense" />
          <FilterPill label="Income" value="income" />
        </div>
      </div>

      {isLoading && <p className="text-white/70">Loading…</p>}
      {isError && <p className="text-rose-300">Failed to load transactions.</p>}

      {!isLoading && !isError && transactions.length === 0 && (
        <div className="text-white/70">No results for this filter.</div>
      )}

      {!isLoading && !isError && transactions.length > 0 && (
        <>
          <ul className="divide-y divide-white/10">
            {transactions.map((t) => {
              const bank = bankNameFor(t);
              const isExpense = t.type === "expense";
              const actionLabel = isExpense ? "withdraw" : "deposit";
              const amountText = `${isExpense ? "-" : "+"}${money(t.amount)}`;

              return (
                <li key={t._id} className="py-3 flex items-center gap-4">
                  <RowIcon type={t.type} />

                  <div className="flex-1 min-w-0">
                    {/* Top row: merchant/description bold + amount right-aligned */}
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="truncate font-semibold text-white">
                        {t.description || t.category || "Transaction"}
                      </div>
                      <div
                        className={`shrink-0 font-mono tabular-nums ${
                          isExpense ? "text-rose-300" : "text-emerald-300"
                        }`}
                      >
                        {amountText}
                      </div>
                    </div>

                    {/* Sub row: small bank + tiny action badge + date */}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/60">
                      {bank && <span className="truncate">{bank}</span>}
                      <span className="text-white/30">•</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full uppercase tracking-wide text-[10px] ring-1 ${
                          isExpense
                            ? "bg-rose-400/10 text-rose-300 ring-rose-400/20"
                            : "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20"
                        }`}
                      >
                        {actionLabel}
                      </span>
                      <span className="text-white/30">•</span>
                      <span>{new Date(t.date).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="text-[10px] px-2 py-1 rounded-full bg-white/5 ring-1 ring-white/10 text-white/60 shrink-0">
                    {t.source === "plaid" ? "Plaid" : "Manual"}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-white/60">
              Showing <span className="text-white">{from}</span>–<span className="text-white">{to}</span> of{" "}
              <span className="text-white">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/80 disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Prev
              </button>
              <div className="text-xs text-white/70">
                Page <span className="text-white">{page}</span> / <span className="text-white">{pages}</span>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/80 disabled:opacity-40"
              >
                Next
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
