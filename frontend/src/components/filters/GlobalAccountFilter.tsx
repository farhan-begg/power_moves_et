import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../app/store";
import { setSelectedAccountId, clearAccountFilter } from "../../features/filters/globalAccountFilterSlice";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";

type AccountOpt = {
  accountId?: string;
  account_id?: string;
  id?: string;
  name?: string;
  officialName?: string | null;
  official_name?: string | null;
  mask?: string | null;
  subtype?: string | null;
};

export default function GlobalAccountFilter() {
  const dispatch = useDispatch();
  const token = useSelector((s: RootState) => s.auth.token)!;
  const selected = useSelector((s: RootState) => s.accountFilter.selectedAccountId);

  const { data: accountsRaw, isLoading } = useQuery<AccountOpt[] | { accounts?: AccountOpt[] }>({
    queryKey: ["plaid", "accounts"],
    queryFn: () => fetchPlaidAccounts(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: (p) => p as any,
  });

  const accounts: AccountOpt[] = React.useMemo(() => {
    if (!accountsRaw) return [];
    return Array.isArray(accountsRaw) ? accountsRaw : (accountsRaw.accounts ?? []);
  }, [accountsRaw]);

  const getId = (a: AccountOpt) => a.accountId || a.account_id || a.id || "";
  const getLabel = (a: AccountOpt) =>
    a.name || a.officialName || a.official_name || a.subtype || "Account";

  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-white/60">Account</label>
      <select
        className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/10 focus:outline-none focus:ring-white/20"
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          v ? dispatch(setSelectedAccountId(v)) : dispatch(clearAccountFilter());
        }}
        disabled={isLoading}
        title="Global account filter"
      >
        <option value="">All accounts</option>
        {accounts.map((a) => {
          const id = getId(a);
          if (!id) return null;
          const label = getLabel(a);
          const mask = a.mask ? ` ••${a.mask}` : "";
          return (
            <option key={id} value={id}>
              {label}{mask}
            </option>
          );
        })}
      </select>
      {selected && (
        <button
          onClick={() => dispatch(clearAccountFilter())}
          className="text-[11px] underline text-white/70 hover:text-white"
        >
          Clear
        </button>
      )}
    </div>
  );
}
