// src/hooks/recurringHooks.ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import type { RootState } from "../app/store";
import * as api from "../api/recurring";

export type Bill = Overview["bills"][number];
export type Paycheck = Overview["recentPaychecks"][number];
export type Overview = api.OverviewResponse;

export function useRecurringOverview(horizonDays = 40) {
  const token = useSelector((s: RootState) => s.auth.token)!;
  return useQuery({
    queryKey: ["recurring", "overview", { horizonDays }],
    queryFn: () => api.fetchRecurringOverview(token, horizonDays),
    staleTime: 30_000,
  });
}

export function useRunDetection() {
  const qc = useQueryClient();
  const token = useSelector((s: RootState) => s.auth.token)!;

  return useMutation({
    mutationFn: (lookbackDays?: number) => api.runRecurringDetection(token, lookbackDays ?? 180),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring", "overview"] });
      qc.invalidateQueries({ queryKey: ["transactions", "list"] });
    },
  });
}

export function useMatchBillPaid() {
  const qc = useQueryClient();
  const token = useSelector((s: RootState) => s.auth.token)!;

  return useMutation({
    mutationFn: (payload: api.MatchBillPayload) => api.matchBillPayment(token, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring", "overview"] });
      qc.invalidateQueries({ queryKey: ["transactions", "list"] });
    },
  });
}

export function useMatchPaycheck() {
  const qc = useQueryClient();
  const token = useSelector((s: RootState) => s.auth.token)!;

  return useMutation({
    mutationFn: (payload: { txId: string; amount: number; date?: string; seriesId?: string; accountId?: string; employerName?: string }) =>
      api.matchPaycheck(token, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurring", "overview"] });
      qc.invalidateQueries({ queryKey: ["transactions", "list"] });
    },
  });
}
