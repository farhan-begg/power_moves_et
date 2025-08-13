import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts, PlaidAccount } from "../../api/plaid";
import { glass, money } from "./_utils";
import { BanknotesIcon, BuildingLibraryIcon } from "@heroicons/react/24/outline";

const iconForSubtype = (sub?: string | null) => {
  const s = (sub || "").toLowerCase();
  if (s.includes("checking") || s.includes("savings")) return <BuildingLibraryIcon className="h-6 w-6" />;
  return <BanknotesIcon className="h-6 w-6" />;
};

export default function AccountsWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const { data: accounts = [], isLoading } = useQuery<PlaidAccount[]>({
    queryKey: ["plaid", "accounts"],
    queryFn: () => fetchPlaidAccounts(token),
    enabled: !!token,
  });

  return (
    <div className={glass}>
      <div className="mb-3 text-white text-lg font-semibold">Accounts</div>
      {isLoading ? (
        <div className="text-white/70">Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="text-white/70">No accounts linked.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <div key={a.accountId} className="flex items-center gap-4 rounded-xl p-4 bg-white/5 ring-1 ring-white/10">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/10">
                {iconForSubtype(a.subtype)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-medium truncate">{a.name || a.officialName || "Account"}</div>
                <div className="text-xs text-white/60">
                  {a.type}{a.subtype ? ` • ${a.subtype}` : ""}{a.mask ? ` • •${a.mask}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-white/70">Balance</div>
                <div className="font-mono tabular-nums text-white">
                  {money(a.balances.current ?? 0, a.balances.isoCurrencyCode ?? "USD")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
