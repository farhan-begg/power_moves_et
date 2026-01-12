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
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-3 w-full sm:w-auto">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial min-w-0">
        <label className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] whitespace-nowrap sm:shrink-0">
          Bank
        </label>
        <select
          value={selectedItemId}
          onChange={onBankChange}
          className="
            w-full sm:w-auto sm:min-w-[140px]
            px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base font-medium
            bg-[var(--btn-bg)] backdrop-blur-md rounded-lg text-[var(--text-primary)] shadow-md
            border border-[var(--widget-border)]
            focus:outline-none focus:ring-2 focus:ring-[var(--widget-ring)]
            hover:bg-[var(--btn-hover)] active:bg-[var(--btn-hover)] transition
            touch-manipulation min-h-[44px] appearance-none
            cursor-pointer
          "
          style={{ 
            touchAction: "manipulation", 
            WebkitTapHighlightColor: "transparent",
            backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
            backgroundPosition: "right 0.5rem center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "1.5em 1.5em",
            paddingRight: "2.5rem"
          }}
        >
          {bankOptions.map((o) => (
            <option key={o.id} value={o.id} className="bg-[var(--widget-bg)] text-[var(--text-primary)]">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial min-w-0">
        <label className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] whitespace-nowrap sm:shrink-0">
          Account
        </label>
        <select
          value={selectedAccountId}
          onChange={onAccountChange}
          className="
            w-full sm:w-auto sm:min-w-[160px]
            px-3 sm:px-4 py-2.5 sm:py-2 text-sm sm:text-base font-medium
            bg-[var(--btn-bg)] backdrop-blur-md rounded-lg text-[var(--text-primary)] shadow-md
            border border-[var(--widget-border)]
            focus:outline-none focus:ring-2 focus:ring-[var(--widget-ring)]
            hover:bg-[var(--btn-hover)] active:bg-[var(--btn-hover)] transition
            touch-manipulation min-h-[44px] appearance-none
            cursor-pointer
          "
          style={{ 
            touchAction: "manipulation", 
            WebkitTapHighlightColor: "transparent",
            backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
            backgroundPosition: "right 0.5rem center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "1.5em 1.5em",
            paddingRight: "2.5rem"
          }}
        >
          {accountOptions.map((o) => (
            <option key={o.id} value={o.id} className="bg-[var(--widget-bg)] text-[var(--text-primary)]">
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
