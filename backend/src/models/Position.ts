import mongoose, { Schema, Document } from "mongoose";

export interface IPosition extends Document {
  userId: mongoose.Types.ObjectId;
  symbol: string;
  name?: string;
  currency?: string;
  purchaseDate: Date;
  amountInvested: number;   // total $ user put in for this lot
  shares: number;           // computed = amountInvested / purchasePrice
  purchasePrice: number;    // price per share used
}

const PositionSchema = new Schema<IPosition>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    symbol: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String },
    currency: { type: String, default: "USD" },
    purchaseDate: { type: Date, required: true },
    amountInvested: { type: Number, required: true, min: 0 },
    shares: { type: Number, required: true, min: 0 },
    purchasePrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IPosition>("Position", PositionSchema);
