// // src/services/plaidBackfillService.ts
// import mongoose from "mongoose";
// import plaidClient from "../services/plaidService";
// import Transaction from "../models/Transaction";
// import User from "../models/User";
// import { decrypt } from "../utils/cryptoUtils";

// /**
//  * Idempotent backfill that adds accountId/accountName to local Plaid rows
//  * for the last N days (default 30). Safe to call any time.
//  */
// export async function runAccountIdBackfillForUser(userIdRaw: string, days = 30) {
//   const userId = new mongoose.Types.ObjectId(String(userIdRaw));
//   const user = await User.findById(userId);
//   if (!user?.plaidAccessToken) {
//     return { updated: 0, scanned: 0, message: "No Plaid account linked" };
//   }
//   const accessToken = decrypt(user.plaidAccessToken);

//   // accounts → names
//   const accountsResp = await plaidClient.accountsBalanceGet({ access_token: accessToken });
//   const accountsById = new Map<string, any>();
//   for (const a of accountsResp.data.accounts) accountsById.set(a.account_id, a);

//   // date window
//   const startDate = new Date();
//   startDate.setDate(startDate.getDate() - Math.max(1, days));
//   const endDate = new Date();

//   // pull from Plaid
//   const plaidResp = await plaidClient.transactionsGet({
//     access_token: accessToken,
//     start_date: startDate.toISOString().slice(0, 10),
//     end_date: endDate.toISOString().slice(0, 10),
//   });

//   const keyFor = (d: string, amt: number, name: string) =>
//     `${d}|${Math.abs(amt)}|${(name || "").trim()}`.toLowerCase();

//   const maps = new Map<string, { accountId?: string; accountName?: string }>();
//   for (const t of plaidResp.data.transactions) {
//     const acc = t.account_id ? accountsById.get(t.account_id) : undefined;
//     const accountName = acc?.name || acc?.official_name || acc?.subtype || acc?.type || undefined;
//     maps.set(keyFor(t.date, t.amount, t.name), { accountId: t.account_id, accountName });
//   }

//   // local docs missing accountId in the same window
//   const local = await Transaction.find({
//     userId,
//     source: "plaid",
//     date: {
//       $gte: new Date(startDate.toISOString().slice(0, 10)),
//       $lte: new Date(endDate.toISOString().slice(0, 10)),
//     },
//     $or: [{ accountId: { $exists: false } }, { accountId: null }],
//   }).lean();

//   const ops: any[] = [];
//   for (const t of local) {
//     const d = new Date(t.date);
//     const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
//       d.getUTCDate()
//     ).padStart(2, "0")}`;
//     const m = maps.get(keyFor(ymd, t.amount, t.description || ""));
//     if (m?.accountId) {
//       ops.push({
//         updateOne: {
//           filter: { _id: t._id },
//           update: { $set: { accountId: m.accountId, accountName: m.accountName } },
//         },
//       });
//     }
//   }

//   if (ops.length) await Transaction.bulkWrite(ops, { ordered: false });
//   return { updated: ops.length, scanned: local.length };
// }
