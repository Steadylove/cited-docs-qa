const STOP = new Set(
  `a an the is are was were be been being of and or to in on for from with by at as that this it its do does did what who whom whose where when why how which many much per not into over after before than then so if`.split(
    " ",
  ),
);

/** Lowercase content words. Used by the demo embedder, keyword rank, and the extractive answerer. */
export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP.has(token));
}

/**
 * Demo mode has no stemmer. "employ" should still hit "employs".
 * Only prefixes of 4+ characters count, so "in" cannot match "incident".
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 4) return false;
  return longer.startsWith(shorter);
}

/** Fraction of query content-words that appear, with the light prefix match above. */
export function overlapScore(query: string, text: string): number {
  const wanted = contentTokens(query);
  if (wanted.length === 0) return 0;
  const haystack = contentTokens(text);
  let hits = 0;
  for (const token of wanted) {
    if (haystack.some((other) => tokensMatch(token, other))) hits += 1;
  }
  return hits / wanted.length;
}
