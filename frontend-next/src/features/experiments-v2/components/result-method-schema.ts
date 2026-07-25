import { canonicalOption } from '@/shared/field-i18n'

export type ResultFieldKey =
  | 'observed_phenomena'
  | 'detected_phase_stacking'
  | 'layer_count'
  | 'coverage_percent'
  | 'domain_size_um'
  | 'nucleation_density_cm2'
  | 'key_spectral_metrics'

export type ConditionField = {
  key: string
  unit?: string
  type?: 'number' | 'select' | 'text'
  options?: readonly string[]
  integer?: boolean
  min?: number
  gt?: number
}

export type MetricDefinition = {
  code: string
  unit: string
}

export type MethodSchema = {
  conditionFields: readonly ConditionField[]
  resultFields: readonly ResultFieldKey[]
  metrics: readonly MetricDefinition[]
}

export type NamedParameter = {
  name: string
  value: string
  unit: string
}

export type ParsedTestConditions = {
  values: Record<string, string>
  parameters: NamedParameter[]
  note: string
}

const OPTICAL_RESULTS = [
  'observed_phenomena',
  'coverage_percent',
  'domain_size_um',
  'nucleation_density_cm2',
] as const
const SPECTROSCOPY_RESULTS = [
  'detected_phase_stacking',
  'layer_count',
  'key_spectral_metrics',
] as const

export const METHOD_SCHEMAS: Readonly<Record<string, MethodSchema>> = {
  optical_microscopy: {
    conditionFields: [
      {
        key: 'illumination_mode',
        type: 'select',
        options: ['bright_field', 'dark_field', 'polarized_light'],
      },
      { key: 'objective_magnification_x', type: 'number', unit: '×', gt: 0 },
      {
        key: 'scale_calibration_um_per_px',
        type: 'number',
        unit: 'μm/px',
        gt: 0,
      },
    ],
    resultFields: OPTICAL_RESULTS,
    metrics: [],
  },
  SEM: {
    conditionFields: [
      { key: 'accelerating_voltage_kv', type: 'number', unit: 'kV', gt: 0 },
      { key: 'working_distance_mm', type: 'number', unit: 'mm', gt: 0 },
      { key: 'detector', type: 'text' },
      { key: 'magnification_x', type: 'number', unit: '×', gt: 0 },
    ],
    resultFields: OPTICAL_RESULTS,
    metrics: [],
  },
  Raman: {
    conditionFields: [
      { key: 'excitation_wavelength_nm', type: 'number', unit: 'nm', gt: 0 },
      { key: 'laser_power_mw', type: 'number', unit: 'mW', min: 0 },
      { key: 'objective_magnification_x', type: 'number', unit: '×', gt: 0 },
      { key: 'integration_time_s', type: 'number', unit: 's', gt: 0 },
      { key: 'accumulations', type: 'number', integer: true, min: 1 },
    ],
    resultFields: SPECTROSCOPY_RESULTS,
    metrics: [
      { code: 'raman_e2g_peak_position', unit: 'cm⁻¹' },
      { code: 'raman_a1g_peak_position', unit: 'cm⁻¹' },
      { code: 'raman_peak_separation', unit: 'cm⁻¹' },
      { code: 'raman_peak_fwhm', unit: 'cm⁻¹' },
      { code: 'raman_intensity_ratio', unit: 'ratio' },
    ],
  },
  low_frequency_raman: {
    conditionFields: [
      { key: 'excitation_wavelength_nm', type: 'number', unit: 'nm', gt: 0 },
      { key: 'laser_power_mw', type: 'number', unit: 'mW', min: 0 },
      { key: 'objective_magnification_x', type: 'number', unit: '×', gt: 0 },
      { key: 'integration_time_s', type: 'number', unit: 's', gt: 0 },
      {
        key: 'low_wavenumber_cutoff_cm1',
        type: 'number',
        unit: 'cm⁻¹',
        min: 0,
      },
    ],
    resultFields: SPECTROSCOPY_RESULTS,
    metrics: [
      { code: 'shear_mode_peak_position', unit: 'cm⁻¹' },
      { code: 'layer_breathing_mode_peak_position', unit: 'cm⁻¹' },
      { code: 'low_frequency_peak_fwhm', unit: 'cm⁻¹' },
    ],
  },
  PL: {
    conditionFields: [
      { key: 'excitation_wavelength_nm', type: 'number', unit: 'nm', gt: 0 },
      { key: 'excitation_power_mw', type: 'number', unit: 'mW', min: 0 },
      { key: 'objective_magnification_x', type: 'number', unit: '×', gt: 0 },
      { key: 'integration_time_s', type: 'number', unit: 's', gt: 0 },
      { key: 'measurement_temperature_k', type: 'number', unit: 'K', gt: 0 },
    ],
    resultFields: ['layer_count', 'key_spectral_metrics'],
    metrics: [
      { code: 'pl_a_exciton_peak_energy', unit: 'eV' },
      { code: 'pl_b_exciton_peak_energy', unit: 'eV' },
      { code: 'pl_peak_fwhm', unit: 'meV' },
      { code: 'pl_integrated_intensity', unit: 'a.u.' },
    ],
  },
  AFM: {
    conditionFields: [
      {
        key: 'afm_mode',
        type: 'select',
        options: ['tapping', 'contact', 'non_contact'],
      },
      { key: 'scan_size_um', type: 'number', unit: 'μm', gt: 0 },
      { key: 'scan_rate_hz', type: 'number', unit: 'Hz', gt: 0 },
    ],
    resultFields: ['layer_count', 'key_spectral_metrics'],
    metrics: [
      { code: 'afm_step_height', unit: 'nm' },
      { code: 'afm_rms_roughness', unit: 'nm' },
      { code: 'afm_ra_roughness', unit: 'nm' },
    ],
  },
  XRD: {
    conditionFields: [
      { key: 'radiation_source', type: 'text' },
      { key: 'scan_start_2theta_deg', type: 'number', unit: '° 2θ', min: 0 },
      { key: 'scan_end_2theta_deg', type: 'number', unit: '° 2θ', gt: 0 },
      { key: 'step_size_2theta_deg', type: 'number', unit: '° 2θ', gt: 0 },
    ],
    resultFields: ['detected_phase_stacking', 'key_spectral_metrics'],
    metrics: [
      { code: 'xrd_peak_2theta', unit: '° 2θ' },
      { code: 'xrd_peak_fwhm', unit: '° 2θ' },
      { code: 'xrd_d_spacing', unit: 'nm' },
    ],
  },
  TEM: {
    conditionFields: [
      { key: 'accelerating_voltage_kv', type: 'number', unit: 'kV', gt: 0 },
      {
        key: 'tem_mode',
        type: 'select',
        options: ['TEM', 'HRTEM', 'STEM', 'SAED'],
      },
      { key: 'camera_length_mm', type: 'number', unit: 'mm', gt: 0 },
    ],
    resultFields: [
      'detected_phase_stacking',
      'layer_count',
      'domain_size_um',
      'key_spectral_metrics',
    ],
    metrics: [{ code: 'tem_lattice_spacing', unit: 'nm' }],
  },
}

