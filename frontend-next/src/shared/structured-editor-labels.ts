import type { TFunction } from 'i18next'

import type { TemperatureSensorsEditorLabels } from '@/features/entity-library/temperature-sensors-editor'
import type {
  FieldParamsEditorLabels,
  NamedParameterEditorLabels,
} from '@/features/experiments-v2/components/process-detail-editors'
import type { TreatmentStepsEditorLabels } from '@/features/experiments-v2/components/treatment-steps-editor'

function buildNamedParameterEditorLabels(
  t: TFunction,
): NamedParameterEditorLabels {
  return {
    add: t('structuredEditors.namedParameters.add'),
    item: (position) =>
      t('structuredEditors.namedParameters.item', { position }),
    name: t('structuredEditors.namedParameters.name'),
    value: t('structuredEditors.namedParameters.value'),
    unit: t('structuredEditors.namedParameters.unit'),
    remove: t('structuredEditors.namedParameters.remove'),
  }
}

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
    tilt_azimuth_deg: t('structuredFields.tiltAzimuth'),
    upright_growth_face_direction: t(
      'structuredFields.uprightGrowthFaceDirection',
    ),
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
    addSpinStage: t('structuredEditors.treatmentSteps.addSpinStage'),
    spinStage: (position) =>
      t('structuredEditors.treatmentSteps.spinStage', { position }),
    removeSpinStage: t('structuredEditors.treatmentSteps.removeSpinStage'),
    selectAtmosphere: t('structuredEditors.treatmentSteps.selectAtmosphere'),
    noAtmosphere: t('structuredEditors.treatmentSteps.noAtmosphere'),
    otherAtmosphereName: t(
      'structuredEditors.treatmentSteps.otherAtmosphereName',
    ),
    selectOption: t('structuredEditors.treatmentSteps.selectOption'),
    requiredMessage: t('validation.required'),
    invalidMessage: t('validation.finiteNumber'),
    numberGtMessage: (limit) => t('validation.numberGt', { limit }),
    atmosphereOptions: {
      air: t('structuredEditors.treatmentSteps.atmosphereOptions.air'),
      vacuum: t('structuredEditors.treatmentSteps.atmosphereOptions.vacuum'),
      other: t('structuredEditors.treatmentSteps.atmosphereOptions.other'),
    },
    options: {
      uv_ozone: t('structuredEditors.treatmentSteps.options.uv_ozone'),
      uv_only: t('structuredEditors.treatmentSteps.options.uv_only'),
      ozone_only: t('structuredEditors.treatmentSteps.options.ozone_only'),

      acetone: t('structuredEditors.treatmentSteps.options.acetone'),
      isopropanol: t('structuredEditors.treatmentSteps.options.isopropanol'),
      ethanol: t('structuredEditors.treatmentSteps.options.ethanol'),
      methanol: t('structuredEditors.treatmentSteps.options.methanol'),
      deionized_water: t(
        'structuredEditors.treatmentSteps.options.deionized_water',
      ),
      ultrasonic: t('structuredEditors.treatmentSteps.options.ultrasonic'),
      soak: t('structuredEditors.treatmentSteps.options.soak'),
      rinse: t('structuredEditors.treatmentSteps.options.rinse'),
      wipe: t('structuredEditors.treatmentSteps.options.wipe'),
      other: t('structuredEditors.treatmentSteps.options.other'),
      not_recorded: t('structuredEditors.treatmentSteps.options.not_recorded'),
    },
    types: {
      direct_load: t('structuredEditors.treatmentSteps.types.direct_load'),
      melt_solidify: t('structuredEditors.treatmentSteps.types.melt_solidify'),
      melt: t('structuredEditors.treatmentSteps.types.melt'),
      dry: t('structuredEditors.treatmentSteps.types.dry'),
      drop_cast: t('structuredEditors.treatmentSteps.types.drop_cast'),
      dip_coat: t('structuredEditors.treatmentSteps.types.dip_coat'),
      pelletize: t('structuredEditors.treatmentSteps.types.pelletize'),
      spin_coat: t('structuredEditors.treatmentSteps.types.spin_coat'),
      anneal: t('structuredEditors.treatmentSteps.types.anneal'),
      grind: t('structuredEditors.treatmentSteps.types.grind'),
      other: t('structuredEditors.treatmentSteps.types.other'),
      solvent_cleaning: t(
        'structuredEditors.treatmentSteps.types.solvent_cleaning',
      ),
      nitrogen_dry: t('structuredEditors.treatmentSteps.types.nitrogen_dry'),
      plasma_treatment: t(
        'structuredEditors.treatmentSteps.types.plasma_treatment',
      ),
      uv_ozone_treatment: t(
        'structuredEditors.treatmentSteps.types.uv_ozone_treatment',
      ),
    },
    fields: {
      mode: t('structuredEditors.treatmentSteps.fields.mode'),
      equipment_name: t(
        'structuredEditors.treatmentSteps.fields.equipment_name',
      ),
      wiping_material: t(
        'structuredEditors.treatmentSteps.fields.wiping_material',
      ),
      ultrasonic_frequency_kHz: t(
        'structuredEditors.treatmentSteps.fields.ultrasonic_frequency_kHz',
      ),
      ultrasonic_power_W: t(
        'structuredEditors.treatmentSteps.fields.ultrasonic_power_W',
      ),
      source_distance_mm: t(
        'structuredEditors.treatmentSteps.fields.source_distance_mm',
      ),
      wavelength_nm: t('structuredEditors.treatmentSteps.fields.wavelength_nm'),
      irradiance_mW_cm2: t(
        'structuredEditors.treatmentSteps.fields.irradiance_mW_cm2',
      ),
      ozone_concentration_ppm: t(
        'structuredEditors.treatmentSteps.fields.ozone_concentration_ppm',
      ),
      gas_flow_sccm: t('structuredEditors.treatmentSteps.fields.gas_flow_sccm'),
      solution_volume_uL: t(
        'structuredEditors.treatmentSteps.fields.solution_volume_uL',
      ),
      bath_volume_mL: t(
        'structuredEditors.treatmentSteps.fields.bath_volume_mL',
      ),

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
      solvent: t('structuredEditors.treatmentSteps.fields.solvent'),
      solvent_other: t('structuredEditors.treatmentSteps.fields.solvent_other'),
      cleaning_method: t(
        'structuredEditors.treatmentSteps.fields.cleaning_method',
      ),
      cleaning_method_other: t(
        'structuredEditors.treatmentSteps.fields.cleaning_method_other',
      ),
    },
  }
}

