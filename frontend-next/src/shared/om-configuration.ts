import {
  characterizationProfiles,
  omConfiguration,
  ramanConfiguration,
} from './generated/field-metadata'
import {
  characterizationConditionIssue,
  conditionMatches,
} from './characterization-conditions'
import { conditionDraft, reconcileConditions } from './instrument-presets'

export type OMEntry = {
  name: string
  conditions: Record<string, unknown>
  adjustable?: string[]
  references?: Record<string, string>
  native_extensions?: string[]
  mode_options?: Record<string, string[]>
}
export type OMCatalog = Record<string, OMEntry[]>
export type OMSelection = Record<string, string>

export const opticalSpec = (method = 'optical_microscopy') =>
  method === 'Raman' ? ramanConfiguration : omConfiguration

export function omCatalog(
  configuration?: Record<string, unknown>,
  method = 'optical_microscopy',
): OMCatalog | undefined {
  return configuration?.[method === 'Raman' ? 'raman' : 'om'] as
    | OMCatalog
    | undefined
}

export function omCatalogValid(
  catalog: OMCatalog | undefined,
  method = 'optical_microscopy',
) {
  if (!catalog) return true
  const definition = opticalSpec(method)
  return Object.entries(definition.sections).every(([section, spec]) => {
    const entries = catalog[section] ?? []
    if (
      (definition.required_sections ?? ['objectives', 'optics']).includes(
        section,
      ) &&
      !entries.length
    )
      return false
    if (
      entries.length > definition.max_entries ||
      new Set(entries.map((entry) => entry.name.trim().toLowerCase())).size !==
        entries.length
    )
      return false
    return entries.every((entry) => {
      const draft: Record<string, string> = {
        ...(method === 'optical_microscopy'
          ? { observation_mode: 'digital' }
          : {}),
        ...conditionDraft(entry.conditions),
      }
      return (
        Object.values(entry.mode_options ?? {}).every(
          (options) => options.length > 0,
        ) &&
        Boolean(entry.name.trim()) &&
        entry.name.trim().length <= 128 &&
        Object.keys(entry.conditions).every((key) =>
          spec.fields.includes(key),
        ) &&
        characterizationProfiles[method].condition_fields
          .filter((field) => spec.fields.includes(field.key))
          .every(
            (field) =>
              !characterizationConditionIssue(
                field,
                draft,
                spec.required.includes(field.key) ||
                  Boolean(
                    field.required_when &&
                    conditionMatches(field.required_when, draft),
                  ),
              ) &&
              (conditionMatches(field.when, draft) ||
                !entry.conditions[field.key]),
          ) &&
        !(
          draft.objective_immersion === 'air' && Number(draft.objective_na) >= 1
        ) &&
        (spec.references ?? []).every((key) =>
          catalog[key]?.some((item) => item.name === entry.references?.[key]),
        )
      )
    })
  })
}

export function omFixedConditions(
  catalog: OMCatalog,
  selection: OMSelection,
  method = 'optical_microscopy',
) {
  const values: Record<string, string> = {}
  const adjustable = new Set<string>()
  for (const [section, spec] of Object.entries(opticalSpec(method).sections)) {
    const entry = catalog[section]?.find(
      (item) => item.name === selection[section],
    )
    if (!entry) continue
    Object.assign(values, conditionDraft(entry.conditions))
    if (spec.name_field) values[spec.name_field] = entry.name
    for (const key of entry.adjustable ?? []) adjustable.add(key)
    if (section === 'scales')
      for (const key of Object.keys(entry.conditions)) adjustable.delete(key)
  }
  return { values, adjustable }
}

export function omDefaultSelection(
  catalog: OMCatalog,
  digital: boolean,
  method = 'optical_microscopy',
): OMSelection {
  if (method === 'Raman') {
    const selection: OMSelection = {}
    for (const section of Object.keys(ramanConfiguration.sections)) {
      const entries = (catalog[section] ?? []).filter((entry) =>
        Object.entries(entry.references ?? {}).every(
          ([key, name]) => selection[key] === name,
        ),
      )
      if (entries.length === 1) selection[section] = entries[0].name
    }
    return selection
  }
  return Object.fromEntries(
    Object.entries(catalog)
      .filter(
        ([section, entries]) =>
          section !== 'scales' &&
          entries.length === 1 &&
          (digital || section !== 'cameras'),
      )
      .map(([section, entries]) => [section, entries[0].name]),
  )
}

