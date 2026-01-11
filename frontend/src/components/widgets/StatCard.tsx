// src/components/widgets/StatCard.tsx
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts, fetchNetWorth } from "../../api/plaid";
import {
  fetchTransactions,
  type Transaction,
  type PagedTransactionsResponse,
} from "../../api/transaction";
import {
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  ALL_ACCOUNTS_ID,
  ALL_BANKS_ID,
  setSelectedAccount,
} from "../../features/filters/globalAccountFilterSlice";
import {
  toIsoStartEndExclusive,
  ymdToLocalDate,
  localTodayYMD,
  addDaysYMD,
} from "../../helpers/date";
import { formatMoney } from "../../utils/currency";
import { isValidAccountId } from "../../utils/accountFilter";
import { GlassCard, Pill, SkeletonCard } from "../common";

type Props = {
  title: string;
  range: { startDate: string; endDate: string }; // local YYYY-MM-DD (inclusive)
  className?: string;
  mode?: "cashflow" | "networth";
  showAccountSelect?: boolean;
};

type AccountLike = {
  account_id?: string;
  accountId?: string;
  name?: string;
  official_name?: string | null;
  officialName?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

/** If end looks like "tomorrow" vs local today, shift both back one day. */
function normalizeLocalRange(r: { startDate: string; endDate: string }) {
  const today = ymdToLocalDate(localTodayYMD());
  const end = ymdToLocalDate(r.endDate);
  const diffDays = Math.round((+end - +today) / 86400000);
  return diffDays === 1
    ? { startDate: addDaysYMD(r.startDate, -1), endDate: addDaysYMD(r.endDate, -1) }
    : r;
}

export default function StatCard({
  title,
  range,
  className = "",
  mode = "cashflow",
  showAccountSelect = false,
}: Props) {
  const token = useSelector((s: RootState) => s.auth.token)!;

  // Global filter state
  const selectedItemId = useSelector((s: RootState) => s.accountFilter.selectedItemId);
  const selectedAccountIdRaw = useSelector((s: RootState) => s.accountFilter.selectedAccountId);

  // Normalized accountId used for backend queries
  const accountFilterId = React.useMemo(
    () => (isValidAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw : undefined),
    [selectedAccountIdRaw]
  );

  // Determine net worth query params
  const nwItemId = React.useMemo(() => {
    return selectedItemId && selectedItemId !== ALL_BANKS_ID ? selectedItemId : "__all__";
  }, [selectedItemId]);

  const nwAccountId = React.useMemo(() => {
    if (nwItemId === "__all__") return undefined;
    return accountFilterId;
  }, [nwItemId, accountFilterId]);

  // Normalize potential UTC off-by-one in the incoming props
  const effectiveRange = React.useMemo(
    () => normalizeLocalRange(range),
    [range.startDate, range.endDate]
  );

  // Convert local YMD → ISO start / ISO end(exclusive) to match backend
  const { startISO, endExclusiveISO } = React.useMemo(() => {
    if (!effectiveRange.startDate || !effectiveRange.endDate) {
      return { startISO: undefined, endExclusiveISO: undefined } as {
        startISO?: string;
        endExclusiveISO?: string;
      };
    }
    return toIsoStartEndExclusive(effectiveRange.startDate, effectiveRange.endDate);
  }, [effectiveRange.startDate, effectiveRange.endDate]);

  // Accounts (for the dropdown)
  const { data: accountsRaw, isLoading: loadingAccounts } = useQuery<
    AccountLike[] | { accounts?: AccountLike[] }
  >({
    queryKey: ["plaid", "accounts", "for-statcard", selectedItemId],
    queryFn: () => fetchPlaidAccounts(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev as any,
  });

  const accounts: AccountLike[] = React.useMemo(() => {
    if (!accountsRaw) return [];
    return Array.isArray(accountsRaw)
      ? accountsRaw
      : ((accountsRaw as { accounts?: AccountLike[] }).accounts ?? []);
  }, [accountsRaw]);

  // CASHFLOW query
  const txQuery = useQuery<PagedTransactionsResponse>({
    queryKey: [
      "transactions",
      "cashflow",
      title,
      startISO ?? "",
      endExclusiveISO ?? "",
      accountFilterId ?? "ALL",
    ],
    queryFn: () =>
      fetchTransactions(token, {
        startDate: startISO,
        endDate: endExclusiveISO,
        page: 1,
        limit: 1000,
        sortBy: "date",
        order: "desc",
        ...(accountFilterId ? { accountId: accountFilterId } : {}),
      }),
    enabled: !!token && mode === "cashflow" && !!startISO && !!endExclusiveISO,
    placeholderData: (prev) => prev as any,
    refetchOnWindowFocus: true,
  });

  React.useEffect(() => {
    if (mode !== "cashflow") return;
    const handler = () => txQuery.refetch();
    window.addEventListener("data:transactions:changed", handler);
    window.addEventListener("data:networth:changed", handler);
    window.addEventListener("data:manualassets:changed", handler);
    return () => {
      window.removeEventListener("data:transactions:changed", handler);
      window.removeEventListener("data:networth:changed", handler);
      window.removeEventListener("data:manualassets:changed", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, startISO, endExclusiveISO, accountFilterId]);

  // NET WORTH query
  const nwQuery = useQuery({
    queryKey: ["plaid", "net-worth", nwItemId, nwAccountId ?? "ALL"],
    queryFn: () => fetchNetWorth(token, { itemId: nwItemId, accountId: nwAccountId }),
    enabled: !!token && mode === "networth",
    staleTime: 0,
    placeholderData: (prev) => prev as any,
    refetchOnWindowFocus: true,
  });

  const loading = mode === "cashflow" ? txQuery.isLoading : nwQuery.isLoading;
  const isError = mode === "cashflow" ? txQuery.isError : nwQuery.isError;
  const refetch = mode === "cashflow" ? txQuery.refetch : nwQuery.refetch;
  const isFetching = mode === "cashflow" ? txQuery.isFetching : nwQuery.isFetching;

  if (loading) return <SkeletonCard title={title} className={className} />;

  if (isError) {
    return (
      <GlassCard className={className}>
        <Header
          title={title}
          range={effectiveRange}
          accounts={accounts}
          selectedAccountIdRaw={selectedAccountIdRaw}
          loadingAccounts={loadingAccounts}
          showAccountSelect={showAccountSelect}
        />
        <div className="mt-4 text-rose-300 text-sm">Failed to load.</div>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20"
        >
          <ArrowPathIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Retry
        </button>
      </GlassCard>
    );
  }

  // NET WORTH mode
  if (mode === "networth") {
    const netWorth = (nwQuery.data as any)?.summary?.netWorth ?? 0;
    const assets = (nwQuery.data as any)?.summary?.assets ?? 0;
    const debts = (nwQuery.data as any)?.summary?.debts ?? 0;
    const netPositive = netWorth >= 0;

    return (
      <GlassCard
        className={className}
        hover
        glow={netPositive ? "positive" : "negative"}
      >
        <Header
          title={title}
          range={effectiveRange}
          accounts={accounts}
          selectedAccountIdRaw={selectedAccountIdRaw}
          loadingAccounts={loadingAccounts}
          showAccountSelect={false}
        />

        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-white/60">Net Worth</div>
            <div
              className={[
                "mt-1 font-semibold font-mono tabular-nums text-3xl",
                netPositive ? "text-emerald-300" : "text-rose-300",
              ].join(" ")}
            >
              {netPositive ? "+" : "-"}
              {formatMoney(Math.abs(netWorth))}
            </div>
          </div>

          <div className="w-40">
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Debt Share</span>
              <span>
                {(() => {
                  const base = Math.max(assets + Math.abs(debts), 0);
                  const pct =
                    base > 0 ? Math.min(100, Math.round((Math.abs(debts) / base) * 100)) : 0;
                  return `${pct}%`;
                })()}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-rose-400/70"
                style={{
                  width: (() => {
                    const base = Math.max(assets + Math.abs(debts), 0);
                    const pct =
                      base > 0 ? Math.min(100, Math.round((Math.abs(debts) / base) * 100)) : 0;
                    return `${pct}%`;
                  })(),
                }}
              />
            </div>
          </div>
        </div>
      </GlassCard>
    );
  }

  // CASHFLOW mode
  const tx: Transaction[] = txQuery.data?.transactions ?? [];
  const income = tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const flow = income + expense;
  const spendPct = flow > 0 ? Math.min(100, Math.round((expense / flow) * 100)) : 0;
  const netPositive = net >= 0;

  return (
    <GlassCard
      className={className}
      hover
      glow={netPositive ? "positive" : "negative"}
    >
      <Header
        title={title}
        range={effectiveRange}
        accounts={accounts}
        selectedAccountIdRaw={selectedAccountIdRaw}
        loadingAccounts={loadingAccounts}
        showAccountSelect={showAccountSelect}
      />

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/60">Net</div>
          <div
            className={[
              "mt-1 font-semibold font-mono tabular-nums text-3xl",
              netPositive ? "text-emerald-300" : "text-rose-300",
            ].join(" ")}
          >
            {netPositive ? "+" : "-"}
            {formatMoney(Math.abs(net))}
          </div>
        </div>
        <div className="w-40">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>Spend</span>
            <span>{spendPct}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-rose-400/70" style={{ width: `${spendPct}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Pill
          icon={<ArrowUpRightIcon className="h-4 w-4" />}
          label="Income"
          value={formatMoney(income)}
          kind="positive"
        />
        <Pill
          icon={<ArrowDownRightIcon className="h-4 w-4" />}
          label="Expense"
          value={formatMoney(expense)}
          kind="negative"
          prefix="-"
        />
      </div>
    </GlassCard>
  );
}

/* ---------- Header ---------- */
function Header({
  title,
  range,
  accounts,
  selectedAccountIdRaw,
  loadingAccounts,
  showAccountSelect,
}: {
  title: string;
  range: { startDate: string; endDate: string };
  accounts: AccountLike[];
  selectedAccountIdRaw: string;
  loadingAccounts: boolean;
  showAccountSelect?: boolean;
}) {
  const dispatch = useDispatch();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium text-white/90">{title}</h3>
        <div className="text-[11px] text-white/50">
          {range.startDate} — {range.endDate}
        </div>
      </div>

      {showAccountSelect && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-white/60">Account</label>
          <select
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
            value={selectedAccountIdRaw}
            onChange={(e) => {
              const id = e.target.value;

              let label = "All accounts";
              if (id !== ALL_ACCOUNTS_ID) {
                const a = accounts.find((x) => (x.account_id ?? x.accountId) === id);
                label =
                  a?.name ||
                  a?.official_name ||
                  a?.officialName ||
                  (a?.subtype ? a.subtype.toUpperCase() : "Account");
                if (a?.mask) label += ` ••${a.mask}`;
              }

              dispatch(setSelectedAccount({ id, label }));
            }}
            disabled={loadingAccounts}
          >
            <option value={ALL_ACCOUNTS_ID}>All accounts</option>
            {accounts.map((a, i) => {
              const id = a.account_id ?? a.accountId ?? `idx-${i}`;
              const label =
                a.name ||
                a.official_name ||
                a.officialName ||
                (a.subtype ? a.subtype.toUpperCase() : "Account");
              return (
                <option key={id} value={id}>
                  {label} {a.mask ? `••${a.mask}` : ""}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