const FALLBACK_SCHEMA: MethodSchema = {
  conditionFields: [],
  resultFields: ['observed_phenomena', 'key_spectral_metrics'],
  metrics: [],
}

const ALL_METRICS = new Map(
  Object.values(METHOD_SCHEMAS).flatMap((schema) =>
    schema.metrics.map((metric) => [metric.code, metric] as const),
  ),
)
const STRUCTURED_CONDITIONS_SCHEMA = 'cvd_method_conditions_v1'
const CUSTOM_METRIC_PREFIX = 'custom_u_'

export function methodSchema(method: string): MethodSchema {
  return METHOD_SCHEMAS[canonicalOption(method)] ?? FALLBACK_SCHEMA
}

export function metricDefinition(code: string): MetricDefinition | undefined {
  return ALL_METRICS.get(code)
}

export function encodeCustomMetricName(name: string): string | null {
  const normalized = name.trim()
  if (!normalized) return null
  const encoded = Array.from(new TextEncoder().encode(normalized), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const code = `${CUSTOM_METRIC_PREFIX}${encoded}`
  return code.length <= 64 ? code : null
}

export function decodeCustomMetricName(code: string): string | null {
  if (!code.startsWith(CUSTOM_METRIC_PREFIX)) return null
  const encoded = code.slice(CUSTOM_METRIC_PREFIX.length)
  if (!encoded || encoded.length % 2 !== 0 || !/^[a-f0-9]+$/.test(encoded)) {
    return null
  }
  try {
    const bytes = new Uint8Array(
      encoded.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
    )
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export function readableLegacyMetricCode(code: string): string {
  const tokens: Readonly<Record<string, string>> = {
    afm: 'AFM',
    fwhm: 'FWHM',
    pl: 'PL',
    raman: 'Raman',
    rms: 'RMS',
    sem: 'SEM',
    tem: 'TEM',
    xrd: 'XRD',
  }
  return code
    .split('_')
    .filter(Boolean)
    .map((token) => tokens[token] ?? token)
    .join(' ')
}

export function parseTestConditions(
  raw: string | null | undefined,
): ParsedTestConditions {
  if (!raw?.trim()) return { values: {}, parameters: [], note: '' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (parsed as { schema?: unknown }).schema !== STRUCTURED_CONDITIONS_SCHEMA
    ) {
      return { values: {}, parameters: [], note: raw }
    }
    const record = parsed as {
      values?: unknown
      parameters?: unknown
      note?: unknown
    }
    const values =
      record.values &&
      typeof record.values === 'object' &&
      !Array.isArray(record.values)
        ? Object.fromEntries(
            Object.entries(record.values)
              .filter(([, value]) => typeof value === 'string')
              .map(([key, value]) => [key, value as string]),
          )
        : {}
    const parameters = Array.isArray(record.parameters)
      ? record.parameters.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const parameter = item as Partial<NamedParameter>
          if (
            typeof parameter.name !== 'string' ||
            typeof parameter.value !== 'string' ||
            typeof parameter.unit !== 'string'
          ) {
            return []
          }
          return [
            {
              name: parameter.name,
              value: parameter.value,
              unit: parameter.unit,
            },
          ]
        })
      : []
    return {
      values,
      parameters,
      note: typeof record.note === 'string' ? record.note : '',
    }
  } catch {
    return { values: {}, parameters: [], note: raw }
  }
}

export function serializeTestConditions(
  values: Record<string, string>,
  parameters: NamedParameter[],
  note: string,
): string | null {
  const storedValues = Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  )
  const storedParameters = parameters
    .map((parameter) => ({
      name: parameter.name.trim(),
      value: parameter.value.trim(),
      unit: parameter.unit.trim(),
    }))
    .filter((parameter) => parameter.name && parameter.value)
  const storedNote = note.trim()
  if (Object.keys(storedValues).length === 0 && storedParameters.length === 0) {
    return storedNote || null
  }
  return JSON.stringify({
    schema: STRUCTURED_CONDITIONS_SCHEMA,
    values: storedValues,
    parameters: storedParameters,
    ...(storedNote ? { note: storedNote } : {}),
  })
}
