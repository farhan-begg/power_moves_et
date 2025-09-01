// src/types/plaid.ts (or at top of your widget file)
export type PlaidAccount = {
  account_id: string;
  name: string;
  mask?: string;
  type: string;
  subtype?: string;
  balances: {
    available?: number | null;
    current: number;
    limit?: number | null;
    iso_currency_code?: string | null;
  };
};
