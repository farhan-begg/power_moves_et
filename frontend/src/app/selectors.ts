// src/store/selectors.ts
import type { RootState } from "../app/store";

export const selectSelectedAccountId = (s: RootState) =>
  (s as any)?.accountFilter?.selectedAccountId ??
  (s as any)?.accounts?.selectedAccountId ??
  (s as any)?.filters?.accountId ??
  undefined;
