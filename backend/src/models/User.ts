import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  widgetPreferences?: {
    order: string[];
    widgets: Record<string, any>;
  };
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    widgetPreferences: {
      order: { type: [String], default: [] },
      widgets: { type: Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true }
);

// 🔒 Hash password
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 🔑 Compare password
UserSchema.methods.comparePassword = function (candidatePassword: string) {
  return bcrypt.compare(candidatePassword, this.password);
};

// 🚫 Remove sensitive fields
UserSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    const { password, __v, ...safe } = ret;
    return safe;
  },
});

export default mongoose.model<IUser>("User", UserSchema);
