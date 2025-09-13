// backend/src/models/Recurring.ts
import { Schema, model, Types } from "mongoose";

/** Recurring series: bills / subscriptions / paychecks pattern */
export interface IRecurringSeries {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: "bill" | "subscription" | "paycheck";
  name: string;
  merchant?: string | null;
  cadence:
    | "weekly"
    | "biweekly"
    | "semimonthly"
    | "monthly"
    | "quarterly"
    | "yearly"
    | "unknown";
  // cadence helpers (optional depending on cadence)
  dayOfMonth?: number | null; // 1..28 (safe pin for monthly/semimonthly)
  weekday?: number | null;    // 0..6 (weekly)
  amountHint?: number | null; // expected amount (approx)
  active: boolean;

  lastSeen?: Date | null;     // last time we matched a tx for this series
  nextDue?: Date | null;      // best guess; updated on match

  createdAt: Date;
  updatedAt: Date;
}

export interface IBill {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  seriesId?: Types.ObjectId | null;
  name: string;
  merchant?: string | null;

  amount?: number | null;
  currency?: string | null;   // 👈 used by the widget, default USD
  dueDate?: Date | null;

  status: "predicted" | "due" | "paid" | "skipped";
  txId?: string | null;       // your transaction _id or external id (e.g., Plaid)
  paidAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface IPaycheckHit {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  seriesId?: Types.ObjectId | null;

  amount: number;
  date: Date;
  accountId?: string | null;    // bank account the paycheck hit
  employerName?: string | null; // detected/payee label
  txId?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

/* ===================== Schemas ===================== */

const RecurringSeriesSchema = new Schema<IRecurringSeries>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["bill", "subscription", "paycheck"], required: true, index: true },
    name: { type: String, required: true, trim: true },
    merchant: { type: String, trim: true, default: null },
    cadence: {
      type: String,
      enum: ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "yearly", "unknown"],
      required: true,
      default: "unknown",
    },
    dayOfMonth: { type: Number, min: 1, max: 28, default: null },
    weekday: { type: Number, min: 0, max: 6, default: null },
    amountHint: { type: Number, min: 0, default: null },
    active: { type: Boolean, default: true, index: true },
    lastSeen: { type: Date, default: null },
    nextDue: { type: Date, default: null },
  },
  { timestamps: true }
);

// Helpful uniqueness-ish index for quicker upserts (not strictly unique across all users)
RecurringSeriesSchema.index({ userId: 1, kind: 1, name: 1 });

const BillSchema = new Schema<IBill>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: "RecurringSeries", default: null, index: true },
    name: { type: String, required: true, trim: true },
    merchant: { type: String, trim: true, default: null },
    amount: { type: Number, min: 0, default: null },
    currency: { type: String, default: "USD" }, // 👈 added
    dueDate: { type: Date, default: null, index: true },
    status: {
      type: String,
      enum: ["predicted", "due", "paid", "skipped"],
      default: "due",
      index: true,
    },
    txId: { type: String, default: null, index: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Query patterns: by upcoming window and status
BillSchema.index({ userId: 1, status: 1, dueDate: 1 });

const PaycheckHitSchema = new Schema<IPaycheckHit>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: "RecurringSeries", default: null, index: true },
    amount: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true, index: true },
    accountId: { type: String, default: null },
    employerName: { type: String, default: null },
    txId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

// Query patterns: recent hits, by series or user
PaycheckHitSchema.index({ userId: 1, date: -1 });

/* ===================== Models ===================== */

export const RecurringSeries = model<IRecurringSeries>("RecurringSeries", RecurringSeriesSchema);
export const Bill = model<IBill>("Bill", BillSchema);
export const PaycheckHit = model<IPaycheckHit>("PaycheckHit", PaycheckHitSchema);
