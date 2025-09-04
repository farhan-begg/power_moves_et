// src/models/Category.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface CategoryDoc extends Document {
  _id: Types.ObjectId;            // 👈 add this line
  userId: Types.ObjectId;
  name: string;                   // "Food", "Transport"...
  icon?: string;                  // emoji or icon name
  color?: string;                 // hex for UI
}

const CategorySchema = new Schema<CategoryDoc>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name:   { type: String, required: true, trim: true },
  icon:   { type: String, default: "💳" },
  color:  { type: String, default: "#6B7280" },
}, { timestamps: true });

CategorySchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model<CategoryDoc>("Category", CategorySchema);
