import { useEffect, useMemo, useState, useCallback } from "react";
import { usePlaidLink, type PlaidLinkOptions } from "react-plaid-link";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

export default function LinkInvestmentsButton() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const jwt = localStorage.getItem("token");

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/plaid/link-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({}),
      });
      const { link_token } = await res.json();
      setLinkToken(link_token);
    })();
  }, [jwt]);

  const onSuccess = useCallback<PlaidLinkOptions["onSuccess"]>(
    async (public_token) => {
      await fetch(`${API_BASE}/plaid/exchange-public-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ public_token }),
      });
    },
    [jwt]
  );

  // Always a valid PlaidLinkOptions object (types are happy)
  const config = useMemo<PlaidLinkOptions>(
    () => ({
      token: linkToken ?? "", // placeholder until token arrives
      onSuccess,
    }),
    [linkToken, onSuccess]
  );

  const { open, ready } = usePlaidLink(config);

  return (
    <button onClick={() => open()} disabled={!ready || !linkToken}>
      Link (Investments)
    </button>
  );
}
