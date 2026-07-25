import { describe, expect, it } from 'vitest'

import i18n from '@/shared/i18n'
import {
  buildGasFeedsEditorLabels,
  buildTemperatureProgramEditorLabels,
  buildTemperatureSensorsEditorLabels,
  buildTreatmentStepsEditorLabels,
} from './structured-editor-labels'

describe('structured editor label factories', () => {
  it.each([
    {
      language: 'zh',
      treatmentStep: '处理步骤 2',
      spinCoat: '旋涂',
      zone: '温区 2',
      gas: '气体供气 2',
      argon: '氩气（Ar）',
      sensor: '温度传感器 2',
      calibration: '校准',
    },
    {
      language: 'en',
      treatmentStep: 'Treatment step 2',
      spinCoat: 'Spin coat',
      zone: 'Temperature zone 2',
      gas: 'Gas feed 2',
      argon: 'Argon (Ar)',
      sensor: 'Temperature sensor 2',
      calibration: 'Calibration',
    },
  ])(
    'maps every editor through the $language resource',
    ({
      language,
      treatmentStep,
      spinCoat,
      zone,
      gas,
      argon,
      sensor,
      calibration,
    }) => {
      const t = i18n.getFixedT(language)
      const treatment = buildTreatmentStepsEditorLabels(t)
      const temperature = buildTemperatureProgramEditorLabels(t)
      const gasFeeds = buildGasFeedsEditorLabels(t)
      const sensors = buildTemperatureSensorsEditorLabels(t)

      expect(treatment.step(2)).toBe(treatmentStep)
      expect(treatment.types.spin_coat).toBe(spinCoat)
      expect(Object.keys(treatment.types)).toHaveLength(12)
      expect(Object.keys(treatment.fields)).toHaveLength(9)
      expect(temperature.zone(2)).toBe(zone)
      expect(gasFeeds.feed(2)).toBe(gas)
      expect(gasFeeds.speciesOptions.Ar).toBe(argon)
      expect(Object.keys(gasFeeds.speciesOptions)).toHaveLength(6)
      expect(sensors.sensor(2)).toBe(sensor)
      expect(sensors.uncertaintySourceOptions.calibration).toBe(calibration)
      expect(Object.keys(sensors.uncertaintySourceOptions)).toHaveLength(4)
    },
  )
})
