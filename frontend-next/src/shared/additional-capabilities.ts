export function additionalCapabilityNames(
  snapshot?: Record<string, unknown> | null,
): string[] {
  const values = snapshot?.field_device_other_names
  if (Array.isArray(values))
    return values
      .filter((value): value is string => typeof value === 'string')
      .map((name) => name.trim())
      .filter(Boolean)
  const legacy = snapshot?.field_device_other_name
  return typeof legacy === 'string' && legacy.trim() ? [legacy.trim()] : []
}

export function capabilityNamesAreValid(names: string[]): boolean {
  const normalized = names.map((name) => name.trim().toLocaleLowerCase())
  return (
    normalized.length > 0 &&
    normalized.every((name) => name.length > 0 && name.length <= 128) &&
    new Set(normalized).size === normalized.length
  )
}
