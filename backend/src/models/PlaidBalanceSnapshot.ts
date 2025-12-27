import mongoose, { Schema } from "mongoose";

const AccountBalanceSchema = new Schema(
  {
    account_id: { type: String, required: true },
    name: { type: String, default: null },
    official_name: { type: String, default: null },
    mask: { type: String, default: null },
    type: { type: String, default: null },
    subtype: { type: String, default: null },
    iso_currency_code: { type: String, default: null },
    unofficial_currency_code: { type: String, default: null },

    balances: {
      available: { type: Number, default: null },
      current: { type: Number, default: null },
      limit: { type: Number, default: null },
      iso_currency_code: { type: String, default: null },
      unofficial_currency_code: { type: String, default: null },
      last_updated_datetime: { type: String, default: null },
    },
  },
  { _id: false }
);

const PlaidBalanceSnapshotSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    itemId: { type: String, required: true, index: true },

    // ✅ helps UI group without extra joins
    institutionId: { type: String, default: null },
    institutionName: { type: String, default: null },

    accounts: { type: [AccountBalanceSchema], default: [] },

    // cached totals for THIS bank item
    netWorth: { type: Number, default: 0 },
    totalAssets: { type: Number, default: 0 },
    totalLiabilities: { type: Number, default: 0 },

    fetchedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// one snapshot per (user, item)
PlaidBalanceSnapshotSchema.index({ userId: 1, itemId: 1 }, { unique: true });

// optional but useful
PlaidBalanceSnapshotSchema.index({ userId: 1, fetchedAt: -1 });

export default mongoose.model("PlaidBalanceSnapshot", PlaidBalanceSnapshotSchema);
