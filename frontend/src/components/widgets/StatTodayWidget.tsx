import React from "react";

import { rangeTodayISO } from "./_utils";
import StatCard from "./StatCard";
export default function StatTodayWidget() {
  return <StatCard title="Today" range={rangeTodayISO()} />;
}
