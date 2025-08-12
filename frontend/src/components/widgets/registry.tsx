import React from "react";
import PlaidLinkButton from "../PlaidLinkButton";

export function PlaidConnectWidget() {
  return (
    <div className="space-y-3">
      <p className="text-white/80">
        Connect your bank via Plaid to sync transactions.
      </p>
      <PlaidLinkButton />
    </div>
  );
}

export function QuickStatsWidget() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl p-3 bg-white/5 border border-white/10">
        <div className="text-xs text-white/60">Today</div>
        <div className="text-lg font-semibold">$0.00</div>
      </div>
      <div className="rounded-xl p-3 bg-white/5 border border-white/10">
        <div className="text-xs text-white/60">This Month</div>
        <div className="text-lg font-semibold">$0.00</div>
      </div>
      <div className="rounded-xl p-3 bg-white/5 border border-white/10">
        <div className="text-xs text-white/60">Net</div>
        <div className="text-lg font-semibold">$0.00</div>
      </div>
    </div>
  );
}

export const widgetRenderer: Record<string, React.ComponentType<{}>> = {
  "plaid-connect": PlaidConnectWidget,
  "quick-stats": QuickStatsWidget,
};
