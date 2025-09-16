// frontend/src/hooks/cryptoHooks.ts
// ⬆️ FILE: frontend/src/hooks/cryptoHooks.ts
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";
import * as api from "../api/crypto";
import type {
  CryptoPortfolioResponse,
  CryptoHolding,
  CryptoLot,
  AddLotPayload,
  UpdateLotPayload,
  DeleteLotPayload,
} from "../api/crypto";

/* -------------------------------- Types -------------------------------- */
export type StreamPriceRow = {
  id: string;
  quantity?: number;
  price?: number;
  value?: number;
};

export type PricesEventPayload = {
  totalUSD: number;
  rows: StreamPriceRow[];
};

/* ----------------------------- Queries ----------------------------- */
export function useCryptoPortfolio(accountId?: string) {
  const token = useSelector((s: RootState) => s.auth.token)!;
  return useQuery({
    queryKey: ["crypto", "portfolio", { accountId: accountId ?? null }],
    queryFn: () => api.fetchCryptoPortfolio(token, accountId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useCryptoHoldingsList(accountId?: string) {
  const token = useSelector((s: RootState) => s.auth.token)!;
  return useQuery({
    queryKey: ["crypto", "holdings", { accountId: accountId ?? null }],
    queryFn: () => api.listHoldings(token, accountId),
    staleTime: 30_000,
  });
}

/**
 * Live portfolio object that stays updated via stream.
 * Returns the same shape as useCryptoPortfolio(), but ensures prices keep flowing in.
 */
export function useCryptoLivePortfolio(accountId?: string) {
  const base = useCryptoPortfolio(accountId);
  useCryptoPricesStream(accountId); // attach the stream to keep the cache fresh
  return base;
}

/* ---------------------------- Mutations ---------------------------- */
export function useUpsertHolding() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: api.CreateOrUpdateHoldingPayload) => api.upsertHolding(token, payload),
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: ["crypto", "holdings"] });
      qc.invalidateQueries({ queryKey: ["crypto", "portfolio"] });
      qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
      if (payload.accountId) {
        qc.invalidateQueries({ queryKey: ["crypto", "holdings", { accountId: payload.accountId }] });
        qc.invalidateQueries({ queryKey: ["crypto", "portfolio", { accountId: payload.accountId }] });
      }
    },
  });
}

export function useAddLot() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.AddLotPayload) => api.addLot(token, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crypto", "holdings"] });
      qc.invalidateQueries({ queryKey: ["crypto", "portfolio"] });
      qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
    },
  });
}

export function useUpdateLot() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.UpdateLotPayload) => api.updateLot(token, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crypto", "holdings"] });
      qc.invalidateQueries({ queryKey: ["crypto", "portfolio"] });
      qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
    },
  });
}

export function useDeleteLot() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: api.DeleteLotPayload) => api.deleteLot(token, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crypto", "holdings"] });
      qc.invalidateQueries({ queryKey: ["crypto", "portfolio"] });
      qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
    },
  });
}

/**
 * Convenience wrapper for lot CRUD to keep widget code tidy.
 */
export function useLotsCrud() {
  const addLot = useAddLot();
  const updateLot = useUpdateLot();
  const deleteLot = useDeleteLot();

  const add = useCallback(
    (p: Omit<AddLotPayload, "id"> & { id: string }) => addLot.mutateAsync(p),
    [addLot]
  );
  const update = useCallback((p: UpdateLotPayload) => updateLot.mutateAsync(p), [updateLot]);
  const remove = useCallback((p: DeleteLotPayload) => deleteLot.mutateAsync(p), [deleteLot]);

  return {
    add,
    update,
    remove,
    isLoading: addLot.isPending || updateLot.isPending || deleteLot.isPending,
  };
}

/* -------------------------- Live price stream -------------------------- */
/**
 * Subscribes to /api/crypto/stream (SSE over fetch) and merges incoming prices into:
 *   ["crypto","portfolio",{accountId}] cache + invalidates net-worth.
 * We parse SSE frames manually so we can send Authorization headers.
 */
