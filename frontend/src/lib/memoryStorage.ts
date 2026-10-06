/** A stand-in for localStorage in tests, starting with `items`. Several stores sharing one act as tabs. */
export function memoryStorage(items: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(items))
  return {
    get length() {
      return map.size
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage
}
