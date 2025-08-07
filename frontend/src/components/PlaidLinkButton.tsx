import { usePlaidLink } from "react-plaid-link";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../app/store";

export default function PlaidLinkButton() {
  const token = useSelector((state: RootState) => state.auth.token);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const res = await axios.post(
          "http://localhost:5000/api/plaid/create_link_token",
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setLinkToken(res.data.link_token);
      } catch (err) {
        console.error("Error fetching Plaid link token:", err);
      }
    };

    if (token) fetchLinkToken();
  }, [token]);

  const { open, ready } = usePlaidLink({
    token: linkToken || "", // safe fallback
    onSuccess: async (public_token) => {
      try {
        await axios.post(
          "http://localhost:5000/api/plaid/exchange_public_token",
          { public_token },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        alert("✅ Bank account linked!");
        window.location.reload(); // reload to refresh dashboard
      } catch (err) {
        console.error("Failed to exchange token:", err);
      }
    },
  });

  if (!linkToken) return <p>Loading bank link...</p>;

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      style={{ padding: "12px 24px", fontSize: "16px" }}
    >
      Connect Bank Account
    </button>
  );
}
