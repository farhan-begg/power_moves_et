import React from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useMutation } from "@tanstack/react-query";
import { createLinkToken, exchangePublicToken } from "../../api/plaid";

export default function PlaidConnectWidget() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [publicToken, setPublicToken] = React.useState("");

  const getLinkToken = useMutation<{ link_token: string }, Error, void>({
    mutationFn: () => createLinkToken(token),
    onSuccess: (d) => setLinkToken(d.link_token),
  });

  const exchange = useMutation<{ message: string }, Error, void>({
    mutationFn: () => exchangePublicToken(token, publicToken),
  });

  return (
    <div className="space-y-3">
      <button
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-90"
        onClick={() => getLinkToken.mutate()}
      >
        {getLinkToken.isPending ? "Creating link token…" : "Create Link Token"}
      </button>

      {linkToken && (
        <div className="text-white/80 text-sm">
          Link token: <span className="font-mono break-all">{linkToken}</span>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={publicToken}
          onChange={(e) => setPublicToken(e.target.value)}
          placeholder="sandbox public_token"
          className="flex-1 bg-white/10 text-white px-3 py-2 rounded-lg outline-none"
        />
        <button
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-90"
          onClick={() => exchange.mutate()}
          disabled={!publicToken}
        >
          {exchange.isPending ? "Linking…" : "Exchange Token"}
        </button>
      </div>

      {exchange.isError && <div className="text-rose-300 text-sm">Failed to exchange token.</div>}
      {exchange.isSuccess && <div className="text-emerald-300 text-sm">Account linked successfully.</div>}
    </div>
  );
}
