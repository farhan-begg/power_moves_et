// src/hooks/useInvestments.ts

import { useQuery } from "@tanstack/react-query";
import { fetchInvestments } from "../api/plaid";
export const useInvestments = (token: string | null) => {
  return useQuery({
    queryKey: ["investments"],
    queryFn: () => fetchInvestments(token!),
    enabled: !!token, // only run if token exists
  });
};
