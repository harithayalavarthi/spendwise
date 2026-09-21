import { CATEGORIES } from "@/lib/categories";

const SERIES_SLOTS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

// Fixed mapping so a given category always gets the same color regardless of
// sort order or which categories are present in a given view.
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c, i) => [c, SERIES_SLOTS[i % SERIES_SLOTS.length]])
);
