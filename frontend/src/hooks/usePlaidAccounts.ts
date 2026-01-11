// src/hooks/usePlaidAccounts.ts
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import { RootState } from "../app/store";
import { fetchPlaidAccounts, PlaidAccount, PlaidAccountsResponse } from "../api/plaid";

export interface NormalizedAccount {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
}

/**
 * Hook to fetch and normalize Plaid accounts with caching.
 * Handles both PlaidAccount[] and { accounts: PlaidAccount[] } response shapes.
 */
export function usePlaidAccounts(options?: { itemId?: string; enabled?: boolean }) {
  const token = useSelector((s: RootState) => s.auth.token);
  const enabled = options?.enabled ?? true;

  const query = useQuery<PlaidAccountsResponse>({
    queryKey: ["plaid", "accounts", options?.itemId],
    queryFn: () => fetchPlaidAccounts(token!, { itemId: options?.itemId }),
    enabled: !!token && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    placeholderData: (prev) => prev,
  });

  // Normalize account data to consistent shape
  const accounts = useMemo<NormalizedAccount[]>(() => {
    const raw = query.data as any;

    // Handle different response shapes
    let accountList: PlaidAccount[] = [];
    if (Array.isArray(raw)) {
      accountList = raw;
    } else if (raw && typeof raw === "object" && Array.isArray(raw.accounts)) {
      accountList = raw.accounts;
    }

    return accountList.map((a) => ({
      id: a.accountId || (a as any).account_id || "",
      name: a.name || "",
      officialName: a.officialName || (a as any).official_name || null,
      mask: a.mask || null,
      type: a.type || "other",
      subtype: a.subtype || null,
    }));
  }, [query.data]);

  return {
    accounts,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

/**
 * Get a display label for an account.
 */
export function getAccountLabel(account: NormalizedAccount): string {
  const name = account.name || account.officialName || account.subtype?.toUpperCase() || "Account";
  return account.mask ? `${name} ••${account.mask}` : name;
}

export default usePlaidAccounts;
