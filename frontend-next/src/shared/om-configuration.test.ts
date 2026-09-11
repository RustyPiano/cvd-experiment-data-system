import { describe, expect, it } from 'vitest'
import validateMeasurement from './generated/measurement-validator.mjs'
import {
  omCatalogValid,
  omEntryConditions,
  omSelectionComplete,
  omVisibleFields,
} from './om-configuration'
import type { OMCatalog } from './om-configuration'
import {
  instrumentPresetsAreValid,
  presetPowerUnitMatches,
} from './instrument-presets'

const ramanCatalog: OMCatalog = {
  lasers: [
    {
      name: 'Green',
      conditions: { laser_wavelength_nm: 532, power_setting_unit: 'percent' },
    },
  ],
  objectives: [
    {
      name: '100x',
      conditions: {
        sampling_optic: 'microscope',
        objective_magnification: 100,
        objective_na: 0.9,
        objective_immersion: 'air',
      },
    },
  ],
  spectrometers: [
    {
      name: 'CCD 1800',
      references: { lasers: 'Green' },
      conditions: {
        grating_lines_per_mm: 1800,
        detector: 'CCD',
        collection_geometry: 'reflection',
        filter_configuration: '532 edge',
        slit_width_um: 100,
      },
      adjustable: ['slit_width_um'],
    },
  ],
}

it('executes the published ordered-range rule in the generated browser validator', () => {
  const payload = {
    measurement: {
      method_profile: 'Raman',
      sample_id: 'sample',
      instrument_id: 'instrument',
      instrument_version: 1,
      measured_at: '2026-09-11T08:00:00+08:00',
      raw_file_ids: ['raw'],
      typed_conditions: {
        laser_wavelength_nm: 532,
        raman_shift_range_cm1: { start: 500, end: 100 },
      },
    },
  }
  expect(validateMeasurement(payload)).toBe(false)
  payload.measurement.typed_conditions.raman_shift_range_cm1.end = 600
  expect(validateMeasurement(payload)).toBe(true)
})

it('binds Raman optics to the laser and keeps sample information outside presets', () => {
  expect(
    presetPowerUnitMatches(
      { power_setting: '1', power_setting_unit: 'mW' },
      'percent',
    ),
  ).toBe(false)
  expect(
    presetPowerUnitMatches(
      { power_setting: '1', power_setting_unit: 'percent' },
      'percent',
    ),
  ).toBe(true)
  expect(omCatalogValid(ramanCatalog, 'Raman')).toBe(true)
  const selection = {
    lasers: 'Green',
    objectives: '100x',
    spectrometers: 'CCD 1800',
  }
  expect(omSelectionComplete(ramanCatalog, selection, true, 'Raman')).toBe(true)
  expect(
    omSelectionComplete(
      ramanCatalog,
      { ...selection, lasers: 'Red' },
      true,
      'Raman',
    ),
  ).toBe(false)
  const bad = structuredClone(ramanCatalog)
  delete bad.objectives[0].conditions.objective_na
  expect(omCatalogValid(bad, 'Raman')).toBe(false)
  const conditions = omEntryConditions(
    ramanCatalog,
    selection,
    {
      objective_na: '0.2',
      slit_width_um: '80',
      acquisition_note: 'note',
      power_setting: '1',
    },
    'Raman',
  )
  expect(conditions).toMatchObject({
    objective_na: '0.9',
    slit_width_um: '80',
    acquisition_note: 'note',
    power_setting: '1',
  })
  expect(
    omVisibleFields(ramanCatalog, selection, conditions, 'Raman'),
  ).not.toContain('objective_na')
  expect(
    instrumentPresetsAreValid('Raman', {
      presets: [{ name: 'bad', conditions: { sample_preparation: 'rinse' } }],
    }),
  ).toBe(false)
  expect(
    instrumentPresetsAreValid('Raman', {
      presets: [
        {
          name: 'good',
          conditions: {
            power_setting: '1',
            power_setting_unit: 'percent',
            integration_time_s: 10,
          },
        },
      ],
    }),
  ).toBe(true)
})

const catalog: OMCatalog = {
  objectives: [
    {
      name: '50x',
      conditions: {
        objective_magnification: 50,
        objective_na: 0.8,
        objective_immersion: 'air',
      },
    },
  ],
  cameras: [{ name: 'A', conditions: { image_color_mode: 'color' } }],
  optics: [
    {
      name: 'BF',
      conditions: {
        optical_path: 'reflection',
        contrast_method: 'bright_field',
        illumination_source: 'LED',
      },
      adjustable: ['illumination_setting'],
    },
  ],
  scales: [
    {
      name: 'A50',
      conditions: {
        image_scale_um_per_px: 0.1,
        image_scale_y_um_per_px: 0.1,
        scale_calibration: 'micrometer',
        binning: '1x1',
      },
      references: { objectives: '50x', cameras: 'A', optics: 'BF' },
    },
  ],
}
describe('OM hardware selection', () => {
  it('requires objective NA, rejects a mismatched scale and only exposes adjustable settings', () => {
    expect(omCatalogValid(catalog)).toBe(true)
    const bad = structuredClone(catalog)
    delete bad.objectives[0].conditions.objective_na
    expect(omCatalogValid(bad)).toBe(false)
    expect(
      omSelectionComplete(
        catalog,
        { objectives: '50x', cameras: 'B', optics: 'BF', scales: 'A50' },
        true,
      ),
    ).toBe(false)
    const visible = omVisibleFields(
      catalog,
      { objectives: '50x', cameras: 'A', optics: 'BF' },
      { observation_mode: 'digital', image_color_mode: 'color' },
    )
    expect(visible).toContain('illumination_setting')
    expect(visible).not.toContain('detector_gain')
    expect(visible).not.toContain('objective_na')
  })
  it('clears unmatched scale data while retaining observation context and acquisition values', () => {
    const next = omEntryConditions(
      catalog,
      { objectives: '50x', cameras: 'A', optics: 'BF' },
      {
        observation_mode: 'digital',
        acquisition_note: 'context',
        exposure_time_ms: '10',
        image_scale_um_per_px: '2',
        scale_calibration: 'old',
        detector: 'old',
      },
    )
    expect(next).toMatchObject({
      objective: '50x',
      objective_na: '0.8',
      detector: 'A',
      acquisition_note: 'context',
      exposure_time_ms: '10',
    })
    expect(next.image_scale_um_per_px).toBeUndefined()
    expect(next.scale_calibration).toBeUndefined()
  })
  it('rejects sample notes in a preset', () => {
    expect(
      instrumentPresetsAreValid('optical_microscopy', {
        presets: [{ name: 'bad', conditions: { sample_preparation: 'rinse' } }],
      }),
    ).toBe(false)
    expect(
      instrumentPresetsAreValid('optical_microscopy', {
        presets: [{ name: '10ms', conditions: { exposure_time_ms: 10 } }],
      }),
    ).toBe(true)
  })
})
