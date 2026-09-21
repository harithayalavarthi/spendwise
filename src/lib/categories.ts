export const CATEGORIES = [
  "Groceries",
  "Dining & Coffee",
  "Transport",
  "Shopping",
  "Utilities & Bills",
  "Rent & Housing",
  "Health & Wellness",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Fees & Charges",
  "Income",
  "Transfers",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Ordered rule list: first matching keyword wins. Keep specific/branded
// keywords above generic ones so e.g. "amazon prime" beats plain "amazon".
const RULES: Array<{ category: Category; keywords: string[] }> = [
  {
    category: "Subscriptions",
    keywords: [
      "netflix",
      "spotify",
      "hulu",
      "disney+",
      "disney plus",
      "amazon prime",
      "apple.com/bill",
      "icloud",
      "youtube premium",
      "hbo max",
      "audible",
      "patreon",
    ],
  },
  {
    category: "Groceries",
    keywords: [
      "walmart",
      "target",
      "trader joe",
      "whole foods",
      "kroger",
      "safeway",
      "costco",
      "aldi",
      "publix",
      "grocery",
      "supermarket",
    ],
  },
  {
    category: "Dining & Coffee",
    keywords: [
      "starbucks",
      "coffee",
      "restaurant",
      "mcdonald",
      "chipotle",
      "doordash",
      "uber eats",
      "grubhub",
      "postmates",
      "cafe",
      "diner",
      "pizza",
      "bar & grill",
    ],
  },
  {
    category: "Transport",
    keywords: [
      "uber",
      "lyft",
      "shell",
      "chevron",
      "exxon",
      "gas station",
      "parking",
      "transit",
      "metro",
      "toll",
      "dmv",
    ],
  },
  {
    category: "Travel",
    keywords: [
      "airline",
      "airbnb",
      "hotel",
      "expedia",
      "delta air",
      "united air",
      "southwest air",
      "marriott",
      "hilton",
      "booking.com",
    ],
  },
  {
    category: "Utilities & Bills",
    keywords: [
      "electric",
      "water bill",
      "internet",
      "comcast",
      "xfinity",
      "at&t",
      "verizon",
      "t-mobile",
      "pg&e",
      "utility",
      "sewer",
      "waste management",
    ],
  },
  {
    category: "Rent & Housing",
    keywords: ["rent", "mortgage", "landlord", "property management"],
  },
  {
    category: "Health & Wellness",
    keywords: [
      "pharmacy",
      "cvs",
      "walgreens",
      "doctor",
      "medical",
      "dental",
      "clinic",
      "gym",
      "fitness",
      "urgent care",
    ],
  },
  {
    category: "Entertainment",
    keywords: [
      "movie",
      "cinema",
      "theatre",
      "theater",
      "concert",
      "ticketmaster",
      "steam",
      "playstation",
      "xbox",
      "nintendo",
    ],
  },
  {
    category: "Shopping",
    keywords: [
      "amazon",
      "ebay",
      "best buy",
      "ikea",
      "home depot",
      "lowe's",
      "macy",
      "nordstrom",
    ],
  },
  {
    category: "Fees & Charges",
    keywords: [
      "atm fee",
      "atm withdrawal",
      "overdraft",
      "service charge",
      "annual fee",
      "late fee",
      "interest charge",
      "maintenance fee",
      "nsf fee",
      "withdrawal fee",
    ],
  },
  {
    category: "Income",
    keywords: [
      "payroll",
      "salary",
      "direct deposit",
      "employer",
      "paycheck",
    ],
  },
  {
    category: "Transfers",
    keywords: [
      "transfer to",
      "transfer from",
      "zelle",
      "venmo",
      "paypal transfer",
      "acct xfer",
      "account transfer",
    ],
  },
];

export function categorize(description: string, amount: number): Category {
  const text = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.category;
    }
  }
  return amount > 0 ? "Income" : "Other";
}
