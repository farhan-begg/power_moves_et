import axios from "axios";

export const createLinkToken = async (token: string) => {
  const res = await axios.post(
    "/api/plaid/create_link_token",
    {},
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const exchangePublicToken = async (token: string, publicToken: string) => {
  const res = await axios.post(
    "/api/plaid/exchange_public_token",
    { public_token: publicToken },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};
