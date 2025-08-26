import { useEffect, useState, useCallback } from "react";
import {
  usePlaidLink,
  type PlaidLinkOptions,
  type PlaidLinkOnSuccess,
  type PlaidLinkOnExit,
} from "react-plaid-link";

async function hit(url: string, jwt: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
      ...(opts?.headers || {}),
    },
  });
  // swallow body on non-OK to get a readable error
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => ({}));
}

function PlaidLinkButton({
  token,
  jwt,
  onLinked,
}: {
  token: string;
  jwt: string;
  onLinked?: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (public_token) => {
    try {
      setErr(null);
      setBusy(true);

      // 1) exchange token
      await hit("http://localhost:5000/api/plaid/exchange-public-token", jwt, {
        method: "POST",
        body: JSON.stringify({ public_token }),
      });

      // 2) warm/sync data so your widgets have something to fetch
      await Promise.allSettled([
        // this GET triggers your upsert sync
        hit("http://localhost:5000/api/plaid/transactions", jwt),
        // these just warm caches / prove connectivity (ignore results)
        hit("http://localhost:5000/api/plaid/accounts", jwt),
        hit("http://localhost:5000/api/plaid/investments", jwt).catch(() => {}),
        hit("http://localhost:5000/api/plaid/net-worth", jwt).catch(() => {}),
      ]);

      // 3) tell the app it’s ready
      if (onLinked) onLinked();
      else window.location.reload(); // simple fallback if you don’t wire a callback
    } catch (e: any) {
      setErr(e?.message || "Linking failed");
    } finally {
      setBusy(false);
    }
  }, [jwt, onLinked]);

  const onExit = useCallback<PlaidLinkOnExit>((error) => {
    if (error) {
      setErr(`${error.error_code}: ${error.display_message || error.error_message || "Link exited"}`);
    }
  }, []);

  // only initialize Plaid when we actually have a token
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit } as PlaidLinkOptions);

  return (
    <>
      {err && <div className="text-red-300 mb-2 text-sm">{err}</div>}
      <button
        onClick={() => open()}
        disabled={!ready || busy}
        className="px-3 py-2 rounded-lg bg-emerald-500 disabled:opacity-50"
      >
        {busy ? "Linking…" : "Link accounts"}
      </button>
    </>
  );
}

export default function LinkPlaidWidget({ onLinked }: { onLinked?: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jwt = localStorage.getItem("token") ?? "";

  const createLinkToken = useCallback(async () => {
    setError(null);
    setLinkToken(null);
    try {
      const res = await fetch("http://localhost:5000/api/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create link token");
      setLinkToken(json.link_token);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create link token");
    }
  }, [jwt]);

  useEffect(() => { createLinkToken(); }, [createLinkToken]);

  return (
    <div className="p-3">
      {error && <div className="text-red-300 mb-2 text-sm">{error}</div>}

      {!linkToken ? (
        <button onClick={createLinkToken} className="px-3 py-2 rounded-lg bg-slate-700">
          {error ? "Retry" : "Preparing…"}
        </button>
      ) : (
        <PlaidLinkButton token={linkToken} jwt={jwt} onLinked={onLinked} />
      )}

      <p className="text-xs opacity-70 mt-2">
        Connect to fetch net worth, cards, investments, and recent transactions.
      </p>
    </div>
  );
}
