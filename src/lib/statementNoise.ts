// Statement boilerplate that a heuristic parser can mistake for a real
// transaction line (it has a date and a trailing dollar amount, same as a
// purchase) but isn't one — a balance snapshot or summary total, not money
// moving. Matched against the whole trimmed description, not a substring, so
// a real merchant name that happens to contain "total" or "balance" isn't
// affected.
const NOISE_PATTERNS: RegExp[] = [
  /^opening balance$/i,
  /^closing balance$/i,
  /^previous balance$/i,
  /^new balance$/i,
  /^total new balance$/i,
  /^beginning balance$/i,
  /^ending balance$/i,
  /^balance forward$/i,
  /^account balance$/i,
  /^statement balance$/i,
  /^current balance$/i,
  /^minimum payment$/i,
  /^available credit$/i,
  /^credit limit$/i,
  /^total$/i,
  /^subtotal$/i,
  /^sub-total$/i,
];

export function isStatementNoise(description: string): boolean {
  const trimmed = description.trim();
  return NOISE_PATTERNS.some((re) => re.test(trimmed));
}
