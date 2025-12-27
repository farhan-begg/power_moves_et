// src/components/filters/GlobalAccountFilter.tsx
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { RootState } from "../../app/store";

import { fetchPlaidItems, fetchPlaidAccounts, type PlaidItem } from "../../api/plaid";
import { fetchManualAccounts } from "../../api/manual";

import {
  setSelectedBank,
  setSelectedAccount,
  ALL_ACCOUNTS_ID,
  ALL_BANKS_ID,
} from "../../features/filters/globalAccountFilterSlice";

type AccountOption = { id: string; label: string; source: "plaid" | "manual" };
type BankOption = { id: string; label: string };

const isReal = (v?: string | null) =>
  !!v && !["__all_accounts__", "undefined", "null", ""].includes(String(v));


export default function GlobalAccountFilter() {
  const dispatch = useDispatch();
  const token = useSelector((s: RootState) => s.auth.token);

  const selectedItemId =
    useSelector((s: RootState) => s.accountFilter.selectedItemId) || ALL_BANKS_ID;

  const selectedAccountId =
    useSelector((s: RootState) => s.accountFilter.selectedAccountId) || ALL_ACCOUNTS_ID;

  // 1) Banks (Plaid items)
  const { data: plaidItems = [] } = useQuery({
    queryKey: ["plaid", "items", token],
    enabled: !!token,
    queryFn: () => fetchPlaidItems(token!),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // 2) Accounts for selected bank (only if a real bank is selected)
  const shouldFetchPlaidAccounts = !!token && selectedItemId !== ALL_BANKS_ID;

  const { data: plaidAccountsResp } = useQuery({
    queryKey: ["plaid", "accounts", token, selectedItemId],
    enabled: shouldFetchPlaidAccounts,
    queryFn: () => fetchPlaidAccounts(token!, { itemId: selectedItemId }),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // 3) Manual accounts (always available)
  const { data: manualRaw = [] } = useQuery({
    queryKey: ["accounts", "manual", token],
    enabled: !!token,
    queryFn: () => fetchManualAccounts(token!),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Build bank dropdown options
  const bankOptions = React.useMemo<BankOption[]>(() => {
    const result: BankOption[] = [{ id: ALL_BANKS_ID, label: "All banks" }];

    (plaidItems ?? []).forEach((i: PlaidItem) => {
      const label = i.institutionName || i.institutionId || i.itemId;
      result.push({ id: i.itemId, label });
    });

    // sort except the first
    const [all, ...rest] = result;
    rest.sort((a, b) => a.label.localeCompare(b.label));
    return [all, ...rest];
  }, [plaidItems]);

  // Build account dropdown options based on selected bank
  const accountOptions = React.useMemo<AccountOption[]>(() => {
    const result: AccountOption[] = [
      {
        id: ALL_ACCOUNTS_ID,
        label: selectedItemId === ALL_BANKS_ID ? "All accounts (all banks)" : "All accounts (this bank)",
        source: "plaid",
      },
    ];

    // Plaid accounts only when a specific bank is selected
    if (selectedItemId !== ALL_BANKS_ID) {
      const accounts = plaidAccountsResp?.accounts ?? [];
      accounts.forEach((a: any) => {
        const id = a.accountId || a.account_id || a.id;
        if (!id) return;

        const base = a.name || a.officialName || a.official_name || a.subtype || "Account";
        const mask = a.mask ? ` ••••${String(a.mask).slice(-4)}` : "";
        result.push({ id, label: `${base}${mask}`, source: "plaid" });
      });
    }

    // Manual accounts always included
    manualRaw.forEach((m: any) => {
      result.push({
        id: m.accountId,
        label: `${m.name} (Manual)`,
        source: "manual",
      });
    });

    // sort except the first
    const [all, ...rest] = result;
    rest.sort((a, b) => a.label.localeCompare(b.label));
    return [all, ...rest];
  }, [selectedItemId, plaidAccountsResp, manualRaw]);

  const onBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;

    if (!isReal(id) || id === ALL_BANKS_ID) {
      dispatch(setSelectedBank({ id: ALL_BANKS_ID, label: "All banks" }));
    } else {
      const opt = bankOptions.find((o) => o.id === id);
      dispatch(setSelectedBank({ id, label: opt?.label || "Bank" }));
    }

    // broadcast for widgets
    window.dispatchEvent(new CustomEvent("data:filter:bank:changed"));
    window.dispatchEvent(new CustomEvent("data:filter:account:changed"));
  };

  const onAccountChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;

    if (!isReal(id) || id === ALL_ACCOUNTS_ID) {
      dispatch(setSelectedAccount({ id: ALL_ACCOUNTS_ID, label: "All accounts" }));
    } else {
      const opt = accountOptions.find((o) => o.id === id);
      dispatch(setSelectedAccount({ id, label: opt?.label || "Selected account" }));
    }

    window.dispatchEvent(new CustomEvent("data:filter:account:changed"));
  };

  return (
    <div className="inline-flex items-center gap-3">
      <label className="text-sm font-medium text-white/70">Bank</label>
      <select
        value={selectedItemId}
        onChange={onBankChange}
        className="
          px-4 py-2 text-sm sm:text-base font-medium
          bg-white/10 backdrop-blur-md rounded-lg text-white shadow-md
          focus:outline-none focus:ring-2 focus:ring-white/30
          hover:bg-white/20 transition
        "
      >
        {bankOptions.map((o) => (
          <option key={o.id} value={o.id} className="bg-slate-900 text-white">
            {o.label}
          </option>
        ))}
      </select>

      <label className="text-sm font-medium text-white/70 ml-3">Account</label>
      <select
        value={selectedAccountId}
        onChange={onAccountChange}
        className="
          px-4 py-2 text-sm sm:text-base font-medium
          bg-white/10 backdrop-blur-md rounded-lg text-white shadow-md
          focus:outline-none focus:ring-2 focus:ring-white/30
          hover:bg-white/20 transition
        "
      >
        {accountOptions.map((o) => (
          <option key={o.id} value={o.id} className="bg-slate-900 text-white">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
