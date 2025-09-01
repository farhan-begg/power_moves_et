import mongoose, { Schema, Document, Types } from "mongoose";

export type TxnSource = "manual" | "plaid";
export type TxnType = "income" | "expense";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  type: TxnType;
  category: string;
  amount: number;
  date: Date;
  description?: string;
  source: TxnSource;

  // NEW: Account info for filtering
  accountId?: string;    // Plaid account_id or a custom id you set for manual
  accountName?: string;  // Human friendly (e.g., "Chase Checking")

  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ["income", "expense"], required: true },
    category: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    description: { type: String },

    source: { type: String, enum: ["manual", "plaid"], required: true, index: true },

    // NEW
    accountId: { type: String, index: true },
    accountName: { type: String },
  },
  { timestamps: true }
);

// Helpful compound indexes (optional)
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, accountId: 1, date: -1 });

export default mongoose.model<ITransaction>("Transaction", TransactionSchema);
