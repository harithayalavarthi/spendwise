"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/transactions", label: "Transactions" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
      <div className="mx-auto flex max-w-5xl items-center gap-8 px-6 py-4">
        <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
          SpendWise
        </span>
        <nav className="flex gap-1">
          {LINKS.map((link) => {
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
