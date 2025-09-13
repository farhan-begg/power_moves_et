// backend/src/models/Transaction.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export type TxnSource = "manual" | "plaid";
export type TxnType = "income" | "expense";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  type: TxnType;

  category: string;
  categoryId?: Types.ObjectId;

  amount: number;
  date: Date;
  description?: string;
  source: TxnSource;

  // Account scoping
  accountId?: string;
  accountName?: string;

  // Plaid original id (optional)
  plaidTxId?: string | null;

  // Recurring links
  matchedRecurringId?: Types.ObjectId | null;
  matchedBillId?: Types.ObjectId | null;
  matchedPaycheckId?: Types.ObjectId | null;
  matchConfidence?: number | null;

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ["income", "expense"], required: true },

    category: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },

    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    description: { type: String, trim: true },

    source: { type: String, enum: ["manual", "plaid"], required: true, index: true },

    accountId: { type: String, index: true },
    accountName: { type: String, trim: true },

    plaidTxId: { type: String, index: true, default: null },

    matchedRecurringId: { type: Schema.Types.ObjectId, ref: "RecurringSeries", index: true, default: null },
    matchedBillId: { type: Schema.Types.ObjectId, ref: "Bill", index: true, default: null },
    matchedPaycheckId: { type: Schema.Types.ObjectId, ref: "PaycheckHit", index: true, default: null },
    matchConfidence: { type: Number, default: null },
  },
  { timestamps: true }
);

// Helpful indexes
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, accountId: 1, date: -1 });
TransactionSchema.index({ userId: 1, categoryId: 1, date: -1 }, { sparse: true });
TransactionSchema.index({ userId: 1, amount: 1, date: -1 });
TransactionSchema.index({ userId: 1, description: 1 });
TransactionSchema.index({ userId: 1, plaidTxId: 1 }, { sparse: true });


export default mongoose.model<ITransaction>("Transaction", TransactionSchema);
