import { CATEGORIES, type Category } from "./categories";
import { logInfo, logWarn } from "./logger";

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const TIMEOUT_MS = 15_000; // generous enough to cover a cold model load

const SYSTEM_PROMPT = `You categorize personal finance transactions from their description alone. Use general knowledge of merchant names, chains, and business-name patterns. Consider the full category list evenly - do not default to any one category.
Pattern guidance (non-exhaustive examples, one per category so no single category is favored):
- "salon", "spa", "clinic", "gym" -> Health & Wellness
- "stadium", "arena", "cinema", "theatre" -> Entertainment
- "ferry", "transit", "toll", a gas station brand -> Transport
- "music", "instrument", "electronics", "hardware", a retail chain -> Shopping
- "market", "grocery", a supermarket chain -> Groceries
- "cafe", "restaurant", "grill", a food chain -> Dining & Coffee
- "hotel", "airline", "resort" -> Travel
- a subscription/software/app biller -> Subscriptions
Only answer Other when the description truly gives no interpretable clue about the business type (a bare reference code, an unfamiliar name with no descriptive word or recognizable pattern at all). Do not default to Other just because a business is small or local, and do not default to any single category out of caution - pick whichever category the name actually points to.`;

// Runs locally via Ollama — the transaction description is the only thing
// that leaves this process, and it goes to localhost, not the network.
export async function categorizeWithOllama(description: string): Promise<Category | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        // Deterministic: this is a classification task, not creative
        // generation — the same merchant should always get the same
        // answer, and greedy decoding is also the best-calibrated mode
        // (temperature > 0 made the model guess specific categories on
        // pure nonsense input instead of recognizing it had no signal).
        options: { temperature: 0 },
        format: {
          type: "object",
          properties: {
            category: { type: "string", enum: CATEGORIES },
          },
          required: ["category"],
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Transaction description: "${description}"` },
        ],
      }),
    });

    if (!res.ok) {
      logWarn("llm", `Ollama returned ${res.status} for "${description}" — falling back`, await res.text().catch(() => ""));
      return null;
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) {
      logWarn("llm", `Ollama response had no message content for "${description}" — falling back`);
      return null;
    }

    const parsed = JSON.parse(content) as { category?: string };
    const category = parsed.category;
    if (category && (CATEGORIES as readonly string[]).includes(category)) {
      logInfo("llm", `"${description}" -> ${category}`);
      return category as Category;
    }
    logWarn("llm", `Ollama returned an unrecognized category "${category}" for "${description}" — falling back`);
    return null;
  } catch (err) {
    // Ollama not running, model not pulled, timeout, malformed response —
    // any of these just means "no LLM opinion", not a failed upload — but
    // log which one it was, since they used to be indistinguishable.
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `timed out after ${TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    logWarn("llm", `Ollama call failed for "${description}" (${reason}) — falling back`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
