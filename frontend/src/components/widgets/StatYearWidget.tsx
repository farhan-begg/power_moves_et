import React from "react";
import StatCard from "./StatCard";
import { rangeYearISO } from "./_utils";
export default function StatYearWidget() {
  return <StatCard title="Year to Date" range={rangeYearISO()} />;
}