import { notFound } from "next/navigation";
import { isFeatureEnabled } from "@/lib/featureFlags";
import AccountsPageContent from "@/components/AccountsPageContent";

// Server Component so the bankSync flag (a server-only env var) can gate
// this route directly, the same way the /api/plaid/* routes already do —
// visiting /accounts by URL while the flag is off behaves like the route
// doesn't exist, matching the API rather than showing a broken page.
//
// force-dynamic (same as the Dashboard page) is required here specifically:
// without it, Next statically prerenders this page once at build time using
// whatever FEATURE_BANK_SYNC happened to be set then, defeating the whole
// point of a flag that's supposed to be flippable via .env.local with no
// rebuild — confirmed by `next build` showing /accounts as a static route
// before this was added.
export const dynamic = "force-dynamic";

export default function AccountsPage() {
  if (!isFeatureEnabled("bankSync")) {
    notFound();
  }

  return <AccountsPageContent />;
}
