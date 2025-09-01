import { http, auth } from "./http";

/* ========= Types ========= */
export interface PlaidAccount {
  accountId: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;       // "depository" | "credit" | "investment" | "loan" | "other"
  subtype: string | null;
  balances: {
    available: number | null;
    current: number | null;
    isoCurrencyCode: string | null;
  };
}

export interface CardItem {
  accountId: string;
  name: string;
  mask: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
  aprs: any;
  lastPaymentAmount: number | null;
  lastPaymentDate: string | null;
  nextPaymentDueDate: string | null;
}


export type NetWorthResponse = {
  summary: { assets: number; debts: number; netWorth: number };
  manual: { cash: number; assets: number };
  currencyHint?: string;
  breakdownByType?: Record<string, number>;
};


/* ========= Endpoints (arrays) ========= */

// Transactions (synced from Plaid → your DB)
export const fetchPlaidTransactions = async (token: string): Promise<any[]> => {
  const { data } = await http.get("/api/plaid/transactions", auth(token));
  return Array.isArray(data) ? data : (data?.transactions ?? []);
};

// Create Link Token (POST)
export const createLinkToken = async (token: string): Promise<{ link_token: string }> => {
  const { data } = await http.post("/api/plaid/link-token", {}, auth(token));
  return data;
};

// Exchange Public Token (POST)
export const exchangePublicToken = async (token: string, publicToken: string): Promise<{ message: string }> => {
  const { data } = await http.post(
    "/api/plaid/exchange-public-token",
    { public_token: publicToken },
    auth(token)
  );
  return data;
};

// Accounts → return an array
export const fetchPlaidAccounts = async (token: string): Promise<PlaidAccount[]> => {
  const { data } = await http.get("/api/plaid/accounts", auth(token));
  return Array.isArray(data) ? data : (data?.accounts ?? []);
};

// Cards → return an array
export const fetchPlaidCards = async (token: string): Promise<CardItem[]> => {
  const { data } = await http.get("/api/plaid/cards", auth(token));
  return Array.isArray(data) ? data : (data?.cards ?? []);
};

// Net worth (keep object)
export const fetchNetWorth = async (token: string): Promise<NetWorthResponse> => {
  const { data } = await http.get<NetWorthResponse>("/api/plaid/net-worth", auth(token));
  return data;
};

// Investments (keep shape from backend)
export const fetchInvestments = async (token: string): Promise<{
  holdings: any[];
  securities: any[];
  accounts: any[];
}> => {
  const { data } = await http.get("/api/plaid/investments", auth(token));
  return data;
};

