// src/components/widgets/TransactionsListWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";
import { bulkCategorize } from "../../api/transaction";
import { listCategories, type Category } from "../../api/categories";
import { selectSelectedAccountId } from "../../app/selectors";

import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { formatUTC_MMDDYYYY, localYMD, toIsoStartEndExclusive } from "../../helpers/date";
import { CategoryIcon, DEFAULT_COLORS, hexToRgba } from "../icons/CategoryIcons";
import FilterPill from "../common/FilterPill";
import { useRecentTransactions, type TxnFilter } from "../../hooks/transactionsHooks";

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
  "rounded-2xl p-5 backdrop-blur-md bg-[var(--widget-bg)] border border-[var(--widget-border)] shadow-xl ring-1 ring-[var(--widget-ring)]";

const money = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

function localRangeForPreset(p: Exclude<Preset, "custom">) {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);

  if (p === "7d") start.setDate(start.getDate() - 6);
  else if (p === "30d") start.setDate(start.getDate() - 29);
  else if (p === "90d") start.setDate(start.getDate() - 89);
  else if (p === "ytd") start.setMonth(0, 1);
  else if (p === "1y") start.setFullYear(start.getFullYear() - 1);

  return { startDate: localYMD(start), endDate: localYMD(end) };
}

const isRealAccountId = (v?: string | null) =>
  !!v && !["__all__", "all", "undefined", "null", ""].includes(String(v));

const HEX = /^#([0-9a-f]{3}){1,2}$/i;
const norm = (s?: string) => (s || "").trim().toLowerCase();

