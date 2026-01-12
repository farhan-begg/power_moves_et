// backend/src/routes/oauthRoutes.ts
import { Router, type Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import PlaidItem from "../models/PlaidItem";
import plaidClient from "../services/plaidService";
import { decrypt } from "../utils/cryptoUtils";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret";

function generateToken(userId: string) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "1d" });
}

// ✅ Google OAuth Client
import { OAuth2Client } from "google-auth-library";

const googleClient = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ? new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.FRONTEND_URL || process.env.OAUTH_REDIRECT_URL || "http://localhost:3000"}/auth/callback`
    )
  : null;

/* =========================================================================================
   GET /api/auth/google
   Redirects user to Google OAuth consent screen
========================================================================================= */
router.get("/google", async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(500).json({ 
        error: "Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env" 
      });
    }
    const authUrl = googleClient.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      prompt: "consent",
    });
    res.redirect(authUrl);
  } catch (error: any) {
    console.error("❌ Google OAuth error:", error);
    res.status(500).json({ error: "Failed to initiate Google login" });
  }
});

/* =========================================================================================
   GET /api/auth/google/callback
   Handles Google OAuth callback
========================================================================================= */
router.get("/google/callback", async (req, res) => {
  try {
    if (!googleClient) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_not_configured`);
    }
    
    const { code } = req.query;
    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_failed`);
    }

    // Exchange code for tokens
    const { tokens } = await googleClient.getToken(code as string);
    googleClient.setCredentials(tokens);

    // Get user info from Google
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=no_email`);
    }

    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { email },
        { providerId: googleId, provider: "google" }
      ]
    });

    if (user) {
      // Update provider info if needed
      if (!user.providerId) {
        user.providerId = googleId;
        user.provider = "google";
        await user.save();
      }
    } else {
      // Create new user
      user = new User({
        email,
        name: name || email.split("@")[0],
        provider: "google",
        providerId: googleId,
        // No password for OAuth users
      });
      await user.save();
    }

    const token = generateToken(String(user._id));

    // 🔄 Background Plaid sync (same as regular login)
    (async () => {
      try {
        const userId = user._id;
        const items = await PlaidItem.find({ userId, status: "active" }).lean();
        if (!items.length) return;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 730);
        const endDate = new Date();

        for (const item of items) {
          try {
            const encryptedToken = (item as any).accessToken;
            if (!encryptedToken) continue;

            const accessToken = decrypt(encryptedToken);
            const itemDoc = await PlaidItem.findOne({ userId, itemId: (item as any).itemId });
            let loginStartDate = startDate;
            
            if (itemDoc?.lastGoodSyncAt) {
              const daysSinceLastSync = Math.floor(
                (Date.now() - itemDoc.lastGoodSyncAt.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysSinceLastSync < 7) {
                loginStartDate = new Date(itemDoc.lastGoodSyncAt);
                loginStartDate.setDate(loginStartDate.getDate() - 1);
              }
            }

            let offset = 0;
            const count = 100;
            const accountNameMap: Record<string, string> = {};
            const bulkOps: any[] = [];
            const BATCH_SIZE = 500;
            let totalProcessed = 0;

            while (true) {
              const plaidResponse = await plaidClient.transactionsGet({
                access_token: accessToken,
                start_date: loginStartDate.toISOString().split("T")[0],
                end_date: endDate.toISOString().split("T")[0],
                options: { count, offset },
              });

              const plaidTransactions = plaidResponse.data.transactions || [];
              const accounts = plaidResponse.data.accounts || [];
              const totalTransactions = plaidResponse.data.total_transactions || 0;

              for (const acct of accounts) {
                accountNameMap[acct.account_id] = acct.name || acct.official_name || "Account";
              }

              for (const txn of plaidTransactions) {
                const rawAmount = Number(txn.amount) || 0;
                const isIncomeCategory =
                  txn.personal_finance_category?.primary &&
                  String(txn.personal_finance_category.primary).toUpperCase().startsWith("INCOME");
                const type: "income" | "expense" =
                  rawAmount < 0 || isIncomeCategory ? "income" : "expense";
                const amount = Math.abs(rawAmount);
                const category =
                  txn.personal_finance_category?.detailed ||
                  txn.personal_finance_category?.primary ||
                  txn.category?.[0] ||
                  "Uncategorized";
                const description = txn.merchant_name || txn.name || "Transaction";

                bulkOps.push({
                  updateOne: {
                    filter: { userId, plaidTxId: txn.transaction_id },
                    update: {
                      $set: {
                        userId,
                        source: "plaid",
                        plaidTxId: txn.transaction_id,
                        accountId: txn.account_id,
                        accountName: accountNameMap[txn.account_id] || undefined,
                        type,
                        category,
                        amount,
                        date: new Date(txn.date),
                        description,
                      },
                    },
                    upsert: true,
                  },
                });
              }

              if (bulkOps.length >= BATCH_SIZE) {
                await require("../models/Transaction").default.bulkWrite(bulkOps, { ordered: false });
                totalProcessed += bulkOps.length;
                bulkOps.length = 0;
              }

              offset += plaidTransactions.length;
              if (offset >= totalTransactions || plaidTransactions.length === 0) break;
            }

            if (bulkOps.length > 0) {
              await require("../models/Transaction").default.bulkWrite(bulkOps, { ordered: false });
            }

            await PlaidItem.updateOne(
              { _id: item._id },
              { $set: { status: "active", lastGoodSyncAt: new Date(), lastError: null } }
            );
          } catch (err: any) {
            console.error(`❌ Plaid sync error for item ${(item as any).itemId}:`, err?.message || err);
          }
        }
      } catch (err: any) {
        console.error("❌ Background Plaid sync error:", err?.message || err);
      }
    })();

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/callback?token=${token}`);
  } catch (error: any) {
    console.error("❌ Google OAuth callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_failed`);
  }
});

