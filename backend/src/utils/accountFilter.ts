// backend/src/utils/accountFilter.ts

/**
 * ✅ Robust parsing: supports accountId, accountIds, accountIdsCsv,
 *    and filters out sentinels like "__all__", "all", "undefined", etc.
 */
export function parseAccountIds(q: {
  accountId?: string;
  accountIds?: string;
  accountIdsCsv?: string;
}): string[] {
  const BAD = new Set([
    "__all__",
    "__all_accounts__",
    "all",
    "undefined",
    "null",
    "",
  ]);

  const norm = (v?: string) => {
    if (!v) return "";
    const s = String(v).trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (BAD.has(lower)) return "";
    return s;
  };

  const single = norm(q.accountId);

  const csvRaw = q.accountIds ?? q.accountIdsCsv ?? "";
  const many = String(csvRaw)
    .split(",")
    .map((s) => norm(s))
    .filter(Boolean);

  return Array.from(new Set([single, ...many].filter(Boolean)));
}

/**
 * ✅ Apply account filter for BOTH accountId and legacy account_id
 */
export function applyAccountFilter(match: any, ids: string[]): void {
  if (!ids.length) return;

  const clause = ids.length === 1 ? ids[0] : { $in: ids };
  match.$or = [{ accountId: clause }, { account_id: clause }];
}
