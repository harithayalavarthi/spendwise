"use client";

import type { CategoryTotal } from "@/lib/insights";
import { CATEGORY_COLORS } from "./chartColors";
import LabeledBarChart from "./LabeledBarChart";

export default function CategoryBarChart({ data }: { data: CategoryTotal[] }) {
  return (
    <LabeledBarChart
      data={data.map((d) => ({ name: d.category, total: d.total }))}
      colors={CATEGORY_COLORS}
      emptyMessage="No categorized spending yet — upload a statement to see this chart."
    />
  );
}
