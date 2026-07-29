import { describe, expect, it } from 'vitest'

import i18n from '@/shared/i18n'
import {
  buildTemperatureSensorsEditorLabels,
  buildTreatmentStepsEditorLabels,
} from './structured-editor-labels'

describe('structured editor label factories', () => {
  it.each([
    {
      language: 'zh',
      treatmentStep: '处理步骤 2',
      spinCoat: '旋涂',
      sensor: '温区 2',
    },
    {
      language: 'en',
      treatmentStep: 'Treatment step 2',
      spinCoat: 'Spin coat',
      sensor: 'Zone 2',
    },
  ])(
    'maps every editor through the $language resource',
    ({ language, treatmentStep, spinCoat, sensor }) => {
      const t = i18n.getFixedT(language)
      const treatment = buildTreatmentStepsEditorLabels(t)
      const sensors = buildTemperatureSensorsEditorLabels(t)

      expect(treatment.step(2)).toBe(treatmentStep)
      expect(treatment.types.spin_coat).toBe(spinCoat)
      expect(Object.keys(treatment.types)).toHaveLength(12)
      expect(Object.keys(treatment.fields)).toHaveLength(11)
      expect(sensors.sensor(2)).toBe(sensor)
    },
  )
})
