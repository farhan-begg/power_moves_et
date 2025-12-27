// backend/src/services/plaidBalances.ts
import mongoose from "mongoose";
import PlaidBalanceSnapshot from "../models/PlaidBalanceSnapshot";
import { computeNetWorthFromAccounts } from "../utils/computeNetWorth";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getCachedOrFetchBalances({
  plaidClient,
  userId,
  accessToken,
  itemId,
  institutionId = null,
  institutionName = null,
  force = false,
}: {
  plaidClient: any;
  userId: string;
  accessToken: string;
  itemId: string;
  institutionId?: string | null;
  institutionName?: string | null;
  force?: boolean;
}) {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const existing = await PlaidBalanceSnapshot.findOne({
    userId: userObjectId,
    itemId,
  });

  const isFresh =
    existing && Date.now() - new Date(existing.fetchedAt).getTime() < COOLDOWN_MS;

  if (existing && isFresh && !force) {
    return { source: "cache" as const, snapshot: existing };
  }

  // Fetch from Plaid (rate-limited endpoint)
  const resp = await plaidClient.accountsBalanceGet({
    access_token: accessToken,
  });

  const accounts = resp.data.accounts ?? [];
  const { totalAssets, totalLiabilities, netWorth } =
    computeNetWorthFromAccounts(accounts);

  const upsert = await PlaidBalanceSnapshot.findOneAndUpdate(
    { userId: userObjectId, itemId },
    {
      userId: userObjectId,
      itemId,
      institutionId,
      institutionName,
      accounts,
      totalAssets,
      totalLiabilities,
      netWorth,
      fetchedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return { source: "plaid" as const, snapshot: upsert };
}
