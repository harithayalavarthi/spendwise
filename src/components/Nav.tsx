"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/transactions", label: "Transactions" },
];

// bankSync is a server-only env var (see src/lib/featureFlags.ts) — Nav is a
// client component (needs usePathname), so the flag is computed server-side
// in layout.tsx and passed down, rather than read here directly.
export default function Nav({ bankSyncEnabled }: { bankSyncEnabled: boolean }) {
  const pathname = usePathname();
  const links = bankSyncEnabled ? [...BASE_LINKS, { href: "/accounts", label: "Accounts" }] : BASE_LINKS;

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
      <div className="mx-auto flex max-w-5xl items-center gap-8 px-6 py-4">
        <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          SpendWise
        </span>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[var(--series-1)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--page-plane)]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
