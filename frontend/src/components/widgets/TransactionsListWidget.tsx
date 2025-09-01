// src/components/widgets/TransactionsListWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
type Preset = "7d" | "30d" | "90d" | "ytd" | "1y" | "custom";

type PlaidAccount = {
  account_id?: string;
  accountId?: string;
  id?: string;
  name?: string;
  official_name?: string | null;
  subtype?: string | null;
  mask?: string | null;
};

const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const toISO = (d: Date) => {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString().slice(0, 10);
};

function presetRange(p: Preset) {
  const today = new Date();
  const endDate = toISO(today);

  switch (p) {
    case "7d": {
      const s = new Date(today);
      s.setDate(s.getDate() - 6);
      return { startDate: toISO(s), endDate };
    }
    case "30d": {
      const s = new Date(today);
      s.setDate(s.getDate() - 29);
      return { startDate: toISO(s), endDate };
    }
    case "90d": {
      const s = new Date(today);
      s.setDate(s.getDate() - 89);
      return { startDate: toISO(s), endDate };
    }
    case "ytd": {
      const s = new Date(today.getFullYear(), 0, 1);
      return { startDate: toISO(s), endDate };
    }
    case "1y": {
      const s = new Date(today);
      s.setFullYear(s.getFullYear() - 1);
      s.setDate(s.getDate() + 1);
      return { startDate: toISO(s), endDate };
    }
    case "custom":
    default:
      return { startDate: "", endDate: "" };
  }
}

// accept only real Plaid ids; anything else means "All"
const isRealAccountId = (v?: string | null) =>
  !!v && !["__all__", "all", "undefined", "null", ""].includes(String(v));