export function omSelectionComplete(
  catalog: OMCatalog,
  selection: OMSelection,
  digital: boolean,
  method = 'optical_microscopy',
) {
  if (method === 'Raman')
    return ramanConfiguration.required_sections!.every((section) =>
      catalog[section]?.some(
        (entry) =>
          entry.name === selection[section] &&
          Object.entries(entry.references ?? {}).every(
            ([key, name]) => selection[key] === name,
          ),
      ),
    )
  return (
    ['objectives', 'optics', ...(digital ? ['cameras'] : [])].every((section) =>
      catalog[section]?.some((entry) => entry.name === selection[section]),
    ) &&
    (!selection.scales ||
      catalog.scales?.some(
        (entry) =>
          entry.name === selection.scales &&
          Object.entries(entry.references ?? {}).every(
            ([key, name]) => selection[key] === name,
          ),
      ))
  )
}

export function omEntryConditions(
  catalog: OMCatalog,
  selection: OMSelection,
  conditions: Record<string, string>,
  method = 'optical_microscopy',
) {
  const fixed = omFixedConditions(catalog, selection, method)
  if (method === 'Raman') {
    const hardware = new Set(
      Object.values(ramanConfiguration.sections).flatMap((spec) => [
        ...spec.fields,
        ...(spec.name_field ? [spec.name_field] : []),
      ]),
    )
    return reconcileConditions(method, {
      ...Object.fromEntries(
        Object.entries(conditions).filter(
          ([key]) => !hardware.has(key) || fixed.adjustable.has(key),
        ),
      ),
      ...fixed.values,
      ...Object.fromEntries(
        Object.entries(conditions).filter(([key]) => fixed.adjustable.has(key)),
      ),
    })
  }
  return reconcileConditions('optical_microscopy', {
    ...Object.fromEntries(
      Object.entries(conditions).filter(
        ([key]) =>
          [
            'observation_mode',
            'acquisition_note',
            'sample_preparation',
          ].includes(key) ||
          (omConfiguration.preset_fields.includes(key) &&
            ![
              'binning',
              'incident_polarization_angle_deg',
              'analyzer_angle_deg',
              'polarization_reference',
            ].includes(key)),
      ),
    ),
    ...fixed.values,
    ...Object.fromEntries(
      Object.entries(conditions).filter(([key]) => fixed.adjustable.has(key)),
    ),
    ...Object.fromEntries(
      Object.entries(fixed.values).filter(
        ([key]) => !fixed.adjustable.has(key),
      ),
    ),
  })
}

export function omVisibleFields(
  catalog: OMCatalog | undefined,
  selection: OMSelection,
  conditions: Record<string, string>,
  method = 'optical_microscopy',
) {
  if (method === 'Raman') {
    if (!catalog) return ramanConfiguration.manual_fields
    const { adjustable } = omFixedConditions(catalog, selection, method)
    const hardware = new Set(
      Object.values(ramanConfiguration.sections).flatMap((spec) => [
        ...spec.fields,
        ...(spec.name_field ? [spec.name_field] : []),
      ]),
    )
    return ramanConfiguration.manual_fields.filter(
      (key) => !hardware.has(key) || adjustable.has(key),
    )
  }
  const fields = omConfiguration.manual_fields
  if (!catalog)
    return fields.filter(
      (key) =>
        !['filter_configuration', 'aperture_setting', 'binning'].includes(key),
    )
  const { adjustable } = omFixedConditions(catalog, selection)
  return [...new Set([...fields, ...adjustable])].filter(
    (key) =>
      [
        'observation_mode',
        'exposure_time_ms',
        'exposure_mode',
        'acquisition_note',
      ].includes(key) ||
      (adjustable.has(key) &&
        (conditions.image_color_mode === 'color' ||
          !key.startsWith('white_balance'))),
  )
}
