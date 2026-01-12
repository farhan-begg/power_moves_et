// src/api/plaid.ts
import { http, auth } from "./http";

/* ========= Types ========= */

export type PlaidItemStatus = "active" | "error" | "revoked";

export interface PlaidItem {
  itemId: string;
  institutionId: string | null;
  institutionName: string | null;
  isPrimary: boolean;
  status: PlaidItemStatus;
  createdAt: string;
}

export interface PlaidAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string; // depository | credit | investment | loan | other
  subtype: string | null;

  // ✅ backend returns balances: null in /accounts
  balances: null;
}

export type PlaidAccountsResponse = {
  itemId: string;
  source: "cache" | "plaid";
  fetchedAt: string;
  accounts: PlaidAccount[];
};


export type NetWorthResponse = {
  itemId: string;
  institutionName?: string | null;
  source?: string;
  fetchedAt?: string | Date | null;
  currencyHint?: string;
  summary: { assets: number; debts: number; netWorth: number };
};

/* ========= Endpoints ========= */

// 0) List connected banks
export const fetchPlaidItems = async (token: string): Promise<PlaidItem[]> => {
  const { data } = await http.get<{ items: PlaidItem[] }>("/plaid/items", auth(token));
  return data?.items ?? [];
};

// 1) Create Link Token
// mode="new" => add a new institution
// mode="update" => re-auth an existing item (requires itemId)
export const createLinkToken = async (
  token: string,
  opts?: { mode?: "new" | "update"; itemId?: string }
): Promise<{ link_token: string }> => {
  const payload =
    opts?.mode === "update"
      ? { mode: "update" as const, itemId: opts.itemId }
      : { mode: "new" as const };

  const { data } = await http.post("/plaid/link-token", payload, auth(token));
  return data;
};

// 2) Exchange Public Token (store as PlaidItem)
// You should pass institution from Plaid Link onSuccess metadata
export const exchangePublicToken = async (
  token: string,
  params: {
    publicToken: string;
    institution?: { id?: string; name?: string };
    makePrimary?: boolean;
  }
): Promise<{ message: string; itemId: string; institutionName: string | null; isPrimary: boolean }> => {
  const { data } = await http.post(
    "/plaid/exchange-public-token",
    {
      public_token: params.publicToken,
      institution: params.institution ?? undefined,
      makePrimary: params.makePrimary ?? undefined,
    },
    auth(token)
  );
  return data;
};

// Set primary bank
export const makePrimaryBank = async (
  token: string,
  itemId: string
): Promise<{ message: string; itemId: string; institutionName: string | null }> => {
  const { data } = await http.post(`/plaid/items/${itemId}/make-primary`, {}, auth(token));
  return data;
};

// 3) Accounts (by bank itemId)
// if itemId omitted, backend uses primary/last linked
export const fetchPlaidAccounts = async (
  token: string,
  opts?: { itemId?: string; force?: boolean }
): Promise<PlaidAccountsResponse> => {
  const params = new URLSearchParams();
  if (opts?.itemId) params.set("itemId", opts.itemId);
  if (opts?.force) params.set("force", "true");

  const url = `/plaid/accounts${params.toString() ? `?${params}` : ""}`;
  const { data } = await http.get<PlaidAccountsResponse>(url, auth(token));

  return {
    itemId: data?.itemId ?? (opts?.itemId ?? ""),
    source: data?.source ?? "cache",
    fetchedAt: data?.fetchedAt ?? new Date().toISOString(),
    accounts: data?.accounts ?? [],
  };
};

// 3.5) Net worth
// - all banks: itemId="__all__"
// - single bank: itemId=<Plaid item_id>
// - optional accountId ONLY when itemId is a real bank (not "__all__")
export async function fetchNetWorth(
  token: string,
  opts?: { itemId?: string; accountId?: string; force?: boolean }
): Promise<NetWorthResponse> {
  const params: any = {};
  if (opts?.itemId) params.itemId = opts.itemId;
  if (opts?.accountId) params.accountId = opts.accountId;
  if (opts?.force) params.force = "true";

  const { data } = await http.get<NetWorthResponse>("/plaid/net-worth", {
    ...auth(token),
    params,
  });

  return data;
}
// Optional: Transactions sync you already have (leave it)
export const fetchPlaidTransactions = async (token: string): Promise<any[]> => {
  const { data } = await http.get("/plaid/transactions", auth(token));
  return Array.isArray(data) ? data : (data?.transactions ?? []);
};

export async function syncPlaidTransactions(
  token: string,
  opts?: { accountId?: string; accountIds?: string[] }
): Promise<any[]> {
  const params = new URLSearchParams();
  if (opts?.accountId) params.set("accountId", opts.accountId);
  if (opts?.accountIds?.length) params.set("accountIds", opts.accountIds.join(","));

  const url = `/plaid/transactions${params.toString() ? `?${params}` : ""}`;
  const { data } = await http.get(url, auth(token));
  return Array.isArray(data) ? data : (data?.transactions ?? []);
}


// ✅ Convenience: return ONLY the array (for old widgets)
export const fetchPlaidAccountsArray = async (
  token: string,
  opts?: { itemId?: string; force?: boolean }
): Promise<PlaidAccount[]> => {
  const res = await fetchPlaidAccounts(token, opts);
  return res.accounts ?? [];
};

/* ========= New: Sync status + trigger-if-needed ========= */
export type SyncStatus = {
  isSyncing: boolean;
  lastGoodSyncAt: string | null;
  lastAttemptAt: string | null;
  cooldownRemainingMs: number;
  hasAnyTransactions: boolean;
};

export async function fetchSyncStatus(token: string): Promise<SyncStatus> {
  const { data } = await http.get<{
    isSyncing: boolean;
    lastGoodSyncAt: string | null;
    lastAttemptAt: string | null;
    cooldownRemainingMs: number;
    hasAnyTransactions: boolean;
  }>("/plaid/sync-status", auth(token));
  return {
    isSyncing: !!data.isSyncing,
    lastGoodSyncAt: data.lastGoodSyncAt ?? null,
    lastAttemptAt: data.lastAttemptAt ?? null,
    cooldownRemainingMs: Number(data.cooldownRemainingMs ?? 0),
    hasAnyTransactions: !!data.hasAnyTransactions,
  };
}

export async function triggerSyncIfNeeded(
  token: string,
  opts?: { force?: boolean; days?: number; forceFullSync?: boolean }
): Promise<{
  triggered: boolean;
  alreadyRunning?: boolean;
  reason?: "cooldown";
  status: SyncStatus;
}> {
  const { data } = await http.post(
    "/plaid/sync-if-needed",
    {
      force: opts?.force ?? false,
      days: opts?.days ?? 730, // ✅ Default to 730 days (2 years) for full historical data
      forceFullSync: opts?.forceFullSync ?? false, // Allow forcing full sync even if recently synced
    },
    auth(token)
  );

  const normalizedStatus: SyncStatus = {
    isSyncing: !!data?.status?.isSyncing,
    lastGoodSyncAt: data?.status?.lastGoodSyncAt ?? null,
    lastAttemptAt: data?.status?.lastAttemptAt ?? null,
    cooldownRemainingMs: Number(data?.status?.cooldownRemainingMs ?? 0),
    hasAnyTransactions: !!data?.status?.hasAnyTransactions,
  };

  return {
    triggered: !!data?.triggered,
    alreadyRunning: !!data?.alreadyRunning,
    reason: data?.reason,
    status: normalizedStatus,
  };
}