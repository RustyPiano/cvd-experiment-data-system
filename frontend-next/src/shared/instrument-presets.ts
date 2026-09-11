import {
  characterizationProfiles,
  omConfiguration,
  ramanConfiguration,
  plConfiguration,
} from '@/shared/generated/field-metadata'
import {
  characterizationConditionIssue,
  conditionMatches,
} from './characterization-conditions'

export type InstrumentPreset = {
  name: string
  conditions: Record<string, unknown>
}

export function presetPowerUnitMatches(
  conditions: Record<string, unknown>,
  fixedUnit: string | undefined,
) {
  return (
    !fixedUnit ||
    conditions.power_setting == null ||
    conditions.power_setting_unit === fixedUnit
  )
}

export function presetFields(method: string) {
  if (method === 'PL') return plConfiguration.preset_fields
  return method === 'optical_microscopy'
    ? omConfiguration.preset_fields
    : ['Raman', 'low_frequency_raman'].includes(method)
      ? ramanConfiguration.preset_fields
      : undefined
}

export function instrumentPresets(
  configuration: Record<string, unknown> | undefined,
): InstrumentPreset[] {
  return Array.isArray(configuration?.presets)
    ? (configuration.presets as InstrumentPreset[])
    : []
}

export function conditionDraft(
  conditions: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(conditions).flatMap(([key, value]) =>
      value && typeof value === 'object'
        ? Object.entries(value).map(([part, number]) => [
            key + '.' + part,
            String(number),
          ])
        : [[key, String(value ?? '')]],
    ),
  )
}

export function reconcileConditions(
  method: string,
  draft: Record<string, string>,
) {
  const next = { ...draft }
  if (method === 'PL' && next.slit_setting_kind === 'bandwidth')
    delete next.slit_width_um
  let size: number
  do {
    size = Object.keys(next).length
    for (const field of characterizationProfiles[method]?.condition_fields ??
      []) {
      if (
        !conditionMatches(field.when, next) ||
        (field.options &&
          next[field.key] &&
          !field.options.some(
            (option) =>
              option.value === next[field.key] &&
              conditionMatches(option.when, next),
          ))
      ) {
        for (const key of Object.keys(next))
          if (key === field.key || key.startsWith(field.key + '.'))
            delete next[key]
      }
    }
  } while (Object.keys(next).length < size)
  return next
}

export function presetConditions(
  method: string,
  draft: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of characterizationProfiles[method].condition_fields) {
    if (field.components) {
      const parts = Object.fromEntries(
        field.components
          .filter((part) => draft[field.key + '.' + part.key]?.trim())
          .map((part) => [part.key, Number(draft[field.key + '.' + part.key])]),
      )
      if (Object.keys(parts).length) result[field.key] = parts
    } else if (draft[field.key]?.trim()) {
      result[field.key] = ['text', 'select'].includes(field.value_type)
        ? draft[field.key]
        : Number(draft[field.key])
    }
  }
  return result
}

export function instrumentPresetsAreValid(
  method: string,
  configuration: Record<string, unknown> | undefined,
) {
  if (method === 'low_frequency_raman') method = 'Raman'
  const presets = instrumentPresets(configuration)
  const fields = characterizationProfiles[method]?.condition_fields ?? []
  return (
    presets.length <= 50 &&
    new Set(presets.map((p) => p.name.trim().toLowerCase())).size ===
      presets.length &&
    presets.every((preset) => {
      const draft: Record<string, string> = {
        ...(method === 'optical_microscopy'
          ? { observation_mode: 'digital', image_color_mode: 'color' }
          : {}),
        ...conditionDraft(preset.conditions),
      }
      return (
        preset.name.trim().length > 0 &&
        preset.name.trim().length <= 128 &&
        Object.keys(preset.conditions).length > 0 &&
        Object.keys(preset.conditions).every(
          (key) =>
            fields.some((field) => field.key === key) &&
            (!presetFields(method) || presetFields(method)!.includes(key)),
        ) &&
        fields.every(
          (field) =>
            !characterizationConditionIssue(field, draft) &&
            (conditionMatches(field.when, draft) ||
              !preset.conditions[field.key]),
        ) &&
        Boolean(draft.excitation_power_value) ===
          Boolean(draft.excitation_power_basis)
      )
    })
  )
}