export function useCryptoPricesStream(accountId?: string) {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();

  const key = useMemo(
    () => ["crypto", "portfolio", { accountId: accountId ?? null }] as const,
    [accountId]
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let retry = 0;
    let abort: AbortController | null = null;

    const connect = async () => {
      abort?.abort();
      const ac = new AbortController();
      abort = ac;

      try {
        const url = new URL("/api/crypto/stream", window.location.origin);
        if (accountId) url.searchParams.set("accountId", accountId);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

        retry = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        // SSE parsing state
        let buf = "";
        let eventName: string | null = null;
        let dataLines: string[] = [];

        // Typed flushEvent so TS knows the row shape
        const flushEvent = () => {
          if (!eventName || dataLines.length === 0) return;
          const payloadText = dataLines.join("\n");
          try {
            if (eventName === "prices") {
              const payload: PricesEventPayload = JSON.parse(payloadText);

              // payload: { totalUSD, rows: [{ id, quantity?, price?, value? }] }
              qc.setQueryData<CryptoPortfolioResponse>(key, (prev) => {
                if (!prev) return prev;

                const priceById = new Map<string, StreamPriceRow>(
                  payload.rows.map((r) => [String(r.id), r])
                );

                const holdings: CryptoHolding[] = prev.holdings.map((h) => {
                  const row = priceById.get(String(h._id));
                  if (!row) return h;

                  const nextPrice = row.price ?? h.price ?? 0;
                  const nextQty = row.quantity ?? h.quantity ?? 0;
                  const nextValue = row.value != null ? row.value : nextQty * nextPrice;

                  return { ...h, price: nextPrice, value: nextValue };
                });

                return { ...prev, summary: { totalUSD: payload.totalUSD }, holdings };
              });

              // Keep net-worth visuals fresh
              qc.invalidateQueries({ queryKey: ["plaid", "net-worth"] });
            }
          } catch {
            // ignore bad event JSON
          }
          eventName = null;
          dataLines = [];
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // Split into SSE records terminated by blank line
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const record = buf.slice(0, idx);
            buf = buf.slice(idx + 2);

            const lines = record.split("\n");
            for (const raw of lines) {
              const line = raw.replace(/\r$/, "");
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim() || null;
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }
            flushEvent();
          }
        }
      } catch {
        if (cancelled) return;
        const wait = 1000 * 2 ** Math.min(retry++, 6);
        setTimeout(connect, wait);
      }
    };

    connect();
    return () => {
      cancelled = true;
      abort?.abort();
    };
  }, [token, accountId, qc, key]);
}

/* -------------------------- Sparkline series -------------------------- */
/**
 * Streams totalUSD from SSE "/api/crypto/stream" and keeps a small time-series for sparkline.
 */
export function useCryptoLiveSeries(accountId?: string, maxPoints = 60) {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const [series, setSeries] = useState<Array<{ t: number; v: number }>>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let retry = 0;
    let abort: AbortController | null = null;

    const connect = async () => {
      abort?.abort();
      const ac = new AbortController();
      abort = ac;

      try {
        const url = new URL("/api/crypto/stream", window.location.origin);
        if (accountId) url.searchParams.set("accountId", accountId);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

        retry = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buf = "";
        let eventName: string | null = null;
        let dataLines: string[] = [];

        const flushEvent = () => {
          if (!eventName || dataLines.length === 0) return;
          if (eventName === "prices") {
            try {
              const payload = JSON.parse(dataLines.join("\n")) as { totalUSD: number };
              if (!cancelled && typeof payload.totalUSD === "number") {
                setSeries((prev) => {
                  const next = [...prev, { t: Date.now(), v: payload.totalUSD }];
                  return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
                });
              }
            } catch {
              /* ignore */
            }
          }
          eventName = null;
          dataLines = [];
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const record = buf.slice(0, idx);
            buf = buf.slice(idx + 2);

            const lines = record.split("\n");
            for (const raw of lines) {
              const line = raw.replace(/\r$/, "");
              if (line.startsWith("event:")) eventName = line.slice(6).trim() || null;
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
            }
            flushEvent();
          }
        }
      } catch {
        if (cancelled) return;
        const wait = 1000 * 2 ** Math.min(retry++, 6);
        setTimeout(connect, wait);
      }
    };

    connect();
    return () => {
      cancelled = true;
      abort?.abort();
    };
  }, [token, accountId, maxPoints]);

  return series;
}

