import { canonicalOption } from '@/shared/field-i18n'

import type { ModuleValues } from './field-logic'
import { moduleValueAsString } from './field-logic'
import { snapshotValue } from './components/reference-snapshot'

const PROJECTED_FIELDS = [
  'material',
  'chemical_formula',
  'crystal_orientation',
  'oxide_thickness_nm',
] as const

function snapshotText(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshotValue(snapshot, key)
  return value == null ? '' : String(value).trim()
}

function orientationText(snapshot: Record<string, unknown>): string {
  const value = snapshotValue(snapshot, 'substrate_orientation_polish')
  if (!value || typeof value !== 'object')
    return snapshotText(snapshot, 'substrate_orientation_polish')
  return ['value', 'option']
    .map((key) => String((value as Record<string, unknown>)[key] ?? '').trim())
    .filter(Boolean)
    .join('；')
}

export function materialLotProjection(
  snapshot: Record<string, unknown>,
): ModuleValues {
  return Object.fromEntries(
    Object.entries({
      material: canonicalOption(snapshotText(snapshot, 'substrate_material')),
      chemical_formula: snapshotText(snapshot, 'chemical_formula'),
      crystal_orientation: orientationText(snapshot),
      oxide_thickness_nm: snapshotText(
        snapshot,
        'substrate_oxide_thickness_nm',
      ),
    }).filter(([, value]) => value !== ''),
  )
}

export function materialLotProjectedItem(item: ModuleValues): ModuleValues {
  try {
    const reference = JSON.parse(moduleValueAsString(item['lot_ref'])) as {
      snapshot?: Record<string, unknown>
    }
    if (!reference.snapshot) return item
    return {
      ...item,
      ...Object.fromEntries(PROJECTED_FIELDS.map((key) => [key, ''])),
      ...materialLotProjection(reference.snapshot),
    }
  } catch {
    return item
  }
}
