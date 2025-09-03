// src/models/Transaction.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export type TxnSource = "manual" | "plaid";
export type TxnType = "income" | "expense";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  type: TxnType;

  // denormalized for fast reads & back-compat
  category: string;

  // normalized reference (optional but recommended)
  categoryId?: Types.ObjectId;

  amount: number;
  date: Date;
  description?: string;
  source: TxnSource;

  // account-scoping (plaid account_id or manual accountId)
  accountId?: string;
  accountName?: string;

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ["income", "expense"], required: true },

    // 🔽 keep BOTH (name + ref). Name is required for back-compat/UI,
    // ref is optional; you’ll gradually fill it.
    category: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },

    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    description: { type: String, trim: true },

    source: { type: String, enum: ["manual", "plaid"], required: true, index: true },

    accountId: { type: String, index: true },
    accountName: { type: String, trim: true },
  },
  { timestamps: true }
);

// helpful read patterns
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, accountId: 1, date: -1 });
TransactionSchema.index({ userId: 1, categoryId: 1, date: -1 });

export default mongoose.model<ITransaction>("Transaction", TransactionSchema);
