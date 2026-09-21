// Best-effort detection of the issuing bank/card network from a statement's
// own text — a convenience default, not a source of truth. A user-supplied
// institution always wins over this; see the upload route.
const INSTITUTION_RULES: Array<{ name: string; keywords: string[] }> = [
  { name: "TD Bank", keywords: ["td canada trust", "td bank", "td business cash back", "td cash back", "toronto-dominion"] },
  { name: "Chase", keywords: ["chase", "jpmorgan chase"] },
  { name: "Bank of America", keywords: ["bank of america"] },
  { name: "Wells Fargo", keywords: ["wells fargo"] },
  { name: "Capital One", keywords: ["capital one"] },
  { name: "RBC", keywords: ["royal bank of canada", "rbc royal bank"] },
  { name: "Scotiabank", keywords: ["scotiabank", "scotia bank", "bank of nova scotia"] },
  { name: "BMO", keywords: ["bank of montreal", "bmo harris", "bmo bank"] },
  { name: "CIBC", keywords: ["cibc", "canadian imperial bank"] },
  { name: "American Express", keywords: ["american express"] },
  { name: "Discover", keywords: ["discover card", "discover bank", "discover it"] },
  { name: "Citi", keywords: ["citibank", "citi card", "citi credit card"] },
  { name: "US Bank", keywords: ["u.s. bank", "us bank"] },
  { name: "PNC Bank", keywords: ["pnc bank"] },
  { name: "HSBC", keywords: ["hsbc"] },
  { name: "Ally Bank", keywords: ["ally bank"] },
  { name: "Synchrony", keywords: ["synchrony bank", "synchrony financial"] },
  { name: "Walmart Credit Card", keywords: ["walmart credit card", "walmart rewards card"] },
];

export function detectInstitution(text: string): string | null {
  const lower = text.toLowerCase();
  for (const rule of INSTITUTION_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.name;
  }
  return null;
}
