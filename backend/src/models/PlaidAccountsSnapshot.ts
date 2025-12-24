import mongoose from "mongoose";

const PlaidAccountsSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    itemId: { type: String, required: true, index: true },
    accounts: { type: Array, default: [] }, // keep simple
    fetchedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

PlaidAccountsSnapshotSchema.index({ userId: 1, itemId: 1 }, { unique: true });

export default mongoose.model("PlaidAccountsSnapshot", PlaidAccountsSnapshotSchema);
