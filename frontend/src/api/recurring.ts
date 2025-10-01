// src/recurring.ts
import { http, auth } from "./http";

export type OverviewResponse = {
  bills: Array<{
    _id: string;
    name: string;
    merchant?: string;
    amount?: number | null;
    dueDate?: string;
    status: "predicted" | "due" | "paid" | "skipped";
    seriesId?: string | null;
    currency?: string | null;
  }>;
  recentPaychecks: Array<{
    _id: string;
    amount: number;
    date: string;
    employerName?: string | null;
    accountId?: string | null;
    seriesId?: string | null;
  }>;
};

function normalizeOverview(raw: any): OverviewResponse {
  const bills = Array.isArray(raw?.bills ?? raw?.items) ? (raw.bills ?? raw.items) : [];
  const pay = Array.isArray(raw?.recentPaychecks ?? raw?.paychecks)
    ? (raw.recentPaychecks ?? raw.paychecks)
    : [];
  return { bills, recentPaychecks: pay };
}

async function getWithFallback<T>(
  token: string,
  primaryPath: string,
  fallbackPath: string,
  params?: Record<string, any>
): Promise<T> {
  try {
    const { data } = await http.get(primaryPath, { ...auth(token), params });
    return data as T;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.get(fallbackPath, { ...auth(token), params });
      return data as T;
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Request failed";
    throw new Error(msg);
  }
}

export async function fetchRecurringOverview(token: string, horizonDays = 40): Promise<OverviewResponse> {
  const data = await getWithFallback<any>(token, "/recurring/overview", "/recurring/overview", { horizonDays });
  return normalizeOverview(data);
}

export async function runRecurringDetection(token: string, lookbackDays = 180) {
  try {
    const { data } = await http.post("/recurring/detect", { lookbackDays }, auth(token));
    return data as { created?: number; matched?: number; applied?: boolean };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.post("/recurring/detect", { lookbackDays }, auth(token));
      return data as { created?: number; matched?: number; applied?: boolean };
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Failed to run detection";
    throw new Error(msg);
  }
}

/* ---------- Matches ---------- */
export type MatchBillPayload =
  | { txId: string; amount?: number; date?: string; seriesId?: string; name?: string; merchant?: string; accountId?: string }
  | { seriesId: string; paidDate?: string; amount?: number; markPaid?: boolean; accountId?: string };

export async function matchBillPayment(token: string, payload: MatchBillPayload) {
  try {
    const { data } = await http.post("/recurring/bills/match", payload, auth(token));
    return data as { ok: true };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const { data } = await http.post("/recurring/bills/match", payload, auth(token));
      return data as { ok: true };
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Failed to mark bill paid";
    throw new Error(msg);
  }
}

export async function matchPaycheck(token: string, payload: { txId: string; amount: number; date?: string; seriesId?: string; accountId?: string; employerName?: string; }) {
  const { data } = await http.post("/recurring/paychecks/match", payload, auth(token));
  return data as { ok: true };
}
