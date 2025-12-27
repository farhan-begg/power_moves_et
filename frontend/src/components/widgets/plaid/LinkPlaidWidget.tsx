// src/components/widgets/plaid/PlaidLinkButton.tsx
import React from "react";
import { usePlaidLink } from "react-plaid-link";
import { useSelector } from "react-redux";
import { RootState } from "../../../app/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  syncPlaidTransactions,
  createLinkToken,
  exchangePublicToken,
} from "../../../api/plaid";
import { http, auth } from "../../../api/http";

type UserInfo = {
  id: string;
  name: string;
  email: string;
  plaidAccessToken?: { content: string; iv: string; tag: string } | null;
};

export default function PlaidLinkButton({ autoOpen = false }: { autoOpen?: boolean }) {
  const token = useSelector((s: RootState) => s.auth.token);
  const qc = useQueryClient();

  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // ✅ Fetch user info
  const { data: userInfo } = useQuery<UserInfo>({
    queryKey: ["userInfo"],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data } = await http.get<UserInfo>("/auth/me", auth(token ?? undefined));
      return data;
    },
  });

  const isLinked = Boolean(userInfo?.plaidAccessToken);

  // ✅ Create link token
  const createLink = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Missing auth token");
      const data = await createLinkToken(token, { mode: "new" }); // or omit opts
      return data.link_token;
    },
    onSuccess: (lt) => {
      setLinkToken(lt);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error || "Failed to create link token");
    },
  });

  // ✅ Exchange public token (NEW SIGNATURE)
  const exchangeToken = useMutation({
    mutationFn: async (args: {
      publicToken: string;
      institution?: { id?: string; name?: string };
      makePrimary?: boolean;
    }) => {
      if (!token) throw new Error("Missing auth token");
      await exchangePublicToken(token, {
        publicToken: args.publicToken,
        institution: args.institution,
        makePrimary: args.makePrimary,
      });
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
        qc.invalidateQueries({ queryKey: ["plaid", "accounts"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] }),
        qc.invalidateQueries({ queryKey: ["plaid", "items"] }),
      ]);

      window.dispatchEvent(new Event("plaid:linked"));
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error || "Failed to link account");
    },
  });

  // Auto-create link token if not linked
  React.useEffect(() => {
    if (token && !isLinked && !createLink.isPending && !linkToken) {
      createLink.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isLinked, linkToken]);

  // ✅ Plaid hook (grab institution from metadata)
  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (publicToken: string, metadata: any) => {
      exchangeToken.mutate({
        publicToken,
        institution: metadata?.institution
          ? { id: metadata.institution.institution_id, name: metadata.institution.name }
          : undefined,
        makePrimary: true, // set true on first link if you want; optional
      });
    },
    onExit: (_err, _meta) => {
      // optional
    },
  });

  // 🚀 auto-open if requested
  React.useEffect(() => {
    if (autoOpen && ready && linkToken && !isLinked) open();
  }, [autoOpen, ready, linkToken, isLinked, open]);

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

  const disabled = !ready || createLink.isPending || exchangeToken.isPending || !linkToken;

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
        {createLink.isPending
          ? "Preparing…"
          : exchangeToken.isPending
          ? "Linking…"
          : "Connect bank with Plaid"}
      </button>

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
    </div>
  );
}