export function buildFieldParamsEditorLabels(
  t: TFunction,
  otherFieldName?: string,
): FieldParamsEditorLabels {
  return {
    addField: t('structuredEditors.fieldParams.addField'),
    field: (position) => t('structuredEditors.fieldParams.field', { position }),
    fieldType: t('structuredEditors.fieldParams.fieldType'),
    selectFieldType: t('structuredEditors.fieldParams.selectFieldType'),
    fieldTypes: {
      plasma: t('structuredEditors.fieldParams.fieldTypes.plasma'),
      light: t('structuredEditors.fieldParams.fieldTypes.light'),
      electric_field: t(
        'structuredEditors.fieldParams.fieldTypes.electric_field',
      ),
      other: otherFieldName
        ? `${t('structuredEditors.fieldParams.fieldTypes.other')}（${otherFieldName}）`
        : t('structuredEditors.fieldParams.fieldTypes.other'),
    },
    startMinutes: t('structuredEditors.fieldParams.startMinutes'),
    endMinutes: t('structuredEditors.fieldParams.endMinutes'),
    removeField: t('structuredEditors.fieldParams.removeField'),
    parameterGroups: {
      plasma: t('structuredEditors.fieldParams.parameterGroups.plasma'),
      light: t('structuredEditors.fieldParams.parameterGroups.light'),
      electric_field: t(
        'structuredEditors.fieldParams.parameterGroups.electric_field',
      ),
      other: t('structuredEditors.fieldParams.parameterGroups.other'),
    },
    explicitParameters: {
      plasmaPowerW: t(
        'structuredEditors.fieldParams.explicitParameters.plasmaPowerW',
      ),
      plasmaGasSpecies: t(
        'structuredEditors.fieldParams.explicitParameters.plasmaGasSpecies',
      ),
      plasmaPressurePa: t(
        'structuredEditors.fieldParams.explicitParameters.plasmaPressurePa',
      ),
      lightWavelengthNm: t(
        'structuredEditors.fieldParams.explicitParameters.lightWavelengthNm',
      ),
      lightPowerMw: t(
        'structuredEditors.fieldParams.explicitParameters.lightPowerMw',
      ),
      lightIrradianceMwCm2: t(
        'structuredEditors.fieldParams.explicitParameters.lightIrradianceMwCm2',
      ),
      lightSourceDistanceMm: t(
        'structuredEditors.fieldParams.explicitParameters.lightSourceDistanceMm',
      ),
      electricVoltageV: t(
        'structuredEditors.fieldParams.explicitParameters.electricVoltageV',
      ),
      electricFieldStrengthVCm: t(
        'structuredEditors.fieldParams.explicitParameters.electricFieldStrengthVCm',
      ),
      electricElectrodeGapMm: t(
        'structuredEditors.fieldParams.explicitParameters.electricElectrodeGapMm',
      ),
      electricDirection: t(
        'structuredEditors.fieldParams.explicitParameters.electricDirection',
      ),
    },
    magnitudeHints: {
      light: t('structuredEditors.fieldParams.magnitudeHints.light'),
      electric_field: t(
        'structuredEditors.fieldParams.magnitudeHints.electric_field',
      ),
    },
    otherParameters: t('structuredEditors.fieldParams.otherParameters'),
    parameters: buildNamedParameterEditorLabels(t),
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
    requiredMessage: t('validation.required'),
  }
}
