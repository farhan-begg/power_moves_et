// backend/src/models/PlaidItem.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPlaidToken {
  content: string;
  iv: string;
  tag: string;
}

export type PlaidItemStatus = "active" | "error" | "revoked";

export interface IPlaidItem extends Document {
  userId: Types.ObjectId;

  // Plaid identifiers
  itemId: string;              // Plaid item_id
  accessToken: IPlaidToken;    // encrypted token object

  // Institution metadata
  institutionId?: string | null;
  institutionName?: string | null;

  // Multi-bank controls
  isPrimary: boolean;
  status: PlaidItemStatus;

  // Debug / UX helpers
  lastGoodSyncAt?: Date | null;
  lastError?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const PlaidTokenSchema = new Schema<IPlaidToken>(
  {
    content: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
  },
  { _id: false }
);

const PlaidItemSchema = new Schema<IPlaidItem>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ❗IMPORTANT: do NOT make itemId globally unique; make it unique per user via compound index below
    itemId: { type: String, required: true },

    accessToken: { type: PlaidTokenSchema, required: true },

    institutionId: { type: String, default: null },
    institutionName: { type: String, default: null },

    isPrimary: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "error", "revoked"],
      default: "active",
    },

    lastGoodSyncAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true }
);

// ✅ indexes for multi-bank + fast lookups
PlaidItemSchema.index({ userId: 1, itemId: 1 }, { unique: true }); // unique per user
PlaidItemSchema.index({ userId: 1, isPrimary: 1 });                // find primary fast
PlaidItemSchema.index({ userId: 1, status: 1 });                   // filter by status fast
PlaidItemSchema.index({ userId: 1, createdAt: -1 });               // list newest first fast

// Optional: prevent returning encrypted token by accident
PlaidItemSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    delete ret.accessToken;
    return ret;
  },
});

export default mongoose.model<IPlaidItem>("PlaidItem", PlaidItemSchema);
