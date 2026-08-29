import type { TFunction } from 'i18next'

import type { TemperatureSensorsEditorLabels } from '@/features/entity-library/temperature-sensors-editor'
import type { GasFeedsEditorLabels } from '@/features/experiments-v2/components/gas-feeds-editor'
import type {
  CoolingParamsEditorLabels,
  DurationCyclesEditorLabels,
  FieldParamsEditorLabels,
  MeasuredTemperatureEditorLabels,
  NamedParameterEditorLabels,
  PreparationOperationsEditorLabels,
} from '@/features/experiments-v2/components/process-detail-editors'
import type { TemperatureProgramEditorLabels } from '@/features/experiments-v2/components/temperature-program-editor'
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
    requiredMessage: t('validation.required'),
    invalidMessage: t('validation.structuredField'),
    atmosphereOptions: {
      air: t('structuredEditors.treatmentSteps.atmosphereOptions.air'),
      vacuum: t('structuredEditors.treatmentSteps.atmosphereOptions.vacuum'),
      other: t('structuredEditors.treatmentSteps.atmosphereOptions.other'),
    },
    types: {
      direct_load: t('structuredEditors.treatmentSteps.types.direct_load'),
      melt_solidify: t('structuredEditors.treatmentSteps.types.melt_solidify'),
      mix: t('structuredEditors.treatmentSteps.types.mix'),
      pelletize: t('structuredEditors.treatmentSteps.types.pelletize'),
      spin_coat: t('structuredEditors.treatmentSteps.types.spin_coat'),
      anneal: t('structuredEditors.treatmentSteps.types.anneal'),
      pre_anneal: t('structuredEditors.treatmentSteps.types.pre_anneal'),
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

export function buildTemperatureProgramEditorLabels(
  t: TFunction,
): TemperatureProgramEditorLabels {
  return {
    zone: (position) =>
      t('structuredEditors.temperatureProgram.zone', { position }),
    addPoint: t('structuredEditors.temperatureProgram.addPoint'),
    point: (position) =>
      t('structuredEditors.temperatureProgram.point', { position }),
    elapsedMinutes: t('structuredEditors.temperatureProgram.elapsedMinutes'),
    setpointCelsius: t('structuredEditors.temperatureProgram.setpointCelsius'),
    removePoint: t('structuredEditors.temperatureProgram.removePoint'),
    moveUp: t('structuredEditors.temperatureProgram.moveUp'),
    moveDown: t('structuredEditors.temperatureProgram.moveDown'),
    selectSetupFirst: t(
      'structuredEditors.temperatureProgram.selectSetupFirst',
    ),
  }
}

export function buildGasFeedsEditorLabels(t: TFunction): GasFeedsEditorLabels {
  return {
    addFeed: t('structuredEditors.gasFeeds.addFeed'),
    feed: (position) => t('structuredEditors.gasFeeds.feed', { position }),
    species: t('structuredEditors.gasFeeds.species'),
    selectSpecies: t('structuredEditors.gasFeeds.selectSpecies'),
    speciesOptions: {
      Ar: t('structuredEditors.gasFeeds.speciesOptions.Ar'),
      N2: t('structuredEditors.gasFeeds.speciesOptions.N2'),
      H2: t('structuredEditors.gasFeeds.speciesOptions.H2'),
      O2: t('structuredEditors.gasFeeds.speciesOptions.O2'),
      He: t('structuredEditors.gasFeeds.speciesOptions.He'),
      CH4: t('structuredEditors.gasFeeds.speciesOptions.CH4'),
      H2S: t('structuredEditors.gasFeeds.speciesOptions.H2S'),
      NH3: t('structuredEditors.gasFeeds.speciesOptions.NH3'),
      CO2: t('structuredEditors.gasFeeds.speciesOptions.CO2'),
      other: t('structuredEditors.gasFeeds.speciesOptions.other'),
    },
    otherGasName: t('structuredEditors.gasFeeds.otherGasName'),
    lotReference: t('structuredEditors.gasFeeds.lotReference'),
    purity: t('structuredEditors.gasFeeds.purity'),
    measurementSource: t('structuredEditors.gasFeeds.measurementSource'),
    selectMeasurementSource: t(
      'structuredEditors.gasFeeds.selectMeasurementSource',
    ),
    measurementSourceOptions: {
      mfc: t('structuredEditors.gasFeeds.measurementSourceOptions.mfc'),
      rotameter: t(
        'structuredEditors.gasFeeds.measurementSourceOptions.rotameter',
      ),
      other: t('structuredEditors.gasFeeds.measurementSourceOptions.other'),
    },
    otherMeasurementSource: t(
      'structuredEditors.gasFeeds.otherMeasurementSource',
    ),
    addInterval: t('structuredEditors.gasFeeds.addInterval'),
    interval: (position) =>
      t('structuredEditors.gasFeeds.interval', { position }),
    startMinutes: t('structuredEditors.gasFeeds.startMinutes'),
    endMinutes: t('structuredEditors.gasFeeds.endMinutes'),
    flowSccm: t('structuredEditors.gasFeeds.flowSccm'),
    removeFeed: t('structuredEditors.gasFeeds.removeFeed'),
    removeInterval: t('structuredEditors.gasFeeds.removeInterval'),
    moveUp: t('structuredEditors.gasFeeds.moveUp'),
    moveDown: t('structuredEditors.gasFeeds.moveDown'),
    flowShareTitle: t('structuredEditors.gasFeeds.flowShareTitle'),
    flowShareDescription: t('structuredEditors.gasFeeds.flowShareDescription'),
    flowShareInterval: t('structuredEditors.gasFeeds.flowShareInterval'),
    flowShareComposition: t('structuredEditors.gasFeeds.flowShareComposition'),
  }
}

export function buildPreparationOperationsEditorLabels(
  t: TFunction,
): PreparationOperationsEditorLabels {
  return {
    addOperation: t('structuredEditors.preparationOperations.addOperation'),
    operation: (position) =>
      t('structuredEditors.preparationOperations.operation', { position }),
    operationType: t('structuredEditors.preparationOperations.operationType'),
    selectOperationType: t(
      'structuredEditors.preparationOperations.selectOperationType',
    ),
    operationTypes: {
      pump_down: t(
        'structuredEditors.preparationOperations.operationTypes.pump_down',
      ),
      gas_exchange: t(
        'structuredEditors.preparationOperations.operationTypes.gas_exchange',
      ),
      other: t('structuredEditors.preparationOperations.operationTypes.other'),
    },
    moveUp: t('structuredEditors.preparationOperations.moveUp'),
    moveDown: t('structuredEditors.preparationOperations.moveDown'),
    removeOperation: t(
      'structuredEditors.preparationOperations.removeOperation',
    ),
    targetAbsolutePressurePa: t(
      'structuredEditors.preparationOperations.targetAbsolutePressurePa',
    ),
    durationMinutes: t(
      'structuredEditors.preparationOperations.durationMinutes',
    ),
    cycleCount: t('structuredEditors.preparationOperations.cycleCount'),
    addGas: t('structuredEditors.preparationOperations.addGas'),
    gas: (position) =>
      t('structuredEditors.preparationOperations.gas', { position }),
    species: t('structuredEditors.preparationOperations.species'),
    selectSpecies: t('structuredEditors.preparationOperations.selectSpecies'),
    speciesOptions: {
      Ar: t('structuredEditors.gasFeeds.speciesOptions.Ar'),
      N2: t('structuredEditors.gasFeeds.speciesOptions.N2'),
      H2: t('structuredEditors.gasFeeds.speciesOptions.H2'),
      O2: t('structuredEditors.gasFeeds.speciesOptions.O2'),
      CH4: t('structuredEditors.gasFeeds.speciesOptions.CH4'),
      other: t('structuredEditors.gasFeeds.speciesOptions.other'),
    },
    otherGasName: t('structuredEditors.preparationOperations.otherGasName'),
    gasCylinderLot: t('structuredEditors.preparationOperations.gasCylinderLot'),
    purity: t('structuredEditors.gasFeeds.purity'),
    flowSccm: t('structuredEditors.preparationOperations.flowSccm'),
    removeGas: t('structuredEditors.preparationOperations.removeGas'),
    otherOperationName: t(
      'structuredEditors.preparationOperations.otherOperationName',
    ),
    parameters: buildNamedParameterEditorLabels(t),
  }
}

export function buildDurationCyclesEditorLabels(
  t: TFunction,
): DurationCyclesEditorLabels {
  return {
    durationMinutes: t('structuredEditors.durationCycles.durationMinutes'),
  }
}

export function buildCoolingParamsEditorLabels(
  t: TFunction,
): CoolingParamsEditorLabels {
  return {
    method: t('structuredEditors.coolingParams.method'),
    selectMethod: t('structuredEditors.coolingParams.selectMethod'),
    methods: {
      furnace_cooling: t(
        'structuredEditors.coolingParams.methods.furnace_cooling',
      ),
      open_lid_cooling: t(
        'structuredEditors.coolingParams.methods.open_lid_cooling',
      ),
      rapid_furnace_move_cooling: t(
        'structuredEditors.coolingParams.methods.rapid_furnace_move_cooling',
      ),
      controlled_cooling: t(
        'structuredEditors.coolingParams.methods.controlled_cooling',
      ),
      other: t('structuredEditors.coolingParams.methods.other'),
    },
    lidOpenTemperatureC: t(
      'structuredEditors.coolingParams.lidOpenTemperatureC',
    ),
    coolingRateCPerMin: t('structuredEditors.coolingParams.coolingRateCPerMin'),
    otherMethod: t('structuredEditors.coolingParams.otherMethod'),
    clear: t('structuredEditors.coolingParams.clear'),
  }
}

export function buildFieldParamsEditorLabels(
  t: TFunction,
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
    otherParameters: t('structuredEditors.fieldParams.otherParameters'),
    parameters: buildNamedParameterEditorLabels(t),
  }
}

export function buildMeasuredTemperatureEditorLabels(
  t: TFunction,
): MeasuredTemperatureEditorLabels {
  return {
    files: t('structuredEditors.measuredTemperature.files'),
    file: t('structuredEditors.measuredTemperature.file'),
    selectFile: t('structuredEditors.measuredTemperature.selectFile'),
    clearFile: t('structuredEditors.measuredTemperature.clearFile'),
    timeColumn: t('structuredEditors.measuredTemperature.timeColumn'),
    addChannel: t('structuredEditors.measuredTemperature.addChannel'),
    channel: (position) =>
      t('structuredEditors.measuredTemperature.channel', { position }),
    zoneIndex: t('structuredEditors.measuredTemperature.zoneIndex'),
    columnName: t('structuredEditors.measuredTemperature.columnName'),
    removeChannel: t('structuredEditors.measuredTemperature.removeChannel'),
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
