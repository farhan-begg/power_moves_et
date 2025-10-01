// src/models/User.ts
import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { encrypt, decrypt } from "../utils/cryptoUtils"; // import your AES utils

export interface IPlaidToken {
  content: string;
  iv: string;
  tag: string;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  comparePassword(candidatePassword: string): Promise<boolean>;

  // Encrypted in DB
  plaidAccessToken: IPlaidToken | null;

  // Helpers
  setPlaidAccessToken(rawToken: string): void;
  getPlaidAccessToken(): string | null;
}

const PlaidTokenSchema = new Schema<IPlaidToken>(
  {
    content: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
  },
  { _id: false }
);

const UserSchema: Schema<IUser> = new Schema(
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
    plaidAccessToken: { type: PlaidTokenSchema, default: null },
  },
  { timestamps: true }
);

// 🔒 Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 🔑 Compare password helper
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  return bcrypt.compare(candidatePassword, this.password);
};

// 🔐 Store Plaid token securely
UserSchema.methods.setPlaidAccessToken = function (rawToken: string) {
  this.plaidAccessToken = encrypt(rawToken);
};

// 🔓 Retrieve Plaid token (decrypted)
UserSchema.methods.getPlaidAccessToken = function (): string | null {
  if (!this.plaidAccessToken) return null;
  return decrypt(this.plaidAccessToken);
};

// 🚫 Hide sensitive fields in JSON output
UserSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    delete ret.password;
    delete ret.plaidAccessToken;
    return ret;
  },
});


export default mongoose.model<IUser>("User", UserSchema);
