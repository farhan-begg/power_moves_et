// src/components/widgets/plaid/NetWorthWidget.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks/hooks";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { fetchNetWorth } from "../../features/plaid/plaidSlice";
import {
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";
import type { PlaidAccount } from "../../types/plaid";
import { localYMD, formatMMDDYYYY } from "../../helpers/date";
import { ALL_BANKS_ID, ALL_ACCOUNTS_ID } from "../../features/filters/globalAccountFilterSlice";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

/* ---------- types ---------- */
type ManualAsset = {
  _id: string;
  name: string;
  type: "cash" | "security" | "property" | "other";
  value: number;
  currency: string;
  notes?: string;
  asOf?: string; // Y-M-D (local) preferred
  // backend may add these:
  accountScope?: "global" | "account";
  accountId?: string;
};

type ManualTxnForm = {
  type: "income" | "expense";
  category: string;
  amount: string;
  description: string;
  date: string; // Y-M-D local
  // NEW: where to put the transaction
  destination: "current" | "new-manual";
  // NEW: used when destination === "new-manual"
  manualAccountName?: string;
  manualAccountCurrency?: string;
};

type ManualAssetForm = {
  id?: string;
  name: string;
  type: "cash" | "security" | "property" | "other";
  value: string;
  currency: string;
  notes?: string;
  asOf?: string; // Y-M-D local
};

/* ---------- helpers ---------- */
const money = (n: number, currency: string = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2 });
  }
};

// ✅ accept only real Plaid ids; anything else means "All"
// account selection is "__all_accounts__" now (NOT "__all__")
const isRealAccountId = (v?: string | null) =>
  !!v &&
  ![
    ALL_ACCOUNTS_ID,
    "__all_accounts__",
    "__all__",
    "all",
    "undefined",
    "null",
    "",
  ].includes(String(v));

