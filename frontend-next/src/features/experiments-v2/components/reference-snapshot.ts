import { canonicalOption } from '@/shared/field-i18n'
import { gasSpecies } from '@/shared/generated/field-metadata'

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

function gasIdentity(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (digit) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit)))
    .replace(/[\s_-]+/g, '')
}

export function gasCylinderMatchesSpecies(
  snapshot: Record<string, unknown> | null | undefined,
  species: string,
  otherName?: string | null,
): boolean {
  if (
    canonicalOption(String(snapshotValue(snapshot, 'lot_category') ?? '')) !==
    'gas_cylinder'
  ) {
    return false
  }
  if (!species) return true

  const components = snapshotValue(snapshot, 'gas_components')
  if (Array.isArray(components)) {
    if (species === 'premixed') {
      return (
        components.length > 1 &&
        components.every((item) => {
          if (!item || typeof item !== 'object') return false
          const component = item as Record<string, unknown>
          return (
            Boolean(component.species) &&
            Number.isFinite(Number(component.volume_percent)) &&
            Number(component.volume_percent) > 0
          )
        }) &&
        Math.abs(
          components.reduce(
            (sum, item) => sum + Number(item.volume_percent),
            0,
          ) - 100,
        ) <= 0.010000001
      )
    }
    if (components.length !== 1) return false
    const component = components[0]
    if (!component || typeof component !== 'object') return false
    const value = component as Record<string, unknown>
    return (
      value.species === species &&
      Number.isFinite(Number(value.volume_percent)) &&
      Math.abs(Number(value.volume_percent) - 100) <= 0.010000001 &&
      (species !== 'other' ||
        gasIdentity(value.other_name) === gasIdentity(otherName))
    )
  }

  if (species === 'other') {
    const expected = gasIdentity(otherName)
    return (
      Boolean(expected) &&
      [
        snapshotValue(snapshot, 'chemical_formula'),
        snapshotValue(snapshot, 'substance_name'),
      ].some((value) => gasIdentity(value) === expected)
    )
  }
  const definition = gasSpecies[species]
  if (!definition) return false
  return (
    gasIdentity(snapshotValue(snapshot, 'chemical_formula')) ===
      gasIdentity(species) ||
    definition.aliases
      .map(gasIdentity)
      .includes(gasIdentity(snapshotValue(snapshot, 'substance_name')))
  )
}
