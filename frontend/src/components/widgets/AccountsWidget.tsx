import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts } from "../../api/plaid";
import type { PlaidAccountsResponse, PlaidAccount } from "../../api/plaid";
import { glass } from "./_utils";
import { BanknotesIcon, BuildingLibraryIcon } from "@heroicons/react/24/outline";

const iconForSubtype = (sub?: string | null) => {
  const s = (sub || "").toLowerCase();
  if (s.includes("checking") || s.includes("savings"))
    return <BuildingLibraryIcon className="h-6 w-6" />;
  return <BanknotesIcon className="h-6 w-6" />;
};

export default function AccountsWidget() {
  const token = useSelector((s: RootState) => s.auth.token);

  const { data, isLoading } = useQuery<PlaidAccountsResponse>({
    queryKey: ["plaid", "accounts"],
    queryFn: () => fetchPlaidAccounts(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  const accounts: PlaidAccount[] = React.useMemo(() => {
    return data?.accounts ?? [];
  }, [data]);

  return (
    <div className={glass}>
      <div className="mb-3 text-[var(--text-primary)] text-lg font-semibold">Accounts</div>

      {isLoading ? (
        <div className="text-[var(--text-secondary)]">Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="text-[var(--text-secondary)]">No accounts linked.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <div
              key={a.accountId}
              className="flex items-center gap-4 rounded-xl p-4 bg-[var(--btn-bg)] ring-1 ring-[var(--widget-ring)]"
            >
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[var(--btn-hover)] text-[var(--text-primary)]">
                {iconForSubtype(a.subtype)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-[var(--text-primary)] font-medium truncate">
                  {a.name || a.officialName || "Account"}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {a.type}
                  {a.subtype ? ` • ${a.subtype}` : ""}
                  {a.mask ? ` ••••${String(a.mask).slice(-4)}` : ""}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm text-[var(--text-secondary)]">Balance</div>
                <div className="text-[var(--text-muted)] text-sm">—</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
