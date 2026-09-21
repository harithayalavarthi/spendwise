import { categorizeByKeyword, type Category } from "./categories";
import { getMerchantKey, lookupMerchantCategory, saveMerchantCategory } from "./merchantCache";
import { categorizeWithOllama } from "./llmCategorize";

export interface CategorizeResult {
  category: Category;
  source: "keyword" | "merchant-cache" | "llm" | "fallback";
}

// Layered categorization, cheapest and most trustworthy first:
//   1. keyword rules (instant, free, human-curated)
//   2. merchant cache (instant — a merchant already resolved by the LLM or
//      corrected by the user)
//   3. local LLM via Ollama (a few hundred ms, runs on this machine)
//   4. amount-sign fallback (Income for a deposit, Other otherwise)
export async function categorizeTransaction(
  description: string,
  amount: number
): Promise<CategorizeResult> {
  const keywordMatch = categorizeByKeyword(description);
  if (keywordMatch) return { category: keywordMatch, source: "keyword" };

  const merchantKey = getMerchantKey(description);
  const cached = lookupMerchantCategory(merchantKey);
  if (cached) return { category: cached, source: "merchant-cache" };

  const llmResult = await categorizeWithOllama(description);
  if (llmResult) {
    saveMerchantCategory(merchantKey, llmResult, "llm");
    return { category: llmResult, source: "llm" };
  }

  return { category: amount > 0 ? "Income" : "Other", source: "fallback" };
}
