// src/helpers/accountFilter.ts
import { ALL_ACCOUNTS_ID } from "../features/filters/globalAccountFilterSlice";

const BAD = new Set([
  ALL_ACCOUNTS_ID,
  "__all__",
  "__all_accounts__",
  "all",
  "ALL",
  "undefined",
  "UNDEFINED",
  "null",
  "NULL",
  "",
]);

export function sanitizeAccountId(v?: string | null): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  if (BAD.has(s)) return undefined;
  if (BAD.has(s.toUpperCase())) return undefined;
  return s;
}
