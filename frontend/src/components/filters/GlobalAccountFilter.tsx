// src/components/filters/GlobalAccountFilter.tsx
import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { RootState } from "../../app/store";
import { fetchPlaidAccounts } from "../../api/plaid";
import { fetchManualAccounts } from "../../api/manual";
import {
  setSelectedAccount,
  ALL_ACCOUNTS_ID,
} from "../../features/filters/globalAccountFilterSlice";

const isReal = (v?: string | null) =>
  !!v && !["__all__", "all", "undefined", "null", ""].includes(String(v));

type Option = { id: string; label: string; source: "plaid" | "manual" };

export default function GlobalAccountFilter() {
  const dispatch = useDispatch();
  const token = useSelector((s: RootState) => s.auth.token);
  const selectedId =
    useSelector((s: RootState) => s.accountFilter.selectedAccountId) ||
    ALL_ACCOUNTS_ID;

  const { data: plaidRaw } = useQuery({
    queryKey: ["accounts", "plaid"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const { data: manualRaw } = useQuery({
    queryKey: ["accounts", "manual"],
    queryFn: () => fetchManualAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const options = React.useMemo<Option[]>(() => {
    const result: Option[] = [
      { id: ALL_ACCOUNTS_ID, label: "All accounts", source: "plaid" },
    ];

    (plaidRaw ?? []).forEach((a: any) => {
      const id = a.account_id || a.accountId || a.id;
      if (!id) return;
      const base = a.name || a.official_name || a.subtype || "Account";
      const mask = a.mask ? ` ••••${String(a.mask).slice(-4)}` : "";
      result.push({ id, label: `${base}${mask}`, source: "plaid" });
    });

    (manualRaw ?? []).forEach((m) => {
      result.push({ id: m.accountId, label: `${m.name} (Manual)`, source: "manual" });
    });

    const [all, ...rest] = result;
    rest.sort((a, b) => a.label.localeCompare(b.label));
    return [all, ...rest];
  }, [plaidRaw, manualRaw]);

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!isReal(id)) {
      dispatch(setSelectedAccount({ id: ALL_ACCOUNTS_ID, label: "All accounts" }));
    } else {
      const opt = options.find((o) => o.id === id);
      dispatch(setSelectedAccount({ id, label: opt?.label || "Selected account" }));
    }
    window.dispatchEvent(new CustomEvent("data:filter:account:changed"));
  };

  return (
    <div className="inline-flex items-center gap-3">
      <label className="text-sm font-medium text-white/70">Account</label>
      <select
        value={selectedId}
        onChange={onChange}
        className="
      px-4 py-2
    text-sm sm:text-base font-medium
    bg-white/10 backdrop-blur-md
    rounded-lg
    padding-10
    text-white shadow-md
    focus:outline-none focus:ring-2 focus:ring-white/30
    hover:bg-white/20
    transition
        "
      >
        {options.map((o) => (
          <option
            key={o.id}
            value={o.id}
            className="bg-slate-900 text-white"
          >
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