export default function TransactionsListWidget() {
  const token = useSelector((s: RootState) => s.auth.token);

  // Global account filter from Redux (could be "__all__")
  const selectedAccountIdRaw = useSelector(
    (s: RootState) => s.accountFilter.selectedAccountId
  );

  // Normalize to undefined = All accounts
  const accountFilterId = React.useMemo(
    () => (isRealAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw : undefined),
    [selectedAccountIdRaw]
  );

  // Local filters
  const [filter, setFilter] = React.useState<Filter>("all");
  const [preset, setPreset] = React.useState<Preset>("30d");

  // Applied date range that powers the query
  const init = React.useMemo(() => presetRange("30d"), []);
  const [startDate, setStartDate] = React.useState(init.startDate);
  const [endDate, setEndDate] = React.useState(init.endDate);

  // Pending inputs for "custom" mode (edited but not yet applied)
  const [pendingStart, setPendingStart] = React.useState(init.startDate);
  const [pendingEnd, setPendingEnd] = React.useState(init.endDate);
  const [dateError, setDateError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const limit = 6;

  // Reset page when high-level filters change
  React.useEffect(() => setPage(1), [filter, startDate, endDate, accountFilterId]);

  // Update applied dates when preset changes (except custom)
  React.useEffect(() => {
    if (preset === "custom") return;
    const r = presetRange(preset);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    // sync pending with applied
    setPendingStart(r.startDate);
    setPendingEnd(r.endDate);
    setDateError(null);
  }, [preset]);

  // Accounts (used to display bank names beside rows)
  const { data: accountsRaw } = useQuery<PlaidAccount[] | { accounts: PlaidAccount[] }>({
    queryKey: ["accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,  // v5 helper
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });

  const accounts = React.useMemo<PlaidAccount[]>(() => {
    const raw = accountsRaw as unknown;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as any).accounts)) {
      return (raw as any).accounts as PlaidAccount[];
    }
    return [];
  }, [accountsRaw]);

  // Transactions (honors normalized GLOBAL account id)
  const {
    data: txRes,
    isError,
    isFetching,
  } = useQuery<PagedTransactionsResponse>({
    queryKey: [
      "transactions",
      "list",
      filter,
      startDate,
      endDate,
      page,
      limit,
      accountFilterId ?? "ALL",
    ],
    queryFn: () =>
      fetchTransactions(token!, {
        type: filter === "all" ? undefined : filter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
        sortBy: "date",
        order: "desc",
        accountId: accountFilterId, // only when real
      }),
    enabled: !!token && !!(startDate && endDate),
    placeholderData: keepPreviousData,  // v5 way to keep old data during refetch
    refetchOnWindowFocus: false,
    gcTime: 10 * 60 * 1000,
  });

  // With v5 + keepPreviousData helper, types are preserved:
  const transactions: Transaction[] = txRes?.transactions ?? [];
  const total = txRes?.total ?? 0;
  const pages = txRes?.pages ?? 1;

  const accMap = React.useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => {
      const id = a.account_id || a.accountId || a.id;
      const base = a.name || a.official_name || a.subtype || "Account";
      const mask = a.mask ? ` ••••${String(a.mask).slice(-4)}` : "";
      if (id) m.set(id, `${base}${mask}`);
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

  // Apply / Reset for custom range
  const applyCustomRange = () => {
    if (!pendingStart || !pendingEnd) return;
    if (pendingStart > pendingEnd) {
      setDateError("Start date must be before or equal to End date.");
      return;
    }
    setDateError(null);
    setStartDate(pendingStart);
    setEndDate(pendingEnd);
  };

  const resetCustomRange = () => {
    setPendingStart(startDate);
    setPendingEnd(endDate);
    setDateError(null);
  };

  return (
    <div className={glass}>
      {/* Header + controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
          <div className="text-xs text-white/60">
            {startDate} → {endDate}
          </div>
          {accountFilterId ? (
            <div className="mt-1 text-[11px] text-white/60">
              Account: <span className="text-white">{accMap.get(accountFilterId) || "Selected account"}</span>
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-white/40">All accounts</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill label="All" value="all" />
            <FilterPill label="Spending" value="expense" />
            <FilterPill label="Income" value="income" />
          </div>

          {/* Subtle updating chip (no layout jump) */}
          {isFetching && (
            <div className="ml-2 text-[11px] px-2 py-1 rounded-full bg-white/5 ring-1 ring-white/10 text-white/60">
              Updating…
            </div>
          )}
        </div>
      </div>

      {/* Date presets + custom range */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["7d", "30d", "90d", "ytd", "1y", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={[
              "px-2.5 py-1.5 rounded-md text-xs border transition-colors",
              preset === p
                ? "bg-white/15 text-white border-white/25"
                : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10",
            ].join(" ")}
          >
            {p.toUpperCase()}
          </button>
        ))}

        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded-md bg-white/10 px-2 py-1.5 text-xs text-white ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
              value={pendingStart}
              onChange={(e) => setPendingStart(e.target.value)}
            />
            <span className="text-white/50 text-xs">to</span>
            <input
              type="date"
              className="rounded-md bg-white/10 px-2 py-1.5 text-xs text-white ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
              value={pendingEnd}
              onChange={(e) => setPendingEnd(e.target.value)}
            />

            <button
              onClick={applyCustomRange}
              disabled={!pendingStart || !pendingEnd}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-40"
            >
              Apply
            </button>
            <button
              onClick={resetCustomRange}
              className="inline-flex items-center gap-2 rounded-lg bg-transparent px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
              title="Reset to applied dates"
            >
              Reset
            </button>

            {dateError && <span className="text-[11px] text-rose-300 ml-2">{dateError}</span>}
          </div>
        )}
      </div>

      {/* Error */}
      {isError && <p className="text-rose-300">Failed to load transactions.</p>}

      {/* Empty state */}
      {!isError && transactions.length === 0 && (
        <div className="text-white/70">
          No results for <b>{filter === "all" ? "all types" : filter}</b>
          {accountFilterId && (
            <> in <b>{accMap.get(accountFilterId) || "selected account"}</b></>
          )}{" "}
          between <b>{startDate}</b> and <b>{endDate}</b>.
        </div>
      )}

      {/* Results (keep rendering while fetching) */}
      {!isError && transactions.length > 0 && (
        <>
          <ul
            className="divide-y divide-white/10 transition-opacity duration-150"
            style={{ opacity: isFetching ? 0.85 : 1 }}
          >
            {transactions.map((t) => {
              const bank = bankNameFor(t);
              const isExpense = t.type === "expense";
              const actionLabel = isExpense ? "withdraw" : "deposit";
              const amountText = `${isExpense ? "-" : "+"}${money(t.amount)}`;

              return (
                <li key={t._id} className="py-3 flex items-center gap-4">
                  <RowIcon type={t.type} />

                  <div className="flex-1 min-w-0">
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
                disabled={page <= 1 || isFetching}
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
                disabled={page >= pages || isFetching}
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
