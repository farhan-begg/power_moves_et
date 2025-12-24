import PlaidBalanceSnapshot from "../models/PlaidBalanceSnapshot";
import { computeNetWorthFromAccounts } from "../utils/computeNetWorth";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getCachedOrFetchBalances({
  plaidClient,
  userId,
  accessToken,
  itemId,
  force = false,
}: {
  plaidClient: any;
  userId: string;
  accessToken: string;
  itemId: string;
  force?: boolean;
}) {
  const existing = await PlaidBalanceSnapshot.findOne({ userId, itemId });

  const isFresh =
    existing && Date.now() - new Date(existing.fetchedAt).getTime() < COOLDOWN_MS;

  if (existing && isFresh && !force) {
    return { source: "cache", snapshot: existing };
  }

  // Fetch from Plaid (THIS is what was rate-limiting you)
  const resp = await plaidClient.accountsBalanceGet({
    access_token: accessToken,
  });

  const accounts = resp.data.accounts ?? [];
  const { totalAssets, totalLiabilities, netWorth } =
    computeNetWorthFromAccounts(accounts);

  const upsert = await PlaidBalanceSnapshot.findOneAndUpdate(
    { userId, itemId },
    {
      userId,
      itemId,
      accounts,
      totalAssets,
      totalLiabilities,
      netWorth,
      fetchedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return { source: "plaid", snapshot: upsert };
}