/* ---------- component ---------- */
export default function NetWorthWidget({ className = "" }: { className?: string }) {
  const dispatch = useAppDispatch();
  const { netWorth, loading, error } = useAppSelector((s) => s.plaid);

  // Global bank + account filter
  const selectedItemId = useSelector((s: RootState) => s.accountFilter.selectedItemId);
  const selectedAccountIdRaw = useSelector((s: RootState) => s.accountFilter.selectedAccountId);
  const selectedAccountId = isRealAccountId(selectedAccountIdRaw) ? selectedAccountIdRaw! : undefined;

  const token = useSelector((s: RootState) => s.auth.token);

  // ✅ Net worth params must match backend rules:
  // - itemId="__all__" means all banks, and accountId is NOT allowed.
  const nwItemId = useMemo(() => {
    return selectedItemId && selectedItemId !== ALL_BANKS_ID ? selectedItemId : "__all__";
  }, [selectedItemId]);

  const nwAccountId = useMemo(() => {
    if (nwItemId === "__all__") return undefined; // backend rejects accountId with __all__
    return selectedAccountId;
  }, [nwItemId, selectedAccountId]);

  // Accounts (for labels)
  const { data: accountsRaw } = useQuery<any>({
    queryKey: ["plaid", "accounts", selectedItemId],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: (p: PlaidAccount[] | { accounts: PlaidAccount[] } | undefined) =>
      p ?? ([] as PlaidAccount[]),
  });

  const accounts = useMemo(() => {
    const raw = accountsRaw as any;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray(raw.accounts)) return raw.accounts;
    return [];
  }, [accountsRaw]);

  const selectedAccountLabel = useMemo(() => {
    if (!selectedAccountId) return "";
    const a =
      accounts.find(
        (x: any) =>
          x.account_id === selectedAccountId ||
          x.accountId === selectedAccountId ||
          x.id === selectedAccountId
      ) || null;
    if (!a) return selectedAccountId;
    const base = a.name || a.official_name || a.subtype || "Account";
    const mask = a.mask ? ` ••••${String(a.mask).slice(-4)}` : "";
    return `${base}${mask}`;
  }, [accounts, selectedAccountId]);

  // auth headers
  const jwt = localStorage.getItem("token") ?? "";
  const authHeaders = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }),
    [jwt]
  );

  // local state
  const [assets, setAssets] = useState<ManualAsset[]>([]);
  const [uiOpen, setUiOpen] = useState<"none" | "add-txn" | "add-asset">("none");
  const [saving, setSaving] = useState(false);
  const [errLocal, setErrLocal] = useState<string | null>(null);

  // keep last good net worth to avoid flicker
  const [lastNetWorth, setLastNetWorth] = useState<typeof netWorth | null>(null);
  useEffect(() => {
    if (netWorth) setLastNetWorth(netWorth);
  }, [netWorth]);

  // ✅ refresh respects bank + account rules
  const refresh = useCallback(() => {
    return dispatch(
      fetchNetWorth({
        itemId: nwItemId,
        ...(nwAccountId ? { accountId: nwAccountId } : {}),
      }) as any
    );
  }, [dispatch, nwItemId, nwAccountId]);

  // ✅ single debounced refresh when bank/account selection changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      refresh();
    }, 250);
    return () => window.clearTimeout(t);
  }, [refresh]);

  const loadAssets = useCallback(async () => {
    if (!jwt) return;
    const res = await fetch(`${API_BASE}/manual-assets`, { headers: authHeaders });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setAssets(data);
  }, [authHeaders, jwt]);

  // init
  useEffect(() => {
    if (!netWorth && !loading) refresh();
    loadAssets().catch((e) => setErrLocal(e?.message ?? "Failed to load manual assets"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-refetch on events
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener("data:transactions:changed", onChanged);
    window.addEventListener("data:manualassets:changed", onChanged);
    window.addEventListener("data:networth:changed", onChanged);
    return () => {
      window.removeEventListener("data:transactions:changed", onChanged);
      window.removeEventListener("data:manualassets:changed", onChanged);
      window.removeEventListener("data:networth:changed", onChanged);
    };
  }, [refresh]);

  // ----- forms (default to local today) -----
  const [txnForm, setTxnForm] = useState<ManualTxnForm>({
    type: "expense",
    category: "Manual",
    amount: "",
    description: "",
    date: localYMD(new Date()),
    destination: "current", // NEW default
    manualAccountName: "",
    manualAccountCurrency: "USD",
  });

  const [assetForm, setAssetForm] = useState<ManualAssetForm>({
    name: "",
    type: "security",
    value: "",
    currency: "USD",
    notes: "",
    asOf: localYMD(new Date()),
  });

  const [editId, setEditId] = useState<string | null>(null);

  /* ---------- actions ---------- */

  // Spending/Income: link to selected account OR create a new manual account
  const addManualTxn = async () => {
    setSaving(true);
    setErrLocal(null);
    try {
      const payload: any = {
        type: txnForm.type,
        category: txnForm.category || "Manual",
        amount: Number(txnForm.amount),
        description:
          txnForm.description || (txnForm.type === "income" ? "Manual income" : "Manual expense"),
        date: txnForm.date, // local YYYY-MM-DD
        source: "manual",
      };

      if (!isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("Enter a valid amount");
      }

      // destination logic
      if (txnForm.destination === "new-manual") {
        payload.manualAccountName = (txnForm.manualAccountName || "").trim();
        payload.manualAccountCurrency = (txnForm.manualAccountCurrency || "USD").trim() || "USD";
        if (!payload.manualAccountName) throw new Error("Please enter a manual account name.");
      } else if (selectedAccountId) {
        payload.accountId = selectedAccountId;
      }

      const res = await fetch(`${API_BASE}/transactions`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      // If a new manual account was just created, let the rest of the app refresh account lists
      if (txnForm.destination === "new-manual") {
        window.dispatchEvent(new CustomEvent("data:accounts:changed"));
      }

      window.dispatchEvent(new CustomEvent("data:transactions:changed"));
      window.dispatchEvent(new CustomEvent("data:networth:changed"));

      await refresh();
      setUiOpen("none");
      setTxnForm((f) => ({ ...f, amount: "", description: "" }));
    } catch (e: any) {
      setErrLocal(e?.message ?? "Failed to save manual transaction");
    } finally {
      setSaving(false);
    }
  };

  // Manual assets default to GLOBAL-only (contribute to "All accounts" only)
  const submitAsset = async () => {
    setSaving(true);
    setErrLocal(null);
    try {
      const valueNum = Number(assetForm.value);
      if (!isFinite(valueNum) || valueNum < 0) throw new Error("Enter a valid asset value");

      const body: any = {
        name: assetForm.name || "Manual Asset",
        type: assetForm.type,
        value: valueNum,
        currency: assetForm.currency || "USD",
        notes: assetForm.notes,
        asOf: assetForm.asOf, // local YYYY-MM-DD
      };

      // On CREATE only, enforce global scope explicitly.
      if (!editId) {
        body.accountScope = "global";
      }

      const url = editId ? `${API_BASE}/manual-assets/${editId}` : `${API_BASE}/manual-assets`;

      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      await loadAssets();
      await refresh();
      setUiOpen("none");
      setEditId(null);
      setAssetForm({
        name: "",
        type: "security",
        value: "",
        currency: "USD",
        notes: "",
        asOf: localYMD(new Date()),
      });
    } catch (e: any) {
      setErrLocal(e?.message ?? "Failed to save manual asset");
    } finally {
      setSaving(false);
    }
  };

  const deleteAsset = async (id: string) => {
    setSaving(true);
    setErrLocal(null);
    try {
      const res = await fetch(`${API_BASE}/manual-assets/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(await res.text());
      await loadAssets();
      await refresh();
    } catch (e: any) {
      setErrLocal(e?.message ?? "Failed to delete asset");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (a: ManualAsset) => {
    setEditId(a._id);
    const fallbackAsOf = localYMD(new Date());
    const safeAsOf = (a.asOf && a.asOf.slice(0, 10)) || fallbackAsOf;
    setAssetForm({
      id: a._id,
      name: a.name,
      type: a.type,
      value: String(a.value),
      currency: a.currency ?? "USD",
      notes: a.notes ?? "",
      asOf: safeAsOf,
    });
    setUiOpen("add-asset");
  };

  /* ---------- derived ---------- */
  const show = netWorth ?? lastNetWorth;
  const isInitialLoading = loading && !lastNetWorth;
  const isRefreshing = loading && !!lastNetWorth;

  const currencyHint = (show as any)?.currencyHint || "USD";
  const assetsSum = (show as any)?.summary?.assets ?? 0;
  const debts = (show as any)?.summary?.debts ?? 0;
  const net = (show as any)?.summary?.netWorth ?? 0;
  const netPositive = net >= 0;

  const base = Math.max(assetsSum + Math.abs(debts), 0);
  const debtPct = base > 0 ? Math.min(100, Math.round((Math.abs(debts) / base) * 100)) : 0;

  /* ---------- render ---------- */
  if (isInitialLoading) return <NetWorthSkeleton className={className} />;

  if (error && !show) {
    return (
      <Card className={className}>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-white/90">Net worth</h3>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20"
            aria-label="Refresh net worth"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="mt-1 text-[11px] text-white/60">As of {formatMMDDYYYY(new Date())}</div>
        <div className="mt-4 text-rose-300 text-sm">Failed to load: {String(error)}</div>
        <Btn onClick={refresh} className="mt-3">
          <ArrowPathIcon className="h-4 w-4" />
          Retry
        </Btn>
      </Card>
    );
  }

  return (
    <Card
      className={[
        className,
        isRefreshing ? "transition-opacity duration-150 opacity-[0.88]" : "opacity-100",
      ].join(" ")}
    >
      <Glow positive={netPositive} />

      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium text-white/90">Net worth</h3>
          <div className="text-[11px] text-white/60 mt-0.5">
            As of <span className="text-white">{formatMMDDYYYY(new Date())}</span>
          </div>

          {/* ✅ label logic that matches backend rules */}
          {nwItemId === "__all__" ? (
            <div className="text-[11px] text-white/40 mt-0.5">All banks • All accounts</div>
          ) : nwAccountId ? (
            <div className="text-[11px] text-white/60 mt-0.5">
              Account: <span className="text-white">{selectedAccountLabel}</span>
            </div>
          ) : (
            <div className="text-[11px] text-white/40 mt-0.5">All accounts</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRefreshing && (
            <ArrowPathIcon className="h-4 w-4 animate-spin text-white/70" aria-label="Refreshing" />
          )}
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20"
            aria-label="Refresh net worth"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Big net number */}
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
            {money(Math.abs(net), currencyHint)}
          </div>
        </div>

        {/* debts share meter */}
        <div className="w-40">
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>Debt Share</span>
            <span>{debtPct}%</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/10">
            <div className="h-2 rounded-full bg-rose-400/70" style={{ width: `${debtPct}%` }} />
          </div>
        </div>
      </div>

      {/* Pills */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Pill label="Assets" value={money(assetsSum, currencyHint)} kind="positive" />
        <Pill label="Debts" value={money(Math.abs(debts), currencyHint)} kind="negative" prefix="-" />
      </div>

      {/* Errors */}
      {errLocal && <div className="mt-3 text-xs text-rose-300">{errLocal}</div>}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Btn
          onClick={() => {
            setUiOpen(uiOpen === "add-txn" ? "none" : "add-txn");
            setEditId(null);
          }}
        >
          <PlusIcon className="h-4 w-4" /> Add Spending/Income
        </Btn>
        <Btn
          onClick={() => {
            setUiOpen(uiOpen === "add-asset" ? "none" : "add-asset");
          }}
        >
          <PlusIcon className="h-4 w-4" /> Add Manual Asset
        </Btn>
      </div>

      {/* --- Add Spending / Income --- */}
      {uiOpen === "add-txn" && (
        <FormCard title="Add spending or income" saving={saving}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <Label>Type</Label>
              <Select
                value={txnForm.type}
                onChange={(e) =>
                  setTxnForm((f) => ({ ...f, type: e.target.value as "income" | "expense" }))
                }
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            </Field>

            <Field>
              <Label>Date</Label>
              <Input
                type="date"
                value={txnForm.date}
                onChange={(e) => setTxnForm((f) => ({ ...f, date: e.target.value }))}
              />
            </Field>

            <Field>
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={txnForm.amount}
                onChange={(e) => setTxnForm((f) => ({ ...f, amount: e.target.value }))}
                onBlur={() =>
                  setTxnForm((f) => ({
                    ...f,
                    amount:
                      f.amount && isFinite(Number(f.amount))
                        ? Number(f.amount).toFixed(2)
                        : f.amount,
                  }))
                }
                prefix="$"
                aria-invalid={
                  txnForm.amount !== "" &&
                  (!isFinite(Number(txnForm.amount)) || Number(txnForm.amount) <= 0)
                    ? true
                    : undefined
                }
              />
              {txnForm.amount !== "" &&
                (!isFinite(Number(txnForm.amount)) || Number(txnForm.amount) <= 0) && (
                  <ErrorText>Enter a valid positive number.</ErrorText>
                )}
            </Field>

            <Field>
              <Label>Category</Label>
              <Input
                placeholder={txnForm.type === "income" ? "Salary, Tips…" : "Food, Rent…"}
                value={txnForm.category}
                onChange={(e) => setTxnForm((f) => ({ ...f, category: e.target.value }))}
              />
              <Help>Used for filtering and statements.</Help>
            </Field>

            <Field className="md:col-span-2">
              <Label>Description</Label>
              <Input
                placeholder={txnForm.type === "income" ? "e.g., Cash tip from client" : "e.g., Lunch"}
                value={txnForm.description}
                onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>

            {/* NEW: Destination picker */}
            <Field className="md:col-span-2">
              <Label>Destination</Label>
              <div className="flex flex-col gap-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="dest"
                    checked={txnForm.destination === "current"}
                    onChange={() => setTxnForm((f) => ({ ...f, destination: "current" }))}
                  />
                  <span>
                    Current selection{" "}
                    {selectedAccountId ? (
                      <span className="text-white/70">
                        (will link to <span className="text-white">{selectedAccountLabel}</span>)
                      </span>
                    ) : (
                      <span className="text-white/70">(All accounts – not linked)</span>
                    )}
                  </span>
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="dest"
                    checked={txnForm.destination === "new-manual"}
                    onChange={() => setTxnForm((f) => ({ ...f, destination: "new-manual" }))}
                  />
                  <span>Create a new manual account</span>
                </label>
              </div>
            </Field>

            {/* NEW: Show name/currency when creating a new manual account */}
            {txnForm.destination === "new-manual" && (
              <>
                <Field>
                  <Label>Manual account name</Label>
                  <Input
                    placeholder="e.g., Cash Wallet, Side Hustle"
                    value={txnForm.manualAccountName || ""}
                    onChange={(e) => setTxnForm((f) => ({ ...f, manualAccountName: e.target.value }))}
                  />
                </Field>
                <Field>
                  <Label>Currency</Label>
                  <Input
                    placeholder="USD"
                    value={txnForm.manualAccountCurrency || "USD"}
                    onChange={(e) =>
                      setTxnForm((f) => ({ ...f, manualAccountCurrency: e.target.value }))
                    }
                  />
                </Field>
              </>
            )}
          </div>

          {/* Scope note (read-only) */}
          <div className="mt-2 text-[11px] text-white/40">
            {txnForm.destination === "new-manual" ? (
              <>A new manual account will be created and this entry will be linked to it.</>
            ) : selectedAccountId ? (
              <>
                This entry will be linked to{" "}
                <span className="text-white">{selectedAccountLabel}</span>.
              </>
            ) : (
              <>With “All accounts” selected, this entry won’t be tied to a specific account.</>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              onClick={addManualTxn}
              disabled={
                saving ||
                !txnForm.amount ||
                !isFinite(Number(txnForm.amount)) ||
                Number(txnForm.amount) <= 0 ||
                (txnForm.destination === "new-manual" && !(txnForm.manualAccountName || "").trim())
              }
            >
              <CheckIcon className="h-4 w-4" />
              Save
            </Btn>
            <Btn kind="ghost" onClick={() => setUiOpen("none")}>
              <XMarkIcon className="h-4 w-4" />
              Cancel
            </Btn>
          </div>
        </FormCard>
      )}

      {/* --- Add / Edit Manual Asset --- */}
      {uiOpen === "add-asset" && (
        <FormCard title={editId ? "Edit asset" : "Add manual asset"} saving={saving}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <Label>Name</Label>
              <Input
                placeholder="e.g., Cash, Private Stock, Condo"
                value={assetForm.name}
                onChange={(e) => setAssetForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>

            <Field>
              <Label>Type</Label>
              <Select
                value={assetForm.type}
                onChange={(e) =>
                  setAssetForm((f) => ({
                    ...f,
                    type: e.target.value as ManualAssetForm["type"],
                  }))
                }
              >
                <option value="security">Security</option>
                <option value="cash">Cash</option>
                <option value="property">Property</option>
                <option value="other">Other</option>
              </Select>
            </Field>

            <Field>
              <Label>Value</Label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={assetForm.value}
                onChange={(e) => setAssetForm((f) => ({ ...f, value: e.target.value }))}
                onBlur={() =>
                  setAssetForm((f) => ({
                    ...f,
                    value:
                      f.value && isFinite(Number(f.value)) ? Number(f.value).toFixed(2) : f.value,
                  }))
                }
                prefix="$"
                aria-invalid={
                  assetForm.value !== "" &&
                  (!isFinite(Number(assetForm.value)) || Number(assetForm.value) < 0)
                    ? true
                    : undefined
                }
              />
              {assetForm.value !== "" &&
                (!isFinite(Number(assetForm.value)) || Number(assetForm.value) < 0) && (
                  <ErrorText>Enter a valid number (≥ 0).</ErrorText>
                )}
            </Field>

            <Field>
              <Label>Currency</Label>
              <Input
                placeholder="USD"
                value={assetForm.currency}
                onChange={(e) => setAssetForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </Field>

            <Field>
              <Label>As of</Label>
              <Input
                type="date"
                value={assetForm.asOf}
                onChange={(e) => setAssetForm((f) => ({ ...f, asOf: e.target.value }))}
              />
            </Field>

            <Field className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes"
                value={assetForm.notes || ""}
                onChange={(e) => setAssetForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>
          </div>

          <div className="mt-2 text-[11px] text-white/40">
            Assets created here are scoped to <b>All accounts</b> by default.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              onClick={submitAsset}
              disabled={
                saving ||
                !assetForm.name ||
                assetForm.value === "" ||
                !isFinite(Number(assetForm.value)) ||
                Number(assetForm.value) < 0
              }
            >
              <CheckIcon className="h-4 w-4" />
              {editId ? "Update" : "Save"}
            </Btn>
            <Btn
              kind="ghost"
              onClick={() => {
                setUiOpen("none");
                setEditId(null);
              }}
            >
              <XMarkIcon className="h-4 w-4" />
              Cancel
            </Btn>
          </div>
        </FormCard>
      )}

      {/* Manual assets list */}
      <div className="mt-5">
        <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Manual Assets</div>
        {assets.length === 0 ? (
          <div className="text-xs opacity-70">None yet.</div>
        ) : (
          <ul className="space-y-2">
            {assets.map((a) => (
              <li
                key={a._id}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm">{a.name}</div>
                  <div className="text-xs opacity-70">
                    {a.type} • {money(a.value, a.currency || currencyHint)}
                    {a.asOf ? ` • as of ${a.asOf.slice(0, 10)}` : ""}{" "}
                    {a.accountScope === "account" && a.accountId ? (
                      <span className="text-white/50">(Linked)</span>
                    ) : (
                      <span className="text-white/50">(All accounts)</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <IconBtn onClick={() => startEdit(a)} title="Edit">
                    <PencilSquareIcon className="h-4 w-4" />
                  </IconBtn>
                  <IconBtn onClick={() => deleteAsset(a._id)} title="Delete">
                    <TrashIcon className="h-4 w-4" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ---------- small pieces/styles ---------- */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        "transition-shadow hover:shadow-2xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Glow({ positive }: { positive: boolean }) {
  return (
    <div
      className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-20"
      style={{
        background: positive
          ? "radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,.35), transparent)"
          : "radial-gradient(60% 60% at 50% 50%, rgba(244,63,94,.35), transparent)",
      }}
    />
  );
}

function Pill({
  label,
  value,
  kind,
  prefix,
}: {
  label: string;
  value: string;
  kind: "positive" | "negative";
  prefix?: string;
}) {
  const styles =
    kind === "positive"
      ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20"
      : "bg-rose-400/10 text-rose-200 ring-rose-400/20";
  return (
    <div
      className={[
        "flex items-center justify-between rounded-xl px-3 py-2 ring-1",
        "shadow-inner shadow-black/5",
        styles,
      ].join(" ")}
    >
      <span className="text-xs text-white/70">{label}</span>
      <span className="font-mono tabular-nums text-sm text-white">
        {prefix ?? ""}
        {value}
      </span>
    </div>
  );
}

function NetWorthSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        className,
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between">
        <div className="h-3 w-28 rounded bg-white/10" />
        <div className="h-6 w-16 rounded bg-white/10" />
      </div>

      <div className="mt-4 h-8 w-40 rounded bg-white/10" />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="h-10 rounded-xl bg-white/10" />
        <div className="h-10 rounded-xl bg-white/10" />
      </div>

      {/* shimmer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="animate-[shimmer_2s_infinite] absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(0); }
          100% { transform: translateX(200%); }
        }
      `}</style>
      <div className="sr-only">Net worth loading</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  className = "",
  disabled,
  kind = "solid",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  kind?: "solid" | "ghost";
}) {
  const cls =
    kind === "solid"
      ? "bg-white/10 hover:bg-white/15 focus:ring-white/20"
      : "bg-transparent hover:bg-white/10 focus:ring-white/20";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2",
        cls,
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-md p-1.5 text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      {children}
    </button>
  );
}

function FormCard({
  title,
  saving,
  children,
}: {
  title: string;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 shadow-lg">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white/90">{title}</h4>
        {saving && <ArrowPathIcon className="h-4 w-4 animate-spin text-white/70" />}
      </div>
      <Divider />
      {children}
    </div>
  );
}

function Field({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={["flex flex-col gap-1", className].join(" ")}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] text-white/60">{children}</label>;
}
function Help({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-white/50">{children}</div>;
}
function ErrorText({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-[11px] text-rose-300">{children}</div>;
}
function Divider() {
  return <div className="my-3 h-px w-full bg-white/10" />;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string };
function Input({ prefix, className = "", ...props }: InputProps) {
  const ariaInvalid = (props as any)["aria-invalid"];
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-white/50">
          {prefix}
        </span>
        <input
          {...props}
          className={[
            "w-full rounded-lg bg-white/10 pl-7 pr-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40",
            "focus:outline-none focus:ring-white/20",
            ariaInvalid ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
            className,
          ].join(" ")}
        />
      </div>
    );
  }
  return (
    <input
      {...props}
      className={[
        "w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40",
        "focus:outline-none focus:ring-white/20",
        ariaInvalid ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
        className,
      ].join(" ")}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean | string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variantSize?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: React.ReactNode;
};
function Select({
  className = "",
  error,
  leftIcon,
  rightIcon,
  variantSize = "md",
  isLoading = false,
  disabled,
  children,
  ...props
}: SelectProps) {
  const sizeCls =
    variantSize === "sm"
      ? "py-1.5 text-[13px]"
      : variantSize === "lg"
      ? "py-2.5 text-[15px]"
      : "py-2 text-sm";

  const isErrored = typeof error === "string" ? true : !!error;
  const isDisabled = disabled || isLoading;

  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/60">
          {leftIcon}
        </span>
      )}

      <select
        {...props}
        disabled={isDisabled}
        className={[
          "w-full rounded-lg bg-white/10 pr-8 text-white ring-1 ring-white/10",
          "placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20",
          "appearance-none [color-scheme:dark] backdrop-blur-md",
          sizeCls,
          leftIcon ? "pl-8" : "px-3",
          isDisabled ? "opacity-60 cursor-not-allowed" : "",
          isErrored ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
          className,
        ].join(" ")}
      >
        {isLoading ? <option className="bg-slate-900 text-white">Loading…</option> : children}
      </select>

      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        {rightIcon ?? (
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-white/70">
            <path
              fill="currentColor"
              d="M5.6 7.6a1 1 0 0 1 1.4 0L10 10.6l3-3a1 1 0 1 1 1.4 1.4l-3.7 3.7a1 1 0 0 1-1.4 0L5.6 9a1 1 0 0 1 0-1.4Z"
            />
          </svg>
        )}
      </span>

      {typeof error === "string" && <div className="mt-1 text-[11px] text-rose-300">{error}</div>}
    </div>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
function Textarea({ className = "", ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={[
        "min-h-[72px] w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10",
        "focus:outline-none focus:ring-white/20",
        className,
      ].join(" ")}
    />
  );
}
