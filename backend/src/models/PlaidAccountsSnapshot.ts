import mongoose, { Schema, Types } from "mongoose";

type AccountLite = {
  accountId: string;
  name: string;
  officialName?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

const AccountLiteSchema = new Schema<AccountLite>(
  {
    accountId: { type: String, required: true },
    name: { type: String, required: true },
    officialName: { type: String, default: null },
    mask: { type: String, default: null },
    type: { type: String, default: null },
    subtype: { type: String, default: null },
  },
  { _id: false }
);

const PlaidAccountsSnapshotSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    itemId: { type: String, required: true, index: true },

    // ✅ helps you group by bank instantly in the UI
    institutionId: { type: String, default: null },
    institutionName: { type: String, default: null },

    accounts: { type: [AccountLiteSchema], default: [] },
    fetchedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// one snapshot per (user, item)
PlaidAccountsSnapshotSchema.index({ userId: 1, itemId: 1 }, { unique: true });

// optional but useful
PlaidAccountsSnapshotSchema.index({ userId: 1, fetchedAt: -1 });

export default mongoose.model("PlaidAccountsSnapshot", PlaidAccountsSnapshotSchema);
