// src/components/common/AccountSelect.tsx
import React from "react";
import { AccountLike } from "../../hooks/useAccounts";

type Props = {
  accounts: AccountLike[];
  value: string;                // "" means All
  onChange: (v: string) => void;
  className?: string;
};

export default function AccountSelect({ accounts, value, onChange, className = "" }: Props) {
  return (
    <select
      className={["rounded-lg bg-white/10 text-sm text-white ring-1 ring-white/10 px-3 py-2", className].join(" ")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All accounts</option>
      {accounts.map((a) => (
        <option key={a.accountId} value={a.accountId}>
          {a.name}{a.mask ? ` •••• ${a.mask}` : ""}
        </option>
      ))}
    </select>
  );
}
