// src/types/manualAsset.ts (new or wherever you keep types)
export type ManualAssetScope = "global" | "account";

export interface ManualAsset {
  _id: string;
  userId: string;
  name: string;
  type: "cash" | "security" | "property" | "other";
  value: number;
  currency: string;
  notes?: string;
  asOf: string;        // ISO from backend
  scope: ManualAssetScope;
  accountId?: string;  // present only when scope === "account"
  createdAt: string;
  updatedAt: string;
}
