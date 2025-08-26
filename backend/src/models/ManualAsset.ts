import mongoose, { Schema, Document } from "mongoose";

export interface ManualAssetDoc extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  type: "cash" | "security" | "property" | "other";
  value: number;
  currency: string;
  notes?: string;
  asOf: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ManualAssetSchema = new Schema<ManualAssetDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["cash", "security", "property", "other"], default: "other" },
    value: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    notes: { type: String },
    asOf: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<ManualAssetDoc>("ManualAsset", ManualAssetSchema);
