// src/components/widgets/BankFlowWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";
import { fetchTransactions, Transaction } from "../../api/transaction";
import {
  BanknotesIcon,
  BuildingLibraryIcon,
  CreditCardIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
} from "@heroicons/react/24/outline";

const glass =
  "rounded-2xl p-5 backdrop-blur-md bg-white/5 border border-white/10 shadow-xl ring-1 ring-white/5";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Pick a sensible default window (last 30 days)
function lastNDaysISO(days = 30) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

type GroupRow = {
  key: string;               // account_id or "all"
  name: string;              // account name or "All Accounts"
  subtype?: string;
  income: number;
  expense: number;
  net: number;
};

export default function BankFlowWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { startDate, endDate } = React.useMemo(() => lastNDaysISO(30), []);

  // Fetch accounts
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
  });

  // Fetch transactions (within range). We’ll ask for a larger page size to cover the month.
  const { data: txPage, isLoading, isError } = useQuery({
    queryKey: ["transactions", startDate, endDate],
    queryFn: () =>
      fetchTransactions(token!, {
        startDate,
        endDate,
        page: 1,
        limit: 500,
        source: "plaid", // optional: focus on plaid data
      }),
    enabled: !!token,
  });

  const transactions: Transaction[] = txPage?.transactions ?? [];

  // Build a map of account_id -> account metadata
  const accMap = React.useMemo(() => {
    const m = new Map<string, { name: string; subtype?: string }>();
    (accounts || []).forEach((a: any) => {
      m.set(a.account_id, {
        name: a.name || a.official_name || a.subtype || "Bank Account",
        subtype: a.subtype,
      });
    });
    return m;
  }, [accounts]);

  // Some backends don’t store account_id yet. We detect and fallback.
  const supportsAccountId = transactions.some((t: any) => "accountId" in t || "account_id" in t);

  // Group by account (or single “all” group if account_id is missing)
  const grouped: GroupRow[] = React.useMemo(() => {
    const buckets = new Map<
      string,
      { name: string; subtype?: string; income: number; expense: number }
    >();

    const getKeyAndName = (t: any) => {
      const accountId = t.accountId || t.account_id; // support either field name
      if (supportsAccountId && accountId) {
        const meta = accMap.get(accountId);
        return {
          key: accountId,
          name: meta?.name || "Account",
          subtype: meta?.subtype,
        };
      }
      return { key: "all", name: "All Accounts", subtype: undefined };
    };

    transactions.forEach((t) => {
      const { key, name, subtype } = getKeyAndName(t);
      const bucket = buckets.get(key) || { name, subtype, income: 0, expense: 0 };
      if (t.type === "income") bucket.income += t.amount;
      else if (t.type === "expense") bucket.expense += t.amount;
      buckets.set(key, bucket);
    });

    const rows: GroupRow[] = Array.from(buckets.entries()).map(([key, v]) => ({
      key,
      name: v.name,
      subtype: v.subtype,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    // If we had no transactions, still provide accounts with zeroes for UX
    if (rows.length === 0 && supportsAccountId && accounts?.length) {
      accounts.forEach((a: any) => {
        rows.push({
          key: a.account_id,
          name: a.name || a.official_name || a.subtype || "Account",
          subtype: a.subtype,
          income: 0,
          expense: 0,
          net: 0,
        });
      });
    }

    // Sort by absolute flow (spend heavy first)
    rows.sort((a, b) => b.expense - a.expense);
    return rows;
  }, [transactions, accMap, supportsAccountId, accounts]);

  const iconFor = (subtype?: string) => {
    // crude map: checking/savings → bank, credit → card, default → banknotes
    const s = (subtype || "").toLowerCase();
    if (s.includes("credit")) return <CreditCardIcon className="h-6 w-6" />;
    if (s.includes("checking") || s.includes("savings")) return <BuildingLibraryIcon className="h-6 w-6" />;
    return <BanknotesIcon className="h-6 w-6" />;
  };

  return (
    <div className={glass}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Bank Flow (Last 30 Days)</h3>
        <div className="text-xs text-white/60">
          {startDate} → {endDate}
        </div>
      </div>

      {isLoading && <p className="text-white/70">Loading…</p>}
      {isError && <p className="text-rose-300">Failed to load bank flow.</p>}

      {!isLoading && !isError && (
        <div className="flex flex-col divide-y divide-white/10">
          {grouped.map((g) => {
            const netPos = g.net >= 0;
            return (
              <div key={g.key} className="py-3 flex items-center gap-4">
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-white/10 ${
                    netPos ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
                  }`}
                >
                  {iconFor(g.subtype)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{g.name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-sm">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/20 text-emerald-300">
                      <ArrowUpRightIcon className="h-4 w-4" />
                      In: <span className="font-mono tabular-nums">{money(g.income)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-400/10 ring-1 ring-rose-400/20 text-rose-300">
                      <ArrowDownRightIcon className="h-4 w-4" />
                      Out: <span className="font-mono tabular-nums">{money(g.expense)}</span>
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-base font-semibold font-mono tabular-nums ${
                      netPos ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {netPos ? "+" : "-"}
                    {money(Math.abs(g.net))}
                  </div>
                  <div className="text-xs text-white/60">Net</div>
                </div>
              </div>
            );
          })}

          {grouped.length === 0 && (
            <div className="py-6 text-white/70">No data in this range yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
