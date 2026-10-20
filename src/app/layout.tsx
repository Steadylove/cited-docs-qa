import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cited — document Q&A with sources",
  description:
    "Upload a document, ask a question, and check every claim against the page it came from.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-line bg-[#f7f4ee]/90">
          <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-5 py-4">
            <Link href="/" className="group flex items-baseline gap-3">
              <span className="font-serif text-2xl tracking-tight text-ink">Cited</span>
              <span className="hidden text-sm text-muted sm:inline">
                Ask a document. Check every claim.
              </span>
            </Link>
            <span className="text-xs uppercase tracking-[0.16em] text-muted">Portfolio demo</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
