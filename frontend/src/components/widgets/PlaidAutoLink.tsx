// src/components/widgets/plaid/PlaidAutoLink.tsx
import React, { useEffect } from "react";
import PlaidLinkButton from "./PlaidLinkButton";

export default function PlaidAutoLink({ onSuccess }: { onSuccess: () => void }) {
  useEffect(() => {
    const handleLinked = () => onSuccess();
    window.addEventListener("plaid:linked", handleLinked);
    return () => window.removeEventListener("plaid:linked", handleLinked);
  }, [onSuccess]);

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-950 text-white overflow-hidden px-4 sm:px-6">
      <div className="relative z-10 max-w-lg w-full p-6 sm:p-10 rounded-2xl sm:rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10">
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Link your accounts</h1>
        <p className="mt-3 text-gray-300 text-sm sm:text-base leading-relaxed">
          Securely connect your bank with Plaid to unlock balances, transactions, and insights.
        </p>
        <div className="mt-6 h-[1px] w-full bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
        <div className="mt-8 flex justify-center">
          <PlaidLinkButton autoOpen />
        </div>
      </div>
      <div className="absolute w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] bg-cyan-500/10 rounded-full blur-3xl" />
    </div>
  );
}
