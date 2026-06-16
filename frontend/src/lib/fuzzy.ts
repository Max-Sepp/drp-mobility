/**
 * Returns a score > 0 if query fuzzy-matches target, 0 if no match.
 * Substring matches rank highest; subsequence matches rank by character density.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0

  if (t.includes(q)) return 1 + (1 - q.length / t.length) * 0.5

  // All query chars must appear in order (subsequence)
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  if (qi < q.length) return 0
  return q.length / t.length
}
