// src/components/widgets/StatMonthWidget.tsx
import React from "react";

import { rangeMonthISO } from "./_utils";
import StatCard from "./StatCard";
export default function StatMonthWidget() {
  return <StatCard title="This Month" range={rangeMonthISO()} />;
}
