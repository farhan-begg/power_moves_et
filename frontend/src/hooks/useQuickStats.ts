import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { RootState } from "../app/store";
import { fetchSummary, SummaryPoint } from "../api/transaction";

const fmtISO = (d: Date) => d.toISOString().slice(0, 10);
const sumRows = (rows: SummaryPoint[] = []) =>
  rows.reduce(
    (a, r) => ({
      income: a.income + r.income,
      expense: a.expense + r.expense,
      net: a.net + r.net,
    }),
    { income: 0, expense: 0, net: 0 }
  );

export function useQuickStats() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYear = new Date(now.getFullYear(), 0, 1);

  const qToday = useQuery({
    queryKey: ["summary", "today", fmtISO(now)],
    queryFn: () =>
      fetchSummary(token, {
        granularity: "day",
        startDate: fmtISO(now),
        endDate: fmtISO(now),
      }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const qMonth = useQuery({
    queryKey: ["summary", "month", fmtISO(startMonth), fmtISO(now)],
    queryFn: () =>
      fetchSummary(token, {
        granularity: "day",
        startDate: fmtISO(startMonth),
        endDate: fmtISO(now),
      }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const qYear = useQuery({
    queryKey: ["summary", "year", fmtISO(startYear), fmtISO(now)],
    queryFn: () =>
      fetchSummary(token, {
        granularity: "month",
        startDate: fmtISO(startYear),
        endDate: fmtISO(now),
      }),
    enabled: !!token,
    staleTime: 60_000,
  });

  const today = sumRows(qToday.data?.data);
  const month = sumRows(qMonth.data?.data);
  const year = sumRows(qYear.data?.data);

  return {
    loading: qToday.isLoading || qMonth.isLoading || qYear.isLoading,
    error: qToday.error || qMonth.error || qYear.error,
    today,
    month,
    year,
  };
}
