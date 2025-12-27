import { useQuery } from "@tanstack/react-query";
import { fetchPlaidItems } from "../api/plaid";

export function usePlaidItems(token: string | null) {
  return useQuery({
    queryKey: ["plaid", "items", token],
    enabled: Boolean(token),
    queryFn: () => fetchPlaidItems(token!),
  });
}
