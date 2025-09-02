// src/api/manual.ts
import { http, auth } from "./http";

export type ManualAccountDTO = {
  _id: string;
  accountId: string;   // "manual:<mongoId>"
  name: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchManualAccounts(token: string): Promise<ManualAccountDTO[]> {
  const { data } = await http.get("/api/transactions/manual-accounts", auth(token));
  return Array.isArray(data) ? data : [];
}