/* =========================================================================================
   POST /api/auth/apple
   Apple Sign In (uses POST because Apple requires it)
========================================================================================= */
router.post("/apple", async (req, res) => {
  try {
    const { identityToken, authorizationCode, user } = req.body;
    
    if (!identityToken) {
      return res.status(400).json({ error: "Identity token required" });
    }

    // ✅ Note: Apple token verification requires additional setup
    // For now, we'll decode the JWT token (in production, verify with Apple's public keys)
    // In production, use @apple/apple-signin-auth or verify JWT with Apple's public keys
    
    // Decode JWT (simplified - in production, verify signature)
    const base64Url = identityToken.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = JSON.parse(Buffer.from(base64, "base64").toString());
    
    const { email, sub: appleId } = jsonPayload;
    const name = user?.name || email?.split("@")[0] || "User";

    if (!email) {
      return res.status(400).json({ error: "Email not provided by Apple" });
    }

    // Find or create user
    let userDoc = await User.findOne({
      $or: [
        { email },
        { providerId: appleId, provider: "apple" }
      ]
    });

    if (userDoc) {
      if (!userDoc.providerId) {
        userDoc.providerId = appleId;
        userDoc.provider = "apple";
        await userDoc.save();
      }
    } else {
      userDoc = new User({
        email,
        name,
        provider: "apple",
        providerId: appleId,
      });
      await userDoc.save();
    }

    const token = generateToken(String(userDoc._id));

    // 🔄 Background Plaid sync (same as Google)
    (async () => {
      try {
        const userId = userDoc._id;
        const items = await PlaidItem.find({ userId, status: "active" }).lean();
        if (!items.length) return;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 730);
        const endDate = new Date();

        for (const item of items) {
          try {
            const encryptedToken = (item as any).accessToken;
            if (!encryptedToken) continue;

            const accessToken = decrypt(encryptedToken);
            const itemDoc = await PlaidItem.findOne({ userId, itemId: (item as any).itemId });
            let loginStartDate = startDate;
            
            if (itemDoc?.lastGoodSyncAt) {
              const daysSinceLastSync = Math.floor(
                (Date.now() - itemDoc.lastGoodSyncAt.getTime()) / (1000 * 60 * 60 * 24)
              );
              if (daysSinceLastSync < 7) {
                loginStartDate = new Date(itemDoc.lastGoodSyncAt);
                loginStartDate.setDate(loginStartDate.getDate() - 1);
              }
            }

            let offset = 0;
            const count = 100;
            const accountNameMap: Record<string, string> = {};
            const bulkOps: any[] = [];
            const BATCH_SIZE = 500;

            while (true) {
              const plaidResponse = await plaidClient.transactionsGet({
                access_token: accessToken,
                start_date: loginStartDate.toISOString().split("T")[0],
                end_date: endDate.toISOString().split("T")[0],
                options: { count, offset },
              });

              const plaidTransactions = plaidResponse.data.transactions || [];
              const accounts = plaidResponse.data.accounts || [];
              const totalTransactions = plaidResponse.data.total_transactions || 0;

              for (const acct of accounts) {
                accountNameMap[acct.account_id] = acct.name || acct.official_name || "Account";
              }

              for (const txn of plaidTransactions) {
                const rawAmount = Number(txn.amount) || 0;
                const isIncomeCategory =
                  txn.personal_finance_category?.primary &&
                  String(txn.personal_finance_category.primary).toUpperCase().startsWith("INCOME");
                const type: "income" | "expense" =
                  rawAmount < 0 || isIncomeCategory ? "income" : "expense";
                const amount = Math.abs(rawAmount);
                const category =
                  txn.personal_finance_category?.detailed ||
                  txn.personal_finance_category?.primary ||
                  txn.category?.[0] ||
                  "Uncategorized";
                const description = txn.merchant_name || txn.name || "Transaction";

                bulkOps.push({
                  updateOne: {
                    filter: { userId, plaidTxId: txn.transaction_id },
                    update: {
                      $set: {
                        userId,
                        source: "plaid",
                        plaidTxId: txn.transaction_id,
                        accountId: txn.account_id,
                        accountName: accountNameMap[txn.account_id] || undefined,
                        type,
                        category,
                        amount,
                        date: new Date(txn.date),
                        description,
                      },
                    },
                    upsert: true,
                  },
                });
              }

              if (bulkOps.length >= BATCH_SIZE) {
                await require("../models/Transaction").default.bulkWrite(bulkOps, { ordered: false });
                bulkOps.length = 0;
              }

              offset += plaidTransactions.length;
              if (offset >= totalTransactions || plaidTransactions.length === 0) break;
            }

            if (bulkOps.length > 0) {
              await require("../models/Transaction").default.bulkWrite(bulkOps, { ordered: false });
            }

            await PlaidItem.updateOne(
              { _id: item._id },
              { $set: { status: "active", lastGoodSyncAt: new Date(), lastError: null } }
            );
          } catch (err: any) {
            console.error(`❌ Plaid sync error for item ${(item as any).itemId}:`, err?.message || err);
          }
        }
      } catch (err: any) {
        console.error("❌ Background Plaid sync error:", err?.message || err);
      }
    })();

    return res.json({
      token,
      user: { id: userDoc._id, name: userDoc.name, email: userDoc.email },
    });
  } catch (error: any) {
    console.error("❌ Apple OAuth error:", error);
    return res.status(500).json({ error: "Apple login failed", details: error?.message });
  }
});

export default router;
