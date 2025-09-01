// src/components/PlaidLinkButton.tsx
import React from "react";
import { usePlaidLink } from "react-plaid-link";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState } from "../app/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type LinkTokenRes = { link_token: string };
type UserInfo = {
  id: string;
  name: string;
  email: string;
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
};

export default function PlaidLinkButton() {
  const token = useSelector((s: RootState) => s.auth.token);
  const qc = useQueryClient();

  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Check if user already linked
  const { data: userInfo } = useQuery<UserInfo>({
    queryKey: ["userInfo"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data } = await axios.get<UserInfo>("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data;
    },
  });

  const isLinked = Boolean(userInfo?.plaidAccessToken);

  // 1) Create link token (use correct route)
  const createLinkToken = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<LinkTokenRes>(
        "/api/plaid/link-token", // ✅ match backend
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return data.link_token;
    },
    onSuccess: (lt) => setLinkToken(lt),
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.error || "Failed to create link token"),
  });

  // 2) Exchange public token (use correct route)
  const exchangePublicToken = useMutation({
    mutationFn: async (public_token: string) => {
      await axios.post(
        "/api/plaid/exchange-public-token", // ✅ match backend
        { public_token },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["userInfo"] }),
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
      ]);
    },
    onError: (err: any) =>
      setErrorMsg(err?.response?.data?.error || "Failed to link account"),
  });

  React.useEffect(() => {
    if (token && !isLinked) {
      createLinkToken.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isLinked]);

  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (public_token) => exchangePublicToken.mutate(public_token),
  });

  if (!token) return null;

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

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        className="px-4 py-2 rounded-lg font-medium text-white
                   bg-indigo-600/90 hover:bg-indigo-500
                   disabled:opacity-50
                   backdrop-blur-md border border-white/10 shadow-lg"
      >
        {createLinkToken.isPending
          ? "Preparing…"
          : exchangePublicToken.isPending
          ? "Linking…"
          : "Connect bank with Plaid"}
      </button>
      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
    </div>
  );
}
