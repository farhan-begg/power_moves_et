// src/utils/accountFilter.ts

// Re-export constants from the slice for convenience
export { ALL_ACCOUNTS_ID, ALL_BANKS_ID } from "../features/filters/globalAccountFilterSlice";

// List of all sentinel values that mean "no specific account selected"
const SENTINEL_VALUES = [
  "__all__",
  "__all_accounts__",
  "all",
  "undefined",
  "null",
  "",
];

/**
 * Check if an account ID is a real, specific account (not a sentinel/placeholder).
 * @param id - The account ID to check
 * @returns true if it's a real account ID that should be used for filtering
 */
export function isValidAccountId(id?: string | null): boolean {
  if (!id) return false;
  return !SENTINEL_VALUES.includes(String(id));
}

/**
 * Check if a bank/item ID is a real, specific bank (not "all banks").
 * @param id - The item ID to check
 * @returns true if it's a real bank ID
 */
export function isValidBankId(id?: string | null): boolean {
  if (!id) return false;
  return id !== "__all__" && !SENTINEL_VALUES.includes(String(id));
}

/**
 * Sanitize an array of account IDs, removing sentinels.
 * @param ids - Array of account IDs
 * @returns Filtered array with only valid IDs, or undefined if empty
 */
export function sanitizeAccountIds(ids: string[]): string[] | undefined {
  const valid = ids.filter(isValidAccountId);
  return valid.length > 0 ? valid : undefined;
}

/**
 * Get the account ID to use for API queries.
 * Returns undefined if the ID is a sentinel (meaning "all accounts").
 * @param id - The raw account ID from state
 * @returns The account ID to use, or undefined for "all"
 */
export function getQueryAccountId(id?: string | null): string | undefined {
  return isValidAccountId(id) ? id! : undefined;
}
