import { getDb } from "./db";
import { getMerchantKey } from "./merchantCache";

export type Cadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type RecurringStatus = "on-track" | "due-soon" | "missed";

export interface RecurringPayment {
  merchantKey: string;
  description: string;
  category: string;
  institution: string | null;
  cadence: Cadence;
  averageAmount: number;
  occurrences: number;
  lastDate: string;
  expectedNextDate: string;
  daysOverdue: number; // negative = not due yet
  status: RecurringStatus;
}

interface CadenceBucket {
  cadence: Cadence;
  min: number;
  max: number;
  tolerance: number; // max allowed deviation of any single gap from the average
}

// A candidate's average gap must fall in [min, max] to be classified into
// this cadence, and no single gap may deviate from the average by more than
// `tolerance` days (keeps out merchants visited at wildly irregular spacing
// that just happen to average out to a plausible cadence).
const CADENCE_BUCKETS: CadenceBucket[] = [
  { cadence: "weekly", min: 6, max: 8, tolerance: 2 },
  { cadence: "biweekly", min: 13, max: 16, tolerance: 3 },
  { cadence: "monthly", min: 27, max: 33, tolerance: 5 },
  { cadence: "quarterly", min: 85, max: 97, tolerance: 10 },
  { cadence: "yearly", min: 355, max: 375, tolerance: 15 },
];

const MIN_OCCURRENCES = 3; // need at least 2 gaps to trust a cadence
const AMOUNT_TOLERANCE_RATIO = 0.2; // 20%
const AMOUNT_TOLERANCE_FLOOR = 3; // dollars, for small recurring charges

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function parseIsoDate(d: string): Date | null {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function classifyCadence(gaps: number[]): CadenceBucket | null {
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  for (const bucket of CADENCE_BUCKETS) {
    if (avgGap < bucket.min || avgGap > bucket.max) continue;
    const maxDeviation = Math.max(...gaps.map((g) => Math.abs(g - avgGap)));
    if (maxDeviation <= bucket.tolerance) return bucket;
  }
  return null;
}

export function detectRecurringPayments(): RecurringPayment[] {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT date, description, amount, category, institution
       FROM transactions
       WHERE amount < 0 AND category != 'Transfers'
       ORDER BY date ASC`
    )
    .all() as Array<{
    date: string;
    description: string;
    amount: number;
    category: string;
    institution: string | null;
  }>;

  if (rows.length === 0) return [];

  const asOf = rows.reduce(
    (max, r) => (r.date > max ? r.date : max),
    rows[0].date
  );
  const asOfDate = parseIsoDate(asOf);
  if (!asOfDate) return [];

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = getMerchantKey(row.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const results: RecurringPayment[] = [];

  for (const [merchantKey, txns] of groups) {
    if (txns.length < MIN_OCCURRENCES) continue;

    const dates = txns.map((t) => parseIsoDate(t.date)).filter((d): d is Date => d !== null);
    if (dates.length !== txns.length) continue; // skip if any date failed to parse

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push(daysBetween(dates[i - 1], dates[i]));
    }

    const bucket = classifyCadence(gaps);
    if (!bucket) continue;

    const amounts = txns.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const amountTolerance = Math.max(avgAmount * AMOUNT_TOLERANCE_RATIO, AMOUNT_TOLERANCE_FLOOR);
    const amountConsistent = amounts.every((a) => Math.abs(a - avgAmount) <= amountTolerance);
    if (!amountConsistent) continue;

    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const last = txns[txns.length - 1];
    const lastDate = dates[dates.length - 1];
    const expectedNext = new Date(lastDate.getTime() + Math.round(avgGap) * 24 * 60 * 60 * 1000);
    const daysOverdue = daysBetween(expectedNext, asOfDate);
    const grace = Math.max(3, Math.round(avgGap * 0.25));

    const status: RecurringStatus =
      daysOverdue > grace ? "missed" : daysOverdue > -grace ? "due-soon" : "on-track";

    results.push({
      merchantKey,
      description: last.description,
      category: last.category,
      institution: last.institution,
      cadence: bucket.cadence,
      averageAmount: avgAmount,
      occurrences: txns.length,
      lastDate: last.date,
      expectedNextDate: expectedNext.toISOString().slice(0, 10),
      daysOverdue,
      status,
    });
  }

  const statusRank: Record<RecurringStatus, number> = { missed: 0, "due-soon": 1, "on-track": 2 };
  results.sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.averageAmount - a.averageAmount);

  return results;
}
