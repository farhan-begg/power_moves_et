import axios from "axios";

export const fetchTransactions = async (token: string, page = 1, limit = 10) => {
  const res = await axios.get(`/api/transactions?page=${page}&limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const addTransaction = async (token: string, data: any) => {
  const res = await axios.post(`/api/transactions`, data, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};
