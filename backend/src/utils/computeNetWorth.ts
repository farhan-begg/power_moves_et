// server/utils/computeNetWorth.ts

export function computeNetWorthFromAccounts(accounts: any[]) {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    const type = acc?.type;
    const current = Number(acc?.balances?.current ?? 0);

    // Assets
    if (type === "depository" || type === "investment" || type === "brokerage") {
      totalAssets += current;
      continue;
    }

    // Liabilities
    if (type === "credit" || type === "loan") {
      totalLiabilities += current;
      continue;
    }

    // Fallback
    if (current >= 0) totalAssets += current;
    else totalLiabilities += Math.abs(current);
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
