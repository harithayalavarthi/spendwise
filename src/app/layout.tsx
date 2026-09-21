import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import OllamaSetupBanner from "@/components/OllamaSetupBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpendWise",
  description: "Upload bank statements to categorize spending and get insights",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--page-plane)] text-[var(--text-primary)]">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
          <OllamaSetupBanner />
          {children}
        </main>
      </body>
    </html>
  );
}
