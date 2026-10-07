// Helpers shared by rules that read words.

/** The value most of them have; on a tie, the one that comes first. */
export function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: T | undefined
  for (const [value, count] of counts) if (best === undefined || count > counts.get(best)!) best = value
  return best
}
