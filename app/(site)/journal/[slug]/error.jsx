'use client';

export default function JournalEntryError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">Journal</p>
      <h1 className="mt-3 text-3xl font-semibold">This essay is temporarily unavailable.</h1>
      <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-foreground/80">
        Refresh in a minute. Published essays stay in the catalog when the journal cannot be read.
      </p>
    </main>
  );
}
