import type { TFunction } from 'i18next'

import type { TemperatureSensorsEditorLabels } from '@/features/entity-library/temperature-sensors-editor'
import type { TreatmentStepsEditorLabels } from '@/features/experiments-v2/components/treatment-steps-editor'

export function buildStructuredValueLabels(
  t: TFunction,
): Record<string, string> {
  return {
    material: t('structuredFields.material'),
    material_other: t('structuredFields.otherMaterialName'),
    shape: t('structuredFields.shape'),
    shape_other: t('structuredFields.otherShape'),
    length_mm: t('structuredFields.length'),
    width_mm: t('structuredFields.width'),
    height_mm: t('structuredFields.height'),
    diameter_mm: t('structuredFields.diameter'),
    outer_diameter_mm: t('structuredFields.outerDiameter'),
    outer_side_mm: t('structuredFields.outerSide'),
    outer_width_mm: t('structuredFields.outerWidth'),
    outer_height_mm: t('structuredFields.outerHeight'),
    dimension_description: t('structuredFields.dimensionDescription'),
    wall_thickness_mm: t('structuredFields.wallThickness'),
    thickness_mm: t('structuredFields.thickness'),
    placement: t('structuredFields.placement'),
    tilt_angle_deg: t('structuredFields.tiltAngle'),
    placement_other: t('structuredFields.otherPlacementName'),
    metric: t('structuredFields.roughnessMetric'),
    value_nm: t('structuredFields.roughnessValue'),
    availability: t('structuredFields.roughnessAvailability'),
    zone_index: t('structuredFields.zoneIndex'),
    temperature_C: t('structuredFields.temperature'),
    temperature_basis: t('structuredFields.temperatureBasis'),
    distance_mm: t('structuredFields.distance'),
    reset_count: t('structuredFields.resetCount'),
    use_number_since_reset: t('structuredFields.useNumberSinceReset'),
    sensor_type: t('structuredEditors.temperatureSensors.sensorType'),
    sensor_type_other: t(
      'structuredEditors.temperatureSensors.otherSensorType',
    ),
    nominal_accuracy_C: t(
      'structuredEditors.temperatureSensors.nominalAccuracyCelsius',
    ),
  }
}

export function buildTreatmentStepsEditorLabels(
  t: TFunction,
): TreatmentStepsEditorLabels {
  return {
    addStep: t('structuredEditors.treatmentSteps.addStep'),
    step: (position) =>
      t('structuredEditors.treatmentSteps.step', { position }),
    type: t('structuredEditors.treatmentSteps.type'),
    selectType: t('structuredEditors.treatmentSteps.selectType'),
    moveUp: t('structuredEditors.treatmentSteps.moveUp'),
    moveDown: t('structuredEditors.treatmentSteps.moveDown'),
    removeStep: t('structuredEditors.treatmentSteps.removeStep'),
    otherName: t('structuredEditors.treatmentSteps.otherName'),
    addParameter: t('structuredEditors.treatmentSteps.addParameter'),
    parameter: (position) =>
      t('structuredEditors.treatmentSteps.parameter', { position }),
    parameterName: t('structuredEditors.treatmentSteps.parameterName'),
    parameterValue: t('structuredEditors.treatmentSteps.parameterValue'),
    parameterUnit: t('structuredEditors.treatmentSteps.parameterUnit'),
    removeParameter: t('structuredEditors.treatmentSteps.removeParameter'),
    types: {
      direct_load: t('structuredEditors.treatmentSteps.types.direct_load'),
      melt_solidify: t('structuredEditors.treatmentSteps.types.melt_solidify'),
      pelletize: t('structuredEditors.treatmentSteps.types.pelletize'),
      spin_coat: t('structuredEditors.treatmentSteps.types.spin_coat'),
      anneal: t('structuredEditors.treatmentSteps.types.anneal'),
      grind: t('structuredEditors.treatmentSteps.types.grind'),
      other: t('structuredEditors.treatmentSteps.types.other'),
      acetone_clean: t('structuredEditors.treatmentSteps.types.acetone_clean'),
      isopropanol_clean: t(
        'structuredEditors.treatmentSteps.types.isopropanol_clean',
      ),
      nitrogen_dry: t('structuredEditors.treatmentSteps.types.nitrogen_dry'),
      plasma_treatment: t(
        'structuredEditors.treatmentSteps.types.plasma_treatment',
      ),
      hydrophilic_treatment: t(
        'structuredEditors.treatmentSteps.types.hydrophilic_treatment',
      ),
    },
    fields: {
      temperature_C: t('structuredEditors.treatmentSteps.fields.temperature_C'),
      duration_min: t('structuredEditors.treatmentSteps.fields.duration_min'),
      duration_s: t('structuredEditors.treatmentSteps.fields.duration_s'),
      speed_rpm: t('structuredEditors.treatmentSteps.fields.speed_rpm'),
      atmosphere: t('structuredEditors.treatmentSteps.fields.atmosphere'),
      power_W: t('structuredEditors.treatmentSteps.fields.power_W'),
      gas_species: t('structuredEditors.treatmentSteps.fields.gas_species'),
      pressure_Pa: t('structuredEditors.treatmentSteps.fields.pressure_Pa'),
      pressure_MPa: t('structuredEditors.treatmentSteps.fields.pressure_MPa'),
      die_diameter_mm: t(
        'structuredEditors.treatmentSteps.fields.die_diameter_mm',
      ),
      method: t('structuredEditors.treatmentSteps.fields.method'),
    },
  }
}

export function buildTemperatureSensorsEditorLabels(
  t: TFunction,
): TemperatureSensorsEditorLabels {
  return {
    sensor: (position) =>
      t('structuredEditors.temperatureSensors.sensor', { position }),
    sensorType: t('structuredEditors.temperatureSensors.sensorType'),
    sensorTypeOptions: {
      thermocouple: t(
        'structuredEditors.temperatureSensors.sensorTypeOptions.thermocouple',
      ),
      rtd: t('structuredEditors.temperatureSensors.sensorTypeOptions.rtd'),
      infraredThermometer: t(
        'structuredEditors.temperatureSensors.sensorTypeOptions.infraredThermometer',
      ),
      fiberOpticTemperatureSensor: t(
        'structuredEditors.temperatureSensors.sensorTypeOptions.fiberOpticTemperatureSensor',
      ),
      thermistor: t(
        'structuredEditors.temperatureSensors.sensorTypeOptions.thermistor',
      ),
    },
    selectSensorType: t(
      'structuredEditors.temperatureSensors.selectSensorType',
    ),
    otherSensorType: t('structuredEditors.temperatureSensors.otherSensorType'),
    otherSensorTypePlaceholder: t(
      'structuredEditors.temperatureSensors.otherSensorTypePlaceholder',
    ),
    nominalAccuracyCelsius: t(
      'structuredEditors.temperatureSensors.nominalAccuracyCelsius',
    ),
    selectZoneCountFirst: t(
      'structuredEditors.temperatureSensors.selectZoneCountFirst',
    ),
  }
}
