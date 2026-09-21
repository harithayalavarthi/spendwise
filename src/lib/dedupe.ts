import { createHash } from "node:crypto";

// Identifies a transaction by its economically meaningful fields so the same
// statement can be re-uploaded (or two statements can overlap by a few days)
// without duplicating rows. Two genuinely distinct transactions that happen to
// share date, description, and amount will collide and one will be dropped —
// an acceptable trade-off for a personal finance tool.
export function transactionHash(date: string, description: string, amount: number): string {
  const normalized = `${date}|${description.trim().toLowerCase()}|${amount.toFixed(2)}`;
  return createHash("sha256").update(normalized).digest("hex");
}
