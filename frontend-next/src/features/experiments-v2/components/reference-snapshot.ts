export function snapshotValue(
  snapshot: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!snapshot) return undefined
  const direct = snapshot[key]
  if (direct != null && direct !== '') return direct
  for (const containerKey of ['attrs', 'attrs_snapshot']) {
    const container = snapshot[containerKey]
    if (
      container &&
      typeof container === 'object' &&
      !Array.isArray(container)
    ) {
      const nested = (container as Record<string, unknown>)[key]
      if (nested != null && nested !== '') return nested
    }
  }
  return undefined
}
