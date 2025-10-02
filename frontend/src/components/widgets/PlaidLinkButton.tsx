// src/components/PlaidLinkButton.tsx
import React, { useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { syncPlaidTransactions } from "../../api/plaid";

type LinkTokenRes = { link_token: string };
type UserInfo = {
  id: string;
  name: string;
  email: string;
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
};

const API_URL = process.env.REACT_APP_API_URL;

export default function PlaidLinkButton({ autoOpen = false }: { autoOpen?: boolean }) {
  const token = useSelector((s: RootState) => s.auth.token);
  const qc = useQueryClient();

  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // ✅ Fetch current user info
  const { data: userInfo } = useQuery<UserInfo>({
    queryKey: ["userInfo"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data } = await axios.get<UserInfo>(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
  });

  const isLinked = Boolean(userInfo?.plaidAccessToken);

  // ✅ Create link token (when not linked yet)
  const createLinkToken = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<LinkTokenRes>(
        `${API_URL}/plaid/link-token`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return data.link_token;
    },
    onSuccess: (lt) => setLinkToken(lt),
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.error || "Failed to create link token"),
  });

  // ✅ Exchange public token for access token
  const exchangePublicToken = useMutation({
    mutationFn: async (public_token: string) => {
      await axios.post(
        `${API_URL}/plaid/exchange-public-token`,
        { public_token },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    },
    onSuccess: async () => {
      try {
        if (token) await syncPlaidTransactions(token);
      } catch (e) {
        console.error("❌ Initial sync failed:", e);
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["userInfo"] }),
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] }),
      ]);
      window.dispatchEvent(new Event("plaid:linked"));
    },
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.error || "Failed to link account"),
  });

  // Auto-create link token on mount
  useEffect(() => {
    if (token && !isLinked && !createLinkToken.isPending) {
      createLinkToken.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isLinked]);

  // ✅ Hook into Plaid Link
  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (public_token) => exchangePublicToken.mutate(public_token),
  });

  // 🚨 Auto-open Plaid modal if requested
  useEffect(() => {
    if (autoOpen && ready && linkToken && !isLinked) {
      open();
    }
  }, [autoOpen, ready, linkToken, isLinked, open]);

  // 🚫 Don’t render if no auth
  if (!token) return null;

  // ✅ Already linked → show status badge
  if (isLinked) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="px-3 py-1 rounded-full text-sm font-medium text-emerald-300 bg-emerald-400/10 ring-1 ring-emerald-400/20">
          ✓ Bank connected
        </span>
      </div>
    );
  }

  const disabled =
    !ready ||
    createLinkToken.isPending ||
    exchangePublicToken.isPending ||
    !linkToken;

  // ✅ Connect button
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        className={`px-5 py-2.5 rounded-xl font-medium text-white transition
                    backdrop-blur-md border border-white/10
                    bg-white/10 hover:bg-white/15
                    ${
                      disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "shadow-[0_0_12px_rgba(34,211,238,0.1)]"
                    }`}
      >
        {createLinkToken.isPending
          ? "Preparing…"
          : exchangePublicToken.isPending
          ? "Linking…"
          : "Connect with Plaid"}
      </button>
      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
    </div>
  );
}
