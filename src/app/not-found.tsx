import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <h1 className="font-serif text-3xl">That document is not in this workspace.</h1>
      <Link href="/" className="mt-4 inline-block text-sm text-pine">
        Back to documents
      </Link>
    </main>
  );
}
