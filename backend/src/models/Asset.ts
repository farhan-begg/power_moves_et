// backend/src/models/Asset.ts
import mongoose, { Schema, Types, Document } from "mongoose";

export type AssetKind = "crypto" | "equity" | "cash" | "other";
export type AssetSource = "manual" | "wallet" | "exchange";

/** One purchase lot for a position (FIFO/LIFO ready) */
export interface IAssetLot extends Document {
  _id: Types.ObjectId;
  purchasedAt?: Date | null;     // when you bought this lot
  quantity: number;              // units in this lot
  unitCostUSD?: number | null;   // cost per unit in USD (optional)
  note?: string | null;
}

export interface IAsset extends Document {
  userId: Types.ObjectId;

  kind: AssetKind;                    // "crypto"
  source: AssetSource;                // "wallet" | "exchange" | "manual"
  accountScope: "global" | "account"; // align w/ ManualAsset pattern
  accountId?: string | null;          // e.g. "wallet:0xabc..." or ManualAccount _id

  // shared fields
  name?: string | null;
  symbol?: string | null;
  quantity: number;                   // quick total (keep in sync with lots)
  value?: number | null;

  // crypto specifics
  chainId?: number | null;
  contractAddress?: string | null;
  cgId?: string | null;
  decimals?: number | null;

  // price cache
  lastPrice?: number | null;
  lastPriceAt?: Date | null;

  // optional single-lot legacy fields (kept for backward-compat)
  buyDate?: Date | null;
  buyPriceUsd?: number | null;
  feesUsd?: number | null;
  notes?: string | null;

  // NEW: detailed lots
  lots: Types.DocumentArray<IAssetLot>;

  createdAt: Date;
  updatedAt: Date;
}

const AssetLotSchema = new Schema<IAssetLot>(
  {
    purchasedAt: { type: Date, default: null },
    quantity: { type: Number, required: true, min: 0 },
    unitCostUSD: { type: Number, default: null, min: 0 },
    note: { type: String, default: null, trim: true },
  },
  { _id: true } // allow .lots.id(lotId)
);

const AssetSchema = new Schema<IAsset>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["crypto", "equity", "cash", "other"], required: true, index: true },
    source: { type: String, enum: ["manual", "wallet", "exchange"], required: true, index: true },
    accountScope: { type: String, enum: ["global", "account"], default: "global" },
    accountId: { type: String, default: null, index: true },

    name: { type: String, trim: true, default: null },
    symbol: { type: String, trim: true, default: null },
    quantity: { type: Number, required: true, min: 0 }, // keep this synced with lots
    value: { type: Number, default: null },

    chainId: { type: Number, default: null },
    contractAddress: { type: String, trim: true, default: null },
    cgId: { type: String, trim: true, default: null },
    decimals: { type: Number, default: null },

    lastPrice: { type: Number, default: null },
    lastPriceAt: { type: Date, default: null },

    // legacy single-lot fields (optional)
    buyDate: { type: Date, default: null },
    buyPriceUsd: { type: Number, default: null, min: 0 },
    feesUsd: { type: Number, default: null, min: 0 },
    notes: { type: String, default: null },

    // NEW
    lots: { type: [AssetLotSchema], default: [] },
  },
  { timestamps: true }
);

// Helpful lookups
AssetSchema.index({ userId: 1, kind: 1 });
AssetSchema.index({ userId: 1, accountId: 1 });
AssetSchema.index({ userId: 1, cgId: 1, contractAddress: 1 });

export default mongoose.model<IAsset>("Asset", AssetSchema);
