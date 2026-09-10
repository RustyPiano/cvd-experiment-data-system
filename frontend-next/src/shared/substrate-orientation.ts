import { substrateOrientation } from '@/shared/generated/field-metadata'
import { canonicalOption, localizedOption } from '@/shared/field-i18n'
import i18n from '@/shared/i18n'

export function normalizeCrystalPlane(
  raw: string,
  material = '',
  quartzType = '',
): string {
  const invalid = () => {
    throw new Error('substrate_crystal_plane')
  }
  if (raw.length > substrateOrientation.max_length) invalid()
  let value = raw
    .trim()
    .replaceAll('−', '-')
    .replaceAll('（', '(')
    .replaceAll('）', ')')
  if (!value) return ''
  if (
    material === 'quartz' &&
    quartzType === 'fused_silica' &&
    value !== 'amorphous'
  )
    invalid()
  if (substrateOrientation.statuses.includes(value)) {
    if (
      material === 'sapphire_al2o3' &&
      ['amorphous', 'polycrystalline'].includes(value)
    )
      invalid()
    if (
      material === 'quartz' &&
      quartzType === 'single_crystal_quartz' &&
      ['amorphous', 'polycrystalline'].includes(value)
    )
      invalid()
    return value
  }
  if (material === 'quartz' && quartzType !== 'single_crystal_quartz') invalid()
  if (material === 'sapphire_al2o3') {
    const name = value.toLowerCase().replace(/[\s-]/g, '')
    const plane = Object.entries(
      substrateOrientation.sapphire_plane_names,
    ).find(([, letter]) =>
      substrateOrientation.sapphire_name_suffixes.some(
        (suffix) => `${letter}${suffix}` === name,
      ),
    )
    if (plane) return plane[0]
  }
  if (value.startsWith('(') && value.endsWith(')'))
    value = value.slice(1, -1).trim()
  const indices = /^[+-]?\d+(?:\s+[+-]?\d+){2,3}$/.test(value)
    ? value.split(/\s+/).map(Number)
    : /^(?:-?\d){3,4}$/.test(value)
      ? (value.match(/-?\d/g) ?? []).map(Number)
      : []
  if (
    !(substrateOrientation.index_counts[material] ?? [3, 4]).includes(
      indices.length,
    ) ||
    !indices.every(Number.isSafeInteger) ||
    !indices.some((index) => index !== 0) ||
    (indices.length === 4 && indices[0] + indices[1] + indices[2] !== 0)
  )
    invalid()
  return `(${indices.join(' ')})`
}

export function substratePlaneOptions(
  material: string,
  quartzType = '',
): string[] {
  if (material === 'quartz' && quartzType === 'fused_silica')
    return ['amorphous']
  if (material === 'quartz' && quartzType !== 'single_crystal_quartz')
    return ['not_provided']
  return [
    ...(substrateOrientation.presets[material] ?? []),
    ...substrateOrientation.statuses.filter(
      (status) =>
        !(
          material === 'sapphire_al2o3' ||
          (material === 'quartz' && quartzType === 'single_crystal_quartz')
        ) || !['amorphous', 'polycrystalline'].includes(status),
    ),
  ]
}

export function substratePlaneLabel(
  value: string,
  material: string,
  language: string,
): string {
  const letter =
    material === 'sapphire_al2o3'
      ? substrateOrientation.sapphire_plane_names[value]
      : null
  return letter
    ? i18n.t('entityLibrary.orientation.namedPlane', {
        letter,
        indices: value,
        lng: language,
      })
    : localizedOption(value, language)
}

export function substrateOrientationPayload(
  values: Record<string, unknown>,
): Record<string, string> {
  const material = canonicalOption(String(values.substrate_material ?? ''))
  const quartzType = canonicalOption(String(values.quartz_type ?? ''))
  const raw = String(values.substrate_crystal_plane ?? '')
  const normalized = normalizeCrystalPlane(raw, material, quartzType)
  const plane =
    material === 'quartz' && quartzType === 'fused_silica'
      ? 'amorphous'
      : normalized
  const cut = String(values.substrate_cut_spec ?? '').trim()
  if (
    (plane === 'supplier_cut') !== Boolean(cut) ||
    cut.length > substrateOrientation.max_length
  )
    throw new Error('substrate_cut_spec')
  if (
    plane === 'supplier_cut' &&
    material === 'quartz' &&
    quartzType !== 'single_crystal_quartz'
  )
    throw new Error('substrate_crystal_plane')
  return {
    ...(plane ? { substrate_crystal_plane: plane } : {}),
    ...(cut ? { substrate_cut_spec: cut } : {}),
  }
}

/** Editing a new version never rewrites the historical supplier text. */
export function legacySubstrateOrientation(
  source: Record<string, unknown>,
): Record<string, unknown> {
  if (
    source.substrate_crystal_plane != null ||
    source.substrate_polish != null ||
    !source.substrate_orientation_polish
  )
    return source
  const legacy = source.substrate_orientation_polish
  const raw =
    typeof legacy === 'object' ? (legacy as { value?: unknown }).value : legacy
  const polish =
    typeof legacy === 'object'
      ? (legacy as { option?: unknown }).option
      : undefined
  let plane = ''
  let cut: string | undefined
  if (raw) {
    try {
      plane = normalizeCrystalPlane(
        String(raw),
        canonicalOption(String(source.substrate_material ?? '')),
        String(source.quartz_type ?? ''),
      )
    } catch {
      plane = 'supplier_cut'
      cut = String(raw)
    }
  }
  return {
    ...source,
    substrate_crystal_plane: plane,
    substrate_cut_spec: cut,
    substrate_polish: polish,
  }
}