export default function TransactionsListWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const qc = useQueryClient();

  // accept account selection from any of your possible slices

  const selectedAccountIdRaw = useSelector(selectSelectedAccountId);
  const accountFilterId = React.useMemo(
    () => (isRealAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw : undefined),
    [selectedAccountIdRaw]
  );

  const [filter, setFilter] = React.useState<TxnFilter>("all");
  const [preset, setPreset] = React.useState<Preset>("30d");

  const init = React.useMemo(() => localRangeForPreset("30d"), []);
  const [startDate, setStartDate] = React.useState(init.startDate);
  const [endDate, setEndDate] = React.useState(init.endDate);

  const [pendingStart, setPendingStart] = React.useState(init.startDate);
  const [pendingEnd, setPendingEnd] = React.useState(init.endDate);
  const [dateError, setDateError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const limit = 6;

  // selection state
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const selectedIds = React.useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  // click vs dblclick
  const clickTimer = React.useRef<number | null>(null);
  const dblGuard = React.useRef(false);

  React.useEffect(() => {
    setPage(1);
    setSelected({});
  }, [filter, startDate, endDate, accountFilterId]);

  React.useEffect(() => {
    if (preset === "custom") return;
    const r = localRangeForPreset(preset);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setPendingStart(r.startDate);
    setPendingEnd(r.endDate);
    setDateError(null);
  }, [preset]);

  // accounts (for display names/masks)
  const { data: accountsRaw } = useQuery<PlaidAccount[] | { accounts: PlaidAccount[] }>({
    queryKey: ["accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    gcTime: 30 * 60 * 1000,
  });

  // categories (for color tint)
  const { data: categories } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => listCategories(token!),
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  const catByName = React.useMemo(() => {
    const m = new Map<string, Category>();
    (categories ?? []).forEach((c) => m.set(norm(c.name), c));
    return m;
  }, [categories]);

  const keywordColorFallback = (name: string) => {
    const n = norm(name);
    for (const key of Object.keys(DEFAULT_COLORS)) {
      if (n.includes(key)) return DEFAULT_COLORS[key];
    }
    return undefined;
  };

  // Preset spending categories based on CategoryIcons KEYMAP
  const presetCategories = React.useMemo(() => {
    return [
      { name: "Groceries", icon: "grocery", color: DEFAULT_COLORS.groceries },
      { name: "Restaurants", icon: "restaurant", color: DEFAULT_COLORS.restaurants },
      { name: "Coffee", icon: "coffee", color: DEFAULT_COLORS.coffee },
      { name: "Transport", icon: "transport", color: DEFAULT_COLORS.transport },
      { name: "Gas", icon: "gas", color: DEFAULT_COLORS.transport },
      { name: "Travel", icon: "travel", color: DEFAULT_COLORS.travel },
      { name: "Rent", icon: "rent", color: DEFAULT_COLORS.rent },
      { name: "Utilities", icon: "utility", color: DEFAULT_COLORS.utilities },
      { name: "Shopping", icon: "shopping", color: DEFAULT_COLORS.shopping },
      { name: "Subscriptions", icon: "subscription", color: DEFAULT_COLORS.subscriptions },
      { name: "Healthcare", icon: "health", color: DEFAULT_COLORS.healthcare },
      { name: "Gym", icon: "gym", color: DEFAULT_COLORS.healthcare },
      { name: "Entertainment", icon: "entertainment", color: DEFAULT_COLORS.entertainment },
      { name: "Education", icon: "education", color: "#6366f1" },
      { name: "Insurance", icon: "insurance", color: "#6366f1" },
      { name: "Services", icon: "service", color: "#6366f1" },
      { name: "Loan Payment", icon: "loan", color: "#ef4444" },
      { name: "Savings", icon: "savings", color: DEFAULT_COLORS.savings },
    ];
  }, []);

  const colorForCategory = (name?: string) => {
    if (!name) return undefined;
    const dbHex = catByName.get(norm(name))?.color;
    if (dbHex && HEX.test(dbHex)) return dbHex;
    return keywordColorFallback(name);
  };

  const accounts = React.useMemo<PlaidAccount[]>(() => {
    const raw = accountsRaw as unknown;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray((raw as any).accounts)) {
      return (raw as any).accounts as PlaidAccount[];
    }
    return [];
  }, [accountsRaw]);

  const accountIdParam = accountFilterId;
  const selectedAccountId = useSelector(selectSelectedAccountId);

  const { startISO, endExclusiveISO } = React.useMemo(() => {
    if (!startDate || !endDate)
      return { startISO: undefined, endExclusiveISO: undefined } as {
        startISO?: string;
        endExclusiveISO?: string;
      };
    return toIsoStartEndExclusive(startDate, endDate);
  }, [startDate, endDate]);

  // ✅ shared hook keeps this in sync with other widgets
  const { data: txRes, isError, isFetching } = useRecentTransactions({
    filter,
    startDate: startISO,
    endDate: endExclusiveISO,
    page,
    limit,
    sortBy: "date",
    order: "desc",
    accountId: selectedAccountId,
  });

  const transactions = txRes?.transactions ?? [];
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
      <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--negative-bg-soft)] text-[var(--negative)] ring-1 ring-[var(--negative-ring)]">
        <ArrowDownRightIcon className="h-5 w-5" />
      </div>
    ) : (
      <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--positive-bg-soft)] text-[var(--positive)] ring-1 ring-[var(--positive-ring)]">
        <ArrowUpRightIcon className="h-5 w-5" />
      </div>
    );

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

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

  // selection & categorize
  const toggleRow = (id: string) => setSelected((m) => ({ ...m, [id]: !m[id] }));
  const clearSelection = () => setSelected({});

  const [showCategoryModal, setShowCategoryModal] = React.useState(false);
  const [pendingIds, setPendingIds] = React.useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = React.useState("");

  const doCategorize = async (ids: string[], categoryName: string) => {
    if (ids.length === 0 || !categoryName.trim()) return;
    await bulkCategorize(token!, { ids, categoryName: categoryName.trim() });
    clearSelection();
    setShowCategoryModal(false);
    setPendingIds([]);
    setNewCategoryName("");
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const openCategoryModal = (ids: string[]) => {
    setPendingIds(ids);
    setShowCategoryModal(true);
  };

  const clickTimerRef = clickTimer; // alias to satisfy TS in handlers
  const handleClick = (id: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      if (!dblGuard.current) toggleRow(id);
      dblGuard.current = false;
      clickTimerRef.current = null;
    }, 180);
  };

  const handleDoubleClick = (id: string) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    dblGuard.current = true;
    const ids = selectedIds.length > 0 ? selectedIds : [id];
    openCategoryModal(ids);
  };

  // small recurring chips
  const RecurringChips: React.FC<{
    matchedBillId?: string | null;
    matchedPaycheckId?: string | null;
    matchConfidence?: number | null;
  }> = ({ matchedBillId, matchedPaycheckId, matchConfidence }) => {
    const chips: React.ReactNode[] = [];
    if (matchedBillId) {
      chips.push(
        <span
          key="bill"
          title="Linked to a bill"
          className="px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-200 ring-1 ring-amber-400/20 text-[10px] uppercase tracking-wide"
        >
          Bill
        </span>
      );
    }
    if (matchedPaycheckId) {
      chips.push(
        <span
          key="pay"
          title="Linked to a paycheck"
          className="px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/20 text-[10px] uppercase tracking-wide"
        >
          Paycheck
        </span>
      );
    }
    if (matchConfidence != null && matchConfidence < 1 && (matchedBillId || matchedPaycheckId)) {
      chips.push(
        <span
          key="conf"
          title={`Confidence ${Math.round(matchConfidence * 100)}%`}
          className="px-1.5 py-0.5 rounded-full bg-[var(--btn-bg)] text-[var(--text-muted)] ring-1 ring-[var(--widget-ring)] text-[10px]"
        >
          ~{Math.round(matchConfidence * 100)}%
        </span>
      );
    }
    if (chips.length === 0) return null;
    return <div className="flex items-center gap-1">{chips}</div>;
  };

  return (
    <div className={glass}>
      {/* selection bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 mb-3 rounded-xl border border-[var(--widget-border)] bg-[var(--btn-bg)] px-3 py-2 text-sm text-[var(--text-primary)] backdrop-blur-md ring-1 ring-[var(--widget-ring)]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
            <div>
              <span className="font-medium">{selectedIds.length}</span> selected —{" "}
              <span className="text-[var(--text-secondary)]">double-click any selected row to set a category</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => openCategoryModal(selectedIds)}
                className="rounded-lg bg-emerald-500/20 px-3 py-1.5 md:px-2 md:py-1 text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 transition touch-manipulation min-h-[36px] md:min-h-0 text-xs md:text-xs"
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              >
                Set Category
              </button>
              <button
                onClick={clearSelection}
                className="rounded-lg bg-[var(--btn-bg)] px-3 py-1.5 md:px-2 md:py-1 ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)] transition touch-manipulation min-h-[36px] md:min-h-0 text-xs md:text-xs"
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* header + controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Activity</h3>
          <div className="text-xs text-[var(--text-muted)]">
            {startDate} → {endDate}
          </div>
          {accountIdParam ? (
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Account: <span className="text-[var(--text-primary)]">{accMap.get(accountIdParam) || "Selected account"}</span>
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">All accounts</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill label="All" value="all" active={filter === "all"} onClick={setFilter} />
            <FilterPill label="Spending" value="expense" active={filter === "expense"} onClick={setFilter} />
            <FilterPill label="Income" value="income" active={filter === "income"} onClick={setFilter} />
          </div>
        </div>
      </div>

      {/* presets + custom range */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["7d", "30d", "90d", "ytd", "1y", "custom"] as Preset[]).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={[
              "px-2.5 py-1.5 rounded-md text-xs border transition-colors",
              preset === p
                ? "bg-[var(--btn-bg)] text-[var(--text-primary)] border-[var(--widget-border)]"
                : "bg-[var(--btn-bg)] text-[var(--text-secondary)] border-[var(--widget-border)] hover:bg-[var(--btn-hover)]",
            ].join(" ")}
          >
            {p.toUpperCase()}
          </button>
        ))}

        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded-md bg-[var(--btn-bg)] px-2 py-1.5 text-xs text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] focus:outline-none focus:ring-[var(--widget-ring)]"
              value={pendingStart}
              onChange={(e) => setPendingStart(e.target.value)}
            />
            <span className="text-[var(--text-muted)] text-xs">to</span>
            <input
              type="date"
              className="rounded-md bg-[var(--btn-bg)] px-2 py-1.5 text-xs text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] focus:outline-none focus:ring-[var(--widget-ring)]"
              value={pendingEnd}
              onChange={(e) => setPendingEnd(e.target.value)}
            />

            <button
              onClick={applyCustomRange}
              disabled={!pendingStart || !pendingEnd}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--btn-bg)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--btn-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--widget-ring)] disabled:opacity-40"
            >
              Apply
            </button>
            <button
              onClick={resetCustomRange}
              className="inline-flex items-center gap-2 rounded-lg bg-transparent px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--btn-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--widget-ring)]"
              title="Reset to applied dates"
            >
              Reset
            </button>

            {dateError && <span className="text-[11px] text-[var(--negative)] ml-2">{dateError}</span>}
          </div>
        )}
      </div>

      {/* error */}
      {isError && <p className="text-[var(--negative)]">Failed to load transactions.</p>}

      {/* empty */}
      {!isError && transactions.length === 0 && (
        <div className="text-[var(--text-secondary)]">
          No results for <b>{filter === "all" ? "all types" : filter}</b>
          {accountIdParam && (
            <>
              {" "}
              in <b>{accMap.get(accountIdParam) || "selected account"}</b>
            </>
          )}{" "}
          between <b>{startDate}</b> and <b>{endDate}</b>.
        </div>
      )}

      {/* results */}
      {!isError && transactions.length > 0 && (
        <>
          <ul className="divide-y divide-[var(--divider)] transition-opacity duration-150" style={{ opacity: isFetching ? 0.85 : 1 }}>
            {transactions.map((t) => {
              const bank = bankNameFor(t);
              const isExpense = t.type === "expense";
              const actionLabel = isExpense ? "withdraw" : "deposit";
              const amountText = `${isExpense ? "-" : "+"}${money(t.amount)}`;

              const catColor = colorForCategory(t.category);
              const badgeStyles: React.CSSProperties | undefined = catColor
                ? { border: `1px solid ${catColor}`, backgroundColor: hexToRgba(catColor, 0.14) }
                : { border: "1px solid rgba(255,255,255,0.15)" };

              const isSelected = !!selected[t._id];

              return (
                <li
                  key={t._id}
                  onClick={() => handleClick(t._id)}
                  onDoubleClick={() => handleDoubleClick(t._id)}
                  className={[
                    "py-3 flex items-center gap-4 cursor-pointer select-none rounded-lg",
                    isSelected ? "bg-[var(--btn-bg)] ring-1 ring-[var(--widget-ring)] shadow-inner" : "hover:bg-[var(--btn-bg)]",
                  ].join(" ")}
                >
                  <div className="shrink-0">
                    <RowIcon type={t.type} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        {/* category icon */}
                        <span
                          title={t.category || "Uncategorized"}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                          style={badgeStyles}
                        >
                          <CategoryIcon
                            category={t.category || "Uncategorized"}
                            description={t.description}
                            className="h-4 w-4"
                            color={catColor}
                          />
                        </span>

                        <div className="truncate font-semibold text-[var(--text-primary)]">
                          {t.description || "Transaction"}
                        </div>
                      </div>

                      <div className={`shrink-0 font-mono tabular-nums ${isExpense ? "text-[var(--negative)]" : "text-[var(--positive)]"}`}>
                        {amountText}
                      </div>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                      {bank && <span className="truncate">{bank}</span>}
                      <span className="text-[var(--text-muted)]">•</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full uppercase tracking-wide text-[10px] ring-1 ${
                          isExpense
                            ? "bg-[var(--negative-bg-soft)] text-[var(--negative)] ring-[var(--negative-ring)]"
                            : "bg-[var(--positive-bg-soft)] text-[var(--positive)] ring-[var(--positive-ring)]"
                        }`}
                      >
                        {actionLabel}
                      </span>
                      <span className="text-[var(--text-muted)]">•</span>
                      <span>{formatUTC_MMDDYYYY(t.date)}</span>

                      {/* recurring chips */}
                      <RecurringChips
                        matchedBillId={t.matchedBillId}
                        matchedPaycheckId={t.matchedPaycheckId}
                        matchConfidence={t.matchConfidence}
                      />
                    </div>
                  </div>

                  <div className="text-[10px] px-2 py-1 rounded-full bg-[var(--btn-bg)] ring-1 ring-[var(--widget-ring)] text-[var(--text-muted)] shrink-0">
                    {t.source === "plaid" ? "Plaid" : "Manual"}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* pagination */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-[var(--text-muted)]">
              Showing <span className="text-[var(--text-primary)]">{from}</span>–<span className="text-[var(--text-primary)]">{to}</span> of{" "}
              <span className="text-[var(--text-primary)]">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] text-[var(--text-secondary)] disabled:opacity-40"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Prev
              </button>
              <div className="text-xs text-[var(--text-secondary)]">
                Page <span className="text-[var(--text-primary)]">{page}</span> / <span className="text-[var(--text-primary)]">{pages}</span>
              </div>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] text-[var(--text-secondary)] disabled:opacity-40"
              >
                Next
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Category Selection Modal */}
      {showCategoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => {
            setShowCategoryModal(false);
            setPendingIds([]);
            setNewCategoryName("");
          }}
        >
          <div
            className="relative w-full max-w-md max-h-[80vh] rounded-2xl bg-[var(--widget-bg)] border border-[var(--widget-border)] shadow-2xl ring-1 ring-[var(--widget-ring)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-[var(--divider)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Select Category ({pendingIds.length} transaction{pendingIds.length !== 1 ? "s" : ""})
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Choose a category or create a new one
              </p>
            </div>

            {/* Category List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {/* Preset Categories */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Quick Select</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {presetCategories.map((preset) => {
                    const presetColor = preset.color || colorForCategory(preset.name);
                    return (
                      <button
                        key={preset.name}
                        onClick={() => doCategorize(pendingIds, preset.name)}
                        className="flex flex-col items-center gap-2 px-3 py-3 rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] transition touch-manipulation min-h-[80px]"
                        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                      >
                        <span
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full shrink-0"
                          style={
                            presetColor
                              ? { border: `1px solid ${presetColor}`, backgroundColor: hexToRgba(presetColor, 0.14) }
                              : { border: "1px solid rgba(255,255,255,0.15)" }
                          }
                        >
                          <CategoryIcon
                            category={preset.name}
                            className="h-6 w-6"
                            color={presetColor}
                          />
                        </span>
                        <span className="text-xs font-medium text-[var(--text-primary)] text-center leading-tight">
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Existing Categories */}
              {(categories ?? []).length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Your Categories</h4>
                  <div className="space-y-2">
                    {(categories ?? []).map((cat) => {
                      const catColor = cat.color && HEX.test(cat.color) ? cat.color : colorForCategory(cat.name);
                      return (
                        <button
                          key={cat._id}
                          onClick={() => doCategorize(pendingIds, cat.name)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] transition text-left touch-manipulation min-h-[52px]"
                          style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                        >
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full shrink-0"
                            style={
                              catColor
                                ? { border: `1px solid ${catColor}`, backgroundColor: hexToRgba(catColor, 0.14) }
                                : { border: "1px solid rgba(255,255,255,0.15)" }
                            }
                          >
                            <CategoryIcon
                              category={cat.name}
                              className="h-5 w-5"
                              color={catColor}
                            />
                          </span>
                          <span className="flex-1 font-medium text-[var(--text-primary)]">{cat.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Create New Category */}
              <div className="border-t border-[var(--divider)] pt-4">
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                  Create New Category
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCategoryName.trim()) {
                        doCategorize(pendingIds, newCategoryName.trim());
                      }
                    }}
                    placeholder="Category name..."
                    className="flex-1 px-4 py-2 md:px-3 md:py-1.5 rounded-lg bg-[var(--btn-bg)] border border-[var(--widget-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--widget-ring)] touch-manipulation min-h-[44px] md:min-h-0"
                    style={{ touchAction: "manipulation" }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      if (newCategoryName.trim()) {
                        doCategorize(pendingIds, newCategoryName.trim());
                      }
                    }}
                    disabled={!newCategoryName.trim()}
                    className="px-4 py-2 md:px-3 md:py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition touch-manipulation min-h-[44px] md:min-h-0 min-w-[80px] md:min-w-0"
                    style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-6 py-4 border-t border-[var(--divider)] flex justify-end">
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setPendingIds([]);
                  setNewCategoryName("");
                }}
                className="px-4 py-2 md:px-3 md:py-1.5 rounded-lg bg-[var(--btn-bg)] border border-[var(--widget-border)] text-[var(--text-primary)] hover:bg-[var(--btn-hover)] transition touch-manipulation min-h-[44px] md:min-h-0"
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
