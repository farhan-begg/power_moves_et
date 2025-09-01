import { Schema, model, Types, Document } from "mongoose";

export type GoalType =
  | "savings"
  | "emergency_fund"
  | "spending_limit"
  | "debt_paydown"
  | "investment"
  | "custom";

export interface IContribution {
  _id: Types.ObjectId;
  amount: number;              // positive for add, negative for withdrawal
  date: Date;
  source: "manual" | "auto";
  note?: string;
  txIds?: string[];            // link to transaction IDs if auto from bank/ledger
}

export interface IGoal extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;      // owner (stored as ObjectId)
  name: string;
  type: GoalType;
  targetAmount: number;        // for spending_limit this is the MAX allowed in a period
  currency: string;            // e.g. "USD"
  currentAmount: number;       // denormalized cache for fast progress bars
  startDate?: Date;
  deadline?: Date;             // nullable for ongoing goals
  recurrence?: {
    freq: "none" | "weekly" | "monthly" | "quarterly" | "yearly";
    // anchor day for period rollovers. For monthly/yearly we use day-of-month; for weekly we use weekday (0=Sun)
    anchorDay?: number;
  };
  // Linkages let the backend auto-generate contributions from user transactions
  linkages?: {
    accountIds?: string[];     // e.g., Plaid account IDs you already store
    categories?: string[];     // internal category slugs/ids (e.g., "groceries", "rent")
    direction?: "income" | "expense"; // for spending_limit use "expense"
    // aggregation strategy; "sum" is typical. For some investment goals you might choose "net" (income - expense)
    aggregator?: "sum" | "net";
  };
  // Contributions history (manual + auto). Keep it compact, not every tx, just rollups if needed.
  contributions: IContribution[];
  status: "active" | "paused" | "completed" | "failed";
  createdAt: Date;
  updatedAt: Date;
}

const ContributionSchema = new Schema<IContribution>({
  amount: { type: Number, required: true },
  date:   { type: Date, required: true, default: () => new Date() },
  source: { type: String, enum: ["manual", "auto"], required: true },
  note:   { type: String },
  txIds:  { type: [String], default: [] },
});

const GoalSchema = new Schema<IGoal>(
  {
    userId:        { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name:          { type: String, required: true, trim: true },
    type:          {
      type: String,
      enum: ["savings","emergency_fund","spending_limit","debt_paydown","investment","custom"],
      required: true,
      default: "savings",
      index: true,
    },
    targetAmount:  { type: Number, required: true, min: 0 },
    currency:      { type: String, required: true, default: "USD" },
    currentAmount: { type: Number, required: true, default: 0 },
    startDate:     { type: Date },
    deadline:      { type: Date },
    recurrence:    {
      freq:      { type: String, enum: ["none","weekly","monthly","quarterly","yearly"], default: "none" },
      anchorDay: { type: Number },
    },
    linkages: {
      accountIds: [String],
      categories: [String],
      direction:  { type: String, enum: ["income","expense"] },
      aggregator: { type: String, enum: ["sum","net"], default: "sum" },
    },
    contributions: { type: [ContributionSchema], default: [] },
    status:        { type: String, enum: ["active","paused","completed","failed"], default: "active" },
  },
  { timestamps: true }
);

GoalSchema.index({ userId: 1, type: 1 });
GoalSchema.index({ userId: 1, status: 1 });

export const Goal = model<IGoal>("Goal", GoalSchema);