/* --------------------- Per-tick live payload (for charts) --------------------- */
/**
 * Returns the most recent SSE "prices" payload with a timestamp,
 * so components can build their own live series (aggregate or per-holding).
 */
export function useCryptoLiveTick(accountId?: string) {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const [tick, setTick] = useState<{ ts: number; totalUSD: number; rows: Map<string, StreamPriceRow> } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let retry = 0;
    let abort: AbortController | null = null;

    const connect = async () => {
      abort?.abort();
      const ac = new AbortController();
      abort = ac;

      try {
        const url = new URL("/api/crypto/stream", window.location.origin);
        if (accountId) url.searchParams.set("accountId", accountId);
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

        retry = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let buf = "";
        let eventName: string | null = null;
        let dataLines: string[] = [];

        const flushEvent = () => {
          if (!eventName || dataLines.length === 0) return;
          if (eventName === "prices") {
            try {
              const p = JSON.parse(dataLines.join("\n")) as PricesEventPayload;
              const rows = new Map(p.rows.map((r) => [String(r.id), r]));
              if (!cancelled) setTick({ ts: Date.now(), totalUSD: p.totalUSD, rows });
            } catch {
              /* ignore */
            }
          }
          eventName = null;
          dataLines = [];
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const record = buf.slice(0, idx);
            buf = buf.slice(idx + 2);

            const lines = record.split("\n");
            for (const raw of lines) {
              const line = raw.replace(/\r$/, "");
              if (line.startsWith("event:")) eventName = line.slice(6).trim() || null;
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
            }
            flushEvent();
          }
        }
      } catch {
        const wait = 1000 * 2 ** Math.min(retry++, 6);
        setTimeout(connect, wait);
      }
    };

    connect();
    return () => {
      cancelled = true;
      abort?.abort();
    };
  }, [token, accountId]);

  return tick; // { ts, totalUSD, rows: Map(holdingId -> { price, quantity, value? }) }
}

/* ---------------- Historical series ---------------- */
export function useCryptoPnlSeries(holdingId?: string, days: number | "max" = 365) {
  // token not needed here if authHeader() is used inside the API function
  return useQuery({
    queryKey: ["crypto", "pnl-series", { holdingId: holdingId ?? null, days }],
    enabled: !!holdingId,
    queryFn: () => api.fetchPnlSeries(holdingId!, days),
    staleTime: 30_000,
  });
}

// Simple market price series (fallback when no lots/P&L exist)
export function useCryptoPriceSeries(cgId?: string, days: number | "max" = 365) {
  return useQuery({
    queryKey: ["crypto", "price-series", { cgId: cgId ?? null, days }],
    enabled: !!cgId,
    queryFn: () => api.fetchPriceSeries(cgId!, days),
    staleTime: 30_000,
  });
}

/* ---------------- Formatting helpers ---------------- */
export function useCommaNumber(initial = "") {
  const [raw, setRaw] = useState<string>(initial);
  const value = useMemo(() => {
    const n = Number(raw.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }, [raw]);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/[^\d.]/g, "");
    const [i, d] = next.split(".");
    const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d != null ? "." + d : "");
    setRaw(withCommas);
  };
  return { raw, setRaw, value, onChange };
}

/* -------------------------- Optional NDJSON stream -------------------------- */
/**
 * If you later use /api/crypto/stream-ndjson, this hook returns raw stream events (tick/hb).
 * Not used by the portfolio cache (which uses the SSE route above).
 */
export type TickEvent = { type: "tick"; ts: number; price: number };
type HB = { type: "hb"; ts: number };
type StreamEvent = TickEvent | HB;

export function useCryptoFetchStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      setError(null);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const token = localStorage.getItem("token") || "";
        const res = await fetch("/api/crypto/stream-ndjson", {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error(`Stream HTTP ${res.status}`);

        retryRef.current = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let idx;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const evt = JSON.parse(line) as StreamEvent;
              if (!cancelled) {
                setEvents((prev) => {
                  const next = [...prev, evt];
                  return next.length > 1000 ? next.slice(-1000) : next;
                });
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Stream error");
        const wait = 1000 * 2 ** Math.min(retryRef.current++, 6);
        setTimeout(connect, wait);
      }
    };

    connect();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  return { events, error };
}
