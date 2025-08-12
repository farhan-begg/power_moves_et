import axios from "axios";

const API_URL = "http://localhost:5000/api/plaid";

// ✅ Get Transactions
export async function fetchPlaidTransactions(token: string) {
  const response = await axios.get(`${API_URL}/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

// ✅ Create Link Token
export const createLinkToken = async (token: string) => {
  const res = await axios.post(
    `${API_URL}/create_link_token`,
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

// ✅ Exchange Public Token
export const exchangePublicToken = async (token: string, publicToken: string) => {
  const res = await axios.post(
    `${API_URL}/exchange_public_token`,
    { public_token: publicToken },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

// ✅ Get Accounts (balances, names, types)
export const fetchPlaidAccounts = async (token: string) => {
  const res = await axios.get(`${API_URL}/accounts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// ✅ New Link Token (GET version for testing)
export const fetchLinkTokenGET = async (token: string) => {
  const res = await axios.get(`${API_URL}/link-token`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};



export const fetchInvestments = async (token: string) => {
  const res = await axios.get(`${API_URL}/investments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data; // { holdings, securities, accounts }
};