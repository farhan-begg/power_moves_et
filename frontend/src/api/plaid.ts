import { http, auth } from "./http";

// ✅ Get Transactions
export const fetchPlaidTransactions = async (token: string) => {
  const { data } = await http.get("/api/plaid/transactions", auth(token));
  return data;
};

// ✅ Create Link Token
export const createLinkToken = async (token: string) => {
  const { data } = await http.post("/api/plaid/create_link_token", {}, auth(token));
  return data; // { link_token }
};

// ✅ Exchange Public Token
export const exchangePublicToken = async (token: string, publicToken: string) => {
  const { data } = await http.post(
    "/api/plaid/exchange_public_token",
    { public_token: publicToken },
    auth(token)
  );
  return data;
};

// ✅ Get Accounts (balances, names, types)
export const fetchPlaidAccounts = async (token: string) => {
  const { data } = await http.get("/api/plaid/accounts", auth(token));
  return data;
};

// ✅ New Link Token (GET version)
export const fetchLinkTokenGET = async (token: string) => {
  const { data } = await http.get("/api/plaid/link-token", auth(token));
  return data;
};

// ✅ Investments
export const fetchInvestments = async (token: string) => {
  const { data } = await http.get("/api/plaid/investments", auth(token));
  return data; // { holdings, securities, accounts }
};
