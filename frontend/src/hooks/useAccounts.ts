// src/hooks/useAccounts.ts
import { useSelector } from "react-redux";
import { RootState } from "../app/store";
import { useQuery } from "@tanstack/react-query";
import { fetchPlaidAccounts, PlaidAccount } from "../api/plaid";

export type AccountLike = {
  accountId: string;
  name: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

export function useAccounts() {
  const token = useSelector((s: RootState) => s.auth.token)!;

  const { data: accountsRaw, ...rest } = useQuery<
    PlaidAccount[] | { accounts?: PlaidAccount[] }
  >({
    queryKey: ["accounts", "all"],
    queryFn: () => fetchPlaidAccounts(token),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });

  const accounts: AccountLike[] = Array.isArray(accountsRaw)
    ? accountsRaw
    : accountsRaw?.accounts ?? [];

  return { accounts, ...rest };
}
