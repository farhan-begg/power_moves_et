import mongoose, { Schema, Document, Types } from "mongoose";

export interface ManualAccountAttrs {
  userId: Types.ObjectId;
  name: string;
  currency?: string;
  accountId?: string | null; // add accountId support (manual or plaid-like)
}

export interface ManualAccountDoc extends Document, ManualAccountAttrs {
  createdAt: Date;
  updatedAt: Date;
}

const ManualAccountSchema = new Schema<ManualAccountDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    accountId: {
      type: String,
      default: null, // null means "manual/global"
    },
  },
  { timestamps: true }
);

/**
 * ✅ Indexes
 *
 * - Ensure accountId is unique **per user**, but allow multiple nulls.
 * - Optional: name uniqueness per user (commented out).
 */

// Compound unique index for (userId + accountId) when accountId is a string
ManualAccountSchema.index(
  { userId: 1, accountId: 1 },
  {
    unique: true,
    partialFilterExpression: { accountId: { $type: "string" } }, // ignores nulls
  }
);

// (Optional) Uncomment if you want to prevent duplicate account names per user
// ManualAccountSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model<ManualAccountDoc>(
  "ManualAccount",
  ManualAccountSchema
);

