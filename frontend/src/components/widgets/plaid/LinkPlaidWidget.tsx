import { useEffect, useMemo, useState, useCallback } from "react";
import { usePlaidLink, type PlaidLinkOptions } from "react-plaid-link";
import { useAppDispatch } from "../../../hooks/hooks";
import { fetchAllPlaid } from "../../../features/plaid/plaidSlice";

export default function LinkPlaidWidget() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const jwt = localStorage.getItem("token") ?? "";

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:5000/api/plaid/link-token", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(await res.text());
        const { link_token } = await res.json();
        setLinkToken(link_token);
      } catch (e: any) {
        setError(e?.message ?? "Failed to create link token");
      }
    })();
  }, [jwt]);

  const onSuccess = useCallback<PlaidLinkOptions["onSuccess"]>(async (public_token) => {
    await fetch("http://localhost:5000/api/plaid/exchange-public-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ public_token }),
    });
    dispatch(fetchAllPlaid());
  }, [jwt, dispatch]);

  const config = useMemo<PlaidLinkOptions>(() => ({
    token: linkToken ?? "",
    onSuccess,
  }), [linkToken, onSuccess]);

  const { open, ready } = usePlaidLink(config);

  return (
    <div className="p-3">
      {error && <div className="text-red-300 mb-2 text-sm">{error}</div>}
      <button
        onClick={() => open()}
        disabled={!ready || !linkToken}
        className="px-3 py-2 rounded-lg bg-emerald-500 disabled:opacity-50"
      >
        {linkToken ? "Link accounts" : "Preparing…"}
      </button>
      <p className="text-xs opacity-70 mt-2">Connect to fetch net worth, cards, and investments.</p>
    </div>
  );
}
