// src/components/widgets/plaid/PlaidLinkButton.tsx
import React from "react";
import { usePlaidLink } from "react-plaid-link";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchUserInfo, type UserInfo } from "../../api/auth";
import {
  createLinkToken as apiCreateLinkToken,
  exchangePublicToken as apiExchangePublicToken,
  fetchPlaidItems,
  syncPlaidTransactions,
  type PlaidItem,
} from "../../api/plaid";

export default function PlaidLinkButton({ autoOpen = false }: { autoOpen?: boolean }) {
  // ✅ token can come from redux OR localStorage (signup flow often needs this)
  const reduxToken = useSelector((s: RootState) => s.auth.token);
  const token = reduxToken || localStorage.getItem("token") || null;

  const qc = useQueryClient();

  const [linkToken, setLinkToken] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // ---------------- Queries ----------------
  const { data: userInfo, isLoading: userLoading } = useQuery<UserInfo>({
    queryKey: ["userInfo"],
    enabled: !!token,
    queryFn: () => fetchUserInfo(token!),
  });

  const { data: items = [] } = useQuery<PlaidItem[]>({
    queryKey: ["plaid", "items"],
    enabled: !!token,
    queryFn: () => fetchPlaidItems(token!),
    staleTime: 60_000,
  });

  // Use actual items count instead of userInfo.banksConnected
  const banksConnected = items.length;
  
  // Get all bank institution names
  const bankNames = React.useMemo(() => {
    return items
      .map((i) => i.institutionName || i.institutionId || "Unknown Bank")
      .filter((name, index, self) => self.indexOf(name) === index); // Remove duplicates
  }, [items]);

  // ---------------- Mutations ----------------
  const createLink = useMutation({
    mutationFn: async (mode: "new" | "update", itemId?: string) => {
      if (!token) throw new Error("Missing auth token");
      const res = await apiCreateLinkToken(token, { mode, itemId });
      return res.link_token;
    },
    onSuccess: (lt) => {
      setLinkToken(lt);
      setErrorMsg(null);
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error || err?.message || "Failed to create link token");
    },
  });

  const exchangeToken = useMutation({
    mutationFn: async (args: {
      publicToken: string;
      institution?: { id?: string; name?: string };
      makePrimary?: boolean;
    }) => {
      if (!token) throw new Error("Missing auth token");
      await apiExchangePublicToken(token, args);
    },
    onSuccess: async () => {
      try {
        if (token) await syncPlaidTransactions(token);
      } catch (e) {
        console.error("❌ Initial sync failed:", e);
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["userInfo"] }),
        qc.invalidateQueries({ queryKey: ["plaid", "items"] }),
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["transactions"] }),
        qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] }),
      ]);

      window.dispatchEvent(new Event("plaid:linked"));
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.error || err?.message || "Failed to link account");
    },
  });

  // ---------------- Plaid hook ----------------
  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (publicToken, metadata) => {
      exchangeToken.mutate({
        publicToken,
        institution: metadata?.institution
          ? { id: metadata.institution.institution_id, name: metadata.institution.name }
          : undefined,
        makePrimary: banksConnected === 0 ? true : undefined,
      });
    },
  });

  // ---------------- Effects (always declared) ----------------

  // Auto-open for first connect
  React.useEffect(() => {
    if (!autoOpen) return;
    if (!token) return;
    if (banksConnected > 0) return;

    // ensure link token exists
    if (!linkToken && !createLink.isPending) {
      createLink.mutate(["new", undefined] as any);
      return;
    }

    if (linkToken && ready) open();
  }, [autoOpen, token, banksConnected, linkToken, ready, open, createLink]);

  // When linkToken flips and Plaid is ready, open
  React.useEffect(() => {
    if (!linkToken) return;
    if (!ready) return;
    open();
  }, [linkToken, ready, open]);

  // ---------------- Render ----------------
  if (!token) return null;

  const busy = createLink.isPending || exchangeToken.isPending;

  const connectFirstBank = async () => {
    setErrorMsg(null);
    await createLink.mutateAsync(["new", undefined] as any);
  };

  const addAnotherBank = async () => {
    setErrorMsg(null);
    await createLink.mutateAsync(["new", undefined] as any);
  };

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div className="text-sm text-[var(--text-secondary)]">
        {userLoading ? (
          "Checking connection…"
        ) : banksConnected === 0 ? (
          "No banks connected"
        ) : (
          <>
            <span className="font-medium text-[var(--text-primary)]">
              {banksConnected} bank{banksConnected === 1 ? "" : "s"} connected
            </span>
            {bankNames.length > 0 && (
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {bankNames.length === 1 ? (
                  bankNames[0]
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {bankNames.map((name, idx) => (
                      <span key={idx} className="inline-block">
                        {name}
                        {idx < bankNames.length - 1 && <span className="mx-1">•</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {banksConnected === 0 ? (
        <button
          type="button"
          onClick={connectFirstBank}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl font-medium text-[var(--text-primary)] transition
                     backdrop-blur-md border border-[var(--widget-border)]
                     bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-50
                     ring-1 ring-[var(--widget-ring)]"
        >
          {busy ? "Preparing…" : "Connect your first bank"}
        </button>
      ) : (
        <button
          type="button"
          onClick={addAnotherBank}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl font-medium text-[var(--text-primary)] transition
                     backdrop-blur-md border border-[var(--widget-border)]
                     bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-50
                     ring-1 ring-[var(--widget-ring)]"
        >
          {busy ? "Preparing…" : "Add another bank"}
        </button>
      )}

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      {/* Optional: show why the button might feel "dead" */}
      {banksConnected === 0 && !busy && linkToken && !ready && (
        <p className="text-xs text-[var(--text-muted)]">Loading Plaid…</p>
      )}
    </div>
  );
}
