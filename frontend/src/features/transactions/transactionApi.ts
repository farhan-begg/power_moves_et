import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "../../utils/axios";

export function useTransactions(page = 1, limit = 10) {
  return useQuery({
    queryKey: ["transactions", page, limit],
    queryFn: async () => {
      const res = await axios.get(`/transactions?page=${page}&limit=${limit}`);
      return res.data;
    },
  });
}

export function useAddTransaction() {
  return useMutation({
    mutationFn: async (txn: {
      type: string;
      category: string;
      amount: number;
      description?: string;
    }) => {
      const res = await axios.post("/transactions", txn);
      return res.data;
    },
  });
}
