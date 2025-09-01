import React from "react";
import StatCard from "./StatCard";
import { rangeYearISO } from "./_utils";
export default function StatYearWidget() {
  return<StatCard title="Net Worth" range={rangeYearISO()} mode="networth" />
}