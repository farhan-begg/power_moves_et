import React from "react";
import StatCard from "./StatCard";
import { toLocalYMDRange } from "../../helpers/date";
export default function StatYearWidget() {
  // ✅ YTD should be Jan 1 to today, not Jan 1 to Dec 31
  const ytdRange = toLocalYMDRange("ytd");
  return <StatCard title="Year to Date" range={ytdRange} mode="cashflow" />;
}