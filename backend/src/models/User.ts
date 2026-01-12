import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string; // ✅ Optional for OAuth users
  provider?: "local" | "google" | "apple"; // ✅ OAuth provider
  providerId?: string; // ✅ OAuth provider user ID
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
    password: { type: String, required: false }, // ✅ Optional for OAuth users
    provider: { 
      type: String, 
      enum: ["local", "google", "apple"], 
      default: "local" 
    }, // ✅ OAuth provider
    providerId: { type: String }, // ✅ OAuth provider user ID
    widgetPreferences: {
      order: { type: [String], default: [] },
      widgets: { type: Schema.Types.Mixed, default: {} },
    },
  },
  { timestamps: true }
);

// 🔒 Hash password (only for local users)
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  // Only hash password if it exists and is not already hashed
  if (this.password.length < 60) { // bcrypt hashes are 60 chars
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// 🔑 Compare password (only for local users)
UserSchema.methods.comparePassword = function (candidatePassword: string) {
  if (!this.password) {
    // OAuth users don't have passwords
    return Promise.resolve(false);
  }
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
