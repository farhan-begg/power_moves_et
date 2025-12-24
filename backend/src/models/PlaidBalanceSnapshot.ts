import mongoose from "mongoose";

const AccountBalanceSchema = new mongoose.Schema(
  {
    account_id: { type: String, required: true },
    name: { type: String },
    official_name: { type: String },
    mask: { type: String },
    type: { type: String },
    subtype: { type: String },
    iso_currency_code: { type: String },
    unofficial_currency_code: { type: String },
    balances: {
      available: { type: Number },
      current: { type: Number },
      limit: { type: Number },
      iso_currency_code: { type: String },
      unofficial_currency_code: { type: String },
      last_updated_datetime: { type: String },
    },
  },
  { _id: false }
);

const PlaidBalanceSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    itemId: { type: String, required: true, index: true },
    accounts: { type: [AccountBalanceSchema], default: [] },

    netWorth: { type: Number, default: 0 },
    totalAssets: { type: Number, default: 0 },
    totalLiabilities: { type: Number, default: 0 },

    fetchedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

PlaidBalanceSnapshotSchema.index({ userId: 1, itemId: 1 }, { unique: true });

export default mongoose.model("PlaidBalanceSnapshot", PlaidBalanceSnapshotSchema);
