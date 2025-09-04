// backend/src/scripts/backfillCategoryIds.ts
import "dotenv/config";
import mongoose, { Types } from "mongoose";

// Import your models (works whether you compile or run with ts-node)
import Category from "../models/Category";
import Transaction from "../models/Transaction";

// ---- helpers ----
function toObjectIdOrNull(v: unknown): Types.ObjectId | null {
  // Accept already-ObjectId or strings that look like ObjectId
  if (v instanceof Types.ObjectId) return v;
  const s = String(v ?? "");
  return mongoose.isValidObjectId(s) ? new Types.ObjectId(s) : null;
}

async function main(): Promise<void> {
  const uri =
    process.env.MONGO_URI || "mongodb://localhost:27017/expensetracker";

  await mongoose.connect(uri);
  console.log("✅ Connected");

  // Find distinct (userId, category) pairs where categoryId is missing
  const pairs: Array<{ _id: { userId: unknown; name: string } }> =
    await Transaction.aggregate([
      {
        $match: {
          // categoryId missing or null
          $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
          // valid category string
          category: { $type: "string", $ne: "" },
        },
      },
      { $group: { _id: { userId: "$userId", name: "$category" } } },
    ]);

  console.log(`Found ${pairs.length} (user,category) pairs to backfill`);

  let createdCats = 0;
  let updatedTxns = 0;
  let skipped = 0;

  for (const p of pairs) {
    const rawUserId = p._id.userId;
    const userId = toObjectIdOrNull(rawUserId);
    const name = (p._id.name || "").trim();

    if (!userId) {
      skipped++;
      console.warn(
        `⚠️  Skipping pair with invalid userId:`,
        rawUserId,
        `category: "${name}"`
      );
      continue;
    }
    if (!name) {
      skipped++;
      console.warn(`⚠️  Skipping empty category name for user ${userId}`);
      continue;
    }

    // Ensure the category exists for this user
    let cat = await Category.findOne({ userId, name });
    if (!cat) {
      cat = await Category.create({
        userId,
        name,
        icon: "💳",
        color: "#6B7280",
      });
      createdCats++;
      console.log(`+ Created category "${name}" for user ${userId}`);
    }

    // Backfill all transactions missing categoryId for this (userId, name)
    const res = await Transaction.updateMany(
      { userId, category: name, $or: [{ categoryId: { $exists: false } }, { categoryId: null }] },
      { $set: { categoryId: cat._id } }
    );

    // .modifiedCount in Mongoose 6+, fallback for older
    const modified =
      // @ts-ignore - handle both shapes
      (res.modifiedCount ?? res.nModified ?? 0) as number;
    updatedTxns += modified;
  }

  console.log(
    `✅ Done. Categories created: ${createdCats}, Transactions updated: ${updatedTxns}, Skipped pairs: ${skipped}`
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Backfill error:", e);
  process.exit(1);
});
