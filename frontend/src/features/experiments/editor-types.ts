import type {
  ExperimentModulePayloadRead,
  QualityLabel,
  ExperimentRead,
  ExperimentUpdateRequest,
} from "../../shared/types/api";

export const editorSectionKeys = [
  "basic_info",
  "environment",
  "precheck",
  "precursors",
  "substrates",
  "furnace_program",
  "gas_program",
  "process_observation",
  "characterization",
  "result_summary",
] as const;

export type EditorSectionKey = (typeof editorSectionKeys)[number];

export type SaveStateStatus = "idle" | "saving" | "saved" | "error";

export type SectionSaveState = {
  status: SaveStateStatus;
  message: string | null;
};

export type BasicInfoValues = {
  experimentType: string;
  materialSystem: string;
  experimentDate: string;
  objective: string;
};

export type PrecheckValues = {
  sealIntact: boolean;
  riskNote: string;
  hoodClean: NullableBooleanValue;
  flangeBlocked: NullableBooleanValue;
  boatContaminationLevel: string;
  tubeContaminationLevel: string;
};

export type EnvironmentValues = {
  indoorTemperatureC: string;
  indoorHumidityPercent: string;
  sampleEnv: string;
  abnormalNote: string;
};

type PayloadBackedValue = {
  sourcePayload?: Record<string, unknown>;
};

export type NullableBooleanValue = "" | "true" | "false";

export type PrecursorItemValues = PayloadBackedValue & {
  role: string;
  type: string;
  brand: string;
  concentration: string;
  concentrationUnit: string;
  method: string;
  meltingTemperatureC: string;
  spinSpeedRpm: string;
  preSpinSpeedRpm: string;
  preparationTimeMin: string;
  massMg: string;
  batchNo: string;
};

export type PrecursorsValues = {
  items: PrecursorItemValues[];
};

export type SubstrateItemValues = PayloadBackedValue & {
  role: string;
  type: string;
  brand: string;
  sizeMm: string;
  treatmentMethod: string;
  positionMm: string;
  treatmentTemperatureC: string;
  treatmentDurationMin: string;
  treatmentPowerW: string;
  treatmentGas: string;
};

export type SubstratesValues = {
  items: SubstrateItemValues[];
};

export type FurnacePointValues = PayloadBackedValue & {
  timeMin: string;
  temperatureC: string;
};

export type FurnaceZoneValues = PayloadBackedValue & {
  zoneIndex: string;
  precursorPlaced: boolean;
  note: string;
  temperatureProgram: FurnacePointValues[];
};

export type FurnaceProgramValues = {
  zones: FurnaceZoneValues[];
};

export type GasSegmentValues = PayloadBackedValue & {
  stage: string;
  gas: string;
  startMin: string;
  endMin: string;
  flowSccm: string;
  note: string;
  components: GasComponentValues[];
};

export type GasProgramValues = {
  preWashingGas: string;
  segments: GasSegmentValues[];
};

export type GasComponentValues = PayloadBackedValue & {
  gas: string;
  ratioPercent: string;
};

export type ProcessObservationValues = {
  colorChange: string;
  abnormalEvents: string[];
  note: string;
};

export type CharacterizationMethodValues = PayloadBackedValue & {
  method: string;
  result: string;
  enabled: boolean;
  excitationNm: string;
  note: string;
};

export type CharacterizationValues = {
  methods: CharacterizationMethodValues[];
};

export type ResultSummaryValues = {
  summaryResult: string;
  qualityLabel: QualityLabel;
  nextStep: string;
};

export type ExperimentEditorValues = {
  basicInfo: BasicInfoValues;
  environment: EnvironmentValues;
  precheck: PrecheckValues;
  precursors: PrecursorsValues;
  substrates: SubstratesValues;
  furnaceProgram: FurnaceProgramValues;
  gasProgram: GasProgramValues;
  processObservation: ProcessObservationValues;
  characterization: CharacterizationValues;
  resultSummary: ResultSummaryValues;
};

export type ModulePayloadMap = Partial<Record<EditorSectionKey, Record<string, unknown>>>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => String(item));
}

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function asBoolean(value: unknown) {
  return value === true;
}

function asBooleanWithDefault(value: unknown, defaultValue: boolean) {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  return defaultValue;
}

function asNullableBooleanValue(value: unknown): NullableBooleanValue {
  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  return "";
}

function removeNullEntries(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== undefined),
  );
}

function omitKeys(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}

function hasSourcePayload(value: Record<string, unknown> | undefined) {
  return Boolean(value && Object.keys(value).length > 0);
}

function mergePayloadFields(
  existingPayload: Record<string, unknown> | undefined,
  nextPayload: Record<string, unknown>,
  keys: string[],
) {
  return {
    ...omitKeys(asRecord(existingPayload), keys),
    ...nextPayload,
  };
}

function normalizeNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNumberLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isNaN(numericValue) ? trimmed : numericValue;
}

function normalizeNullableBoolean(value: NullableBooleanValue) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
}

function hasAnyValue(record: Record<string, string>) {
  return Object.values(record).some((value) => value.trim().length > 0);
}

export function createEmptyPrecursorItem(): PrecursorItemValues {
  return {
    role: "",
    type: "",
    brand: "",
    concentration: "",
    concentrationUnit: "",
    method: "",
    meltingTemperatureC: "",
    spinSpeedRpm: "",
    preSpinSpeedRpm: "",
    preparationTimeMin: "",
    massMg: "",
    batchNo: "",
  };
}

export function createEmptySubstrateItem(): SubstrateItemValues {
  return {
    role: "",
    type: "",
    brand: "",
    sizeMm: "",
    treatmentMethod: "",
    positionMm: "",
    treatmentTemperatureC: "",
    treatmentDurationMin: "",
    treatmentPowerW: "",
    treatmentGas: "",
  };
}

export function createEmptyFurnacePoint(): FurnacePointValues {
  return {
    timeMin: "",
    temperatureC: "",
  };
}

export function createEmptyFurnaceZone(): FurnaceZoneValues {
  return {
    zoneIndex: "",
    precursorPlaced: false,
    note: "",
    temperatureProgram: [createEmptyFurnacePoint()],
  };
}

export function createEmptyGasSegment(): GasSegmentValues {
  return {
    stage: "",
    gas: "",
    startMin: "",
    endMin: "",
    flowSccm: "",
    note: "",
    components: [createEmptyGasComponent()],
  };
}

export function createEmptyGasComponent(): GasComponentValues {
  return {
    gas: "",
    ratioPercent: "",
  };
}

export function createEmptyObservationEvent() {
  return "";
}

export function createEmptyCharacterizationMethod(): CharacterizationMethodValues {
  return {
    method: "",
    result: "",
    enabled: true,
    excitationNm: "",
    note: "",
  };
}

export function createInitialSectionStates(): Record<EditorSectionKey, SectionSaveState> {
  return {
    basic_info: { status: "idle", message: null },
    environment: { status: "idle", message: null },
    precheck: { status: "idle", message: null },
    precursors: { status: "idle", message: null },
    substrates: { status: "idle", message: null },
    furnace_program: { status: "idle", message: null },
    gas_program: { status: "idle", message: null },
    process_observation: { status: "idle", message: null },
    characterization: { status: "idle", message: null },
    result_summary: { status: "idle", message: null },
  };
}

export function createModulePayloadMap(items: ExperimentModulePayloadRead[]): ModulePayloadMap {
  return items.reduce<ModulePayloadMap>((result, item) => {
    if (!editorSectionKeys.includes(item.module_key as EditorSectionKey)) {
      return result;
    }

    result[item.module_key as EditorSectionKey] = asRecord(item.payload_json);
    return result;
  }, {});
}

export function createInitialEditorValues(
  experiment: ExperimentRead,
  items: ExperimentModulePayloadRead[],
): ExperimentEditorValues {
  const payloads = createModulePayloadMap(items);
  const basicInfo = asRecord(payloads.basic_info);
  const environment = asRecord(payloads.environment);
  const precheck = asRecord(payloads.precheck);
  const precursors = asRecord(payloads.precursors);
  const substrates = asRecord(payloads.substrates);
  const furnaceProgram = asRecord(payloads.furnace_program);
  const gasProgram = asRecord(payloads.gas_program);
  const processObservation = asRecord(payloads.process_observation);
  const characterization = asRecord(payloads.characterization);
  const resultSummary = asRecord(payloads.result_summary);

  return {
    basicInfo: {
      experimentType:
        asString(basicInfo.experiment_type) || asString(experiment.experiment_type),
      materialSystem: asString(experiment.material_system),
      experimentDate: asString(experiment.experiment_date),
      objective: asString(experiment.objective),
    },
    environment: {
      indoorTemperatureC: asString(environment.indoor_temperature_C),
      indoorHumidityPercent: asString(environment.indoor_humidity_percent),
      sampleEnv: asString(environment.sample_env),
      abnormalNote: asString(environment.abnormal_note),
    },
    precheck: {
      sealIntact: asBoolean(precheck.seal_intact),
      riskNote: asString(precheck.risk_note),
      hoodClean: asNullableBooleanValue(precheck.hood_clean),
      flangeBlocked: asNullableBooleanValue(precheck.flange_blocked),
      boatContaminationLevel: asString(precheck.boat_contamination_level),
      tubeContaminationLevel: asString(precheck.tube_contamination_level),
    },
    precursors: {
      items: asObjectArray(precursors.items).map((item) => ({
        sourcePayload: item,
        role: asString(item.role),
        type: asString(item.type),
        brand: asString(item.brand),
        concentration: asString(item.concentration),
        concentrationUnit: asString(item.concentration_unit),
        method: asString(item.method),
        meltingTemperatureC: asString(item.melting_temperature_C),
        spinSpeedRpm: asString(item.spin_speed_rpm),
        preSpinSpeedRpm: asString(item.pre_spin_speed_rpm),
        preparationTimeMin: asString(item.preparation_time_min),
        massMg: asString(item.mass_mg),
        batchNo: asString(item.batch_no),
      })),
    },
    substrates: {
      items: asObjectArray(substrates.items).map((item) => ({
        sourcePayload: item,
        role: asString(item.role),
        type: asString(item.type),
        brand: asString(item.brand),
        sizeMm: asString(item.size_mm),
        treatmentMethod: asString(item.treatment_method),
        positionMm: asString(item.position_mm),
        treatmentTemperatureC: asString(asRecord(item.treatment_params).temperature_C),
        treatmentDurationMin: asString(asRecord(item.treatment_params).duration_min),
        treatmentPowerW: asString(asRecord(item.treatment_params).power_W),
        treatmentGas: asString(asRecord(item.treatment_params).gas),
      })),
    },
    furnaceProgram: {
      zones: asObjectArray(furnaceProgram.zones).map((zone) => ({
        sourcePayload: zone,
        zoneIndex: asString(zone.zone_index),
        precursorPlaced: asBoolean(zone.precursor_placed),
        note: asString(zone.note),
        temperatureProgram: asObjectArray(zone.temperature_program).map((point) => ({
          sourcePayload: point,
          timeMin: asString(point.time_min),
          temperatureC: asString(point.temperature_C),
        })),
      })),
    },
    gasProgram: {
      preWashingGas: asString(gasProgram.pre_washing_gas),
      segments: asObjectArray(gasProgram.segments).map((segment) => ({
        sourcePayload: segment,
        stage: asString(segment.stage),
        gas: asString(segment.gas),
        startMin: asString(segment.start_min),
        endMin: asString(segment.end_min),
        flowSccm: asString(segment.flow_sccm),
        note: asString(segment.note),
        components: asObjectArray(segment.components).map((component) => ({
          sourcePayload: component,
          gas: asString(component.name) || asString(component.gas),
          ratioPercent: asString(component.fraction) || asString(component.ratio_percent),
        })),
      })),
    },
    processObservation: {
      colorChange: asString(processObservation.color_change),
      abnormalEvents: asStringArray(processObservation.abnormal_events),
      note: asString(processObservation.note),
    },
    characterization: {
      methods: asObjectArray(characterization.methods).map((item) => ({
        sourcePayload: item,
        method: asString(item.method),
        result: asString(item.result),
        enabled: asBooleanWithDefault(item.enabled, true),
        excitationNm: asString(item.excitation_nm),
        note: asString(item.note),
      })),
    },
    resultSummary: {
      summaryResult:
        asString(experiment.summary_result) || asString(resultSummary.summary_result),
      qualityLabel:
        (asString(resultSummary.quality_label) as QualityLabel) || experiment.quality_label,
      nextStep: asString(resultSummary.next_step),
    },
  };
}

export function serializeSectionValues(
  sectionKey: EditorSectionKey,
  values: ExperimentEditorValues,
) {
  switch (sectionKey) {
    case "basic_info":
      return JSON.stringify(values.basicInfo);
    case "environment":
      return JSON.stringify(values.environment);
    case "precheck":
      return JSON.stringify(values.precheck);
    case "precursors":
      return JSON.stringify(values.precursors);
    case "substrates":
      return JSON.stringify(values.substrates);
    case "furnace_program":
      return JSON.stringify(values.furnaceProgram);
    case "gas_program":
      return JSON.stringify(values.gasProgram);
    case "process_observation":
      return JSON.stringify(values.processObservation);
    case "characterization":
      return JSON.stringify(values.characterization);
    case "result_summary":
      return JSON.stringify(values.resultSummary);
  }
}

export function toExperimentPatch(values: BasicInfoValues): ExperimentUpdateRequest {
  return {
    experiment_type: values.experimentType.trim(),
    material_system: normalizeNullableString(values.materialSystem),
    objective: normalizeNullableString(values.objective),
  };
}

export function toBasicInfoPayload(values: BasicInfoValues, operatorId: string) {
  return {
    operator_id: operatorId,
    experiment_type: values.experimentType.trim(),
    material_system: normalizeNullableString(values.materialSystem),
    experiment_date: values.experimentDate.trim(),
    objective: normalizeNullableString(values.objective),
  };
}

export function mergeBasicInfoPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: BasicInfoValues,
  operatorId: string,
) {
  return mergePayloadFields(
    existingPayload,
    toBasicInfoPayload(values, operatorId),
    ["operator_id", "experiment_type", "material_system", "experiment_date", "objective"],
  );
}

export function toPrecheckPayload(values: PrecheckValues) {
  return {
    seal_intact: values.sealIntact,
    risk_note: values.riskNote.trim(),
    hood_clean: normalizeNullableBoolean(values.hoodClean),
    flange_blocked: normalizeNullableBoolean(values.flangeBlocked),
    boat_contamination_level: normalizeNullableString(values.boatContaminationLevel),
    tube_contamination_level: normalizeNullableString(values.tubeContaminationLevel),
  };
}

export function mergePrecheckPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: PrecheckValues,
) {
  return mergePayloadFields(existingPayload, toPrecheckPayload(values), [
    "seal_intact",
    "risk_note",
    "hood_clean",
    "flange_blocked",
    "boat_contamination_level",
    "tube_contamination_level",
  ]);
}

export function toEnvironmentPayload(values: EnvironmentValues) {
  return removeNullEntries({
    indoor_temperature_C: normalizeNumberLike(values.indoorTemperatureC),
    indoor_humidity_percent: normalizeNumberLike(values.indoorHumidityPercent),
    sample_env: normalizeNullableString(values.sampleEnv),
    abnormal_note: values.abnormalNote.trim(),
  });
}

export function mergeEnvironmentPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: EnvironmentValues,
) {
  return mergePayloadFields(existingPayload, toEnvironmentPayload(values), [
    "indoor_temperature_C",
    "indoor_humidity_percent",
    "sample_env",
    "abnormal_note",
  ]);
}

export function toPrecursorsPayload(values: PrecursorsValues) {
  return {
    items: values.items
      .filter(
        (item) =>
          hasAnyValue({
            role: item.role,
            type: item.type,
            brand: item.brand,
            concentration: item.concentration,
            concentrationUnit: item.concentrationUnit,
            method: item.method,
            meltingTemperatureC: item.meltingTemperatureC,
            spinSpeedRpm: item.spinSpeedRpm,
            preSpinSpeedRpm: item.preSpinSpeedRpm,
            preparationTimeMin: item.preparationTimeMin,
            massMg: item.massMg,
            batchNo: item.batchNo,
          }) || hasSourcePayload(item.sourcePayload),
      )
      .map((item) =>
        mergePayloadFields(
          item.sourcePayload,
          removeNullEntries({
            role: normalizeNullableString(item.role),
            type: normalizeNullableString(item.type),
            brand: normalizeNullableString(item.brand),
            concentration: normalizeNumberLike(item.concentration),
            concentration_unit: normalizeNullableString(item.concentrationUnit),
            method: normalizeNullableString(item.method),
            melting_temperature_C: normalizeNumberLike(item.meltingTemperatureC),
            spin_speed_rpm: normalizeNumberLike(item.spinSpeedRpm),
            pre_spin_speed_rpm: normalizeNumberLike(item.preSpinSpeedRpm),
            preparation_time_min: normalizeNumberLike(item.preparationTimeMin),
            mass_mg: normalizeNumberLike(item.massMg),
            batch_no: normalizeNullableString(item.batchNo),
          }),
          [
            "role",
            "type",
            "brand",
            "concentration",
            "concentration_unit",
            "method",
            "melting_temperature_C",
            "spin_speed_rpm",
            "pre_spin_speed_rpm",
            "preparation_time_min",
            "mass_mg",
            "batch_no",
          ],
        ),
      ),
  };
}

export function mergePrecursorsPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: PrecursorsValues,
) {
  return mergePayloadFields(existingPayload, toPrecursorsPayload(values), ["items"]);
}

export function toSubstratesPayload(values: SubstratesValues) {
  return {
    items: values.items
      .filter((item) =>
        hasAnyValue({
          role: item.role,
          type: item.type,
          brand: item.brand,
          sizeMm: item.sizeMm,
          treatmentMethod: item.treatmentMethod,
          positionMm: item.positionMm,
          treatmentTemperatureC: item.treatmentTemperatureC,
          treatmentDurationMin: item.treatmentDurationMin,
          treatmentPowerW: item.treatmentPowerW,
          treatmentGas: item.treatmentGas,
        }) || hasSourcePayload(item.sourcePayload),
      )
      .map((item) => {
        const existingTreatmentParams = asRecord(asRecord(item.sourcePayload).treatment_params);
        const nextTreatmentParams = removeNullEntries({
          temperature_C: normalizeNumberLike(item.treatmentTemperatureC),
          duration_min: normalizeNumberLike(item.treatmentDurationMin),
          power_W: normalizeNumberLike(item.treatmentPowerW),
          gas: normalizeNullableString(item.treatmentGas),
        });

        return mergePayloadFields(
          item.sourcePayload,
          removeNullEntries({
            role: normalizeNullableString(item.role),
            type: normalizeNullableString(item.type),
            brand: normalizeNullableString(item.brand),
            size_mm: normalizeNullableString(item.sizeMm),
            treatment_method: normalizeNullableString(item.treatmentMethod),
            position_mm: normalizeNumberLike(item.positionMm),
            treatment_params:
              Object.keys(nextTreatmentParams).length > 0 || Object.keys(existingTreatmentParams).length > 0
                ? mergePayloadFields(existingTreatmentParams, nextTreatmentParams, [
                    "temperature_C",
                    "duration_min",
                    "power_W",
                    "gas",
                  ])
                : undefined,
          }),
          [
            "role",
            "type",
            "brand",
            "size_mm",
            "treatment_method",
            "position_mm",
            "treatment_params",
          ],
        );
      }),
  };
}

export function mergeSubstratesPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: SubstratesValues,
) {
  return mergePayloadFields(existingPayload, toSubstratesPayload(values), ["items"]);
}

export function toFurnaceProgramPayload(values: FurnaceProgramValues) {
  return {
    zones: values.zones
      .map((zone) => {
        const temperatureProgram = zone.temperatureProgram
          .map((point) => ({
            keep:
              point.timeMin.trim().length > 0 ||
              point.temperatureC.trim().length > 0 ||
              hasSourcePayload(point.sourcePayload),
            payload: mergePayloadFields(
              point.sourcePayload,
              removeNullEntries({
                time_min: normalizeNumberLike(point.timeMin),
                temperature_C: normalizeNumberLike(point.temperatureC),
              }),
              ["time_min", "temperature_C"],
            ),
          }))
          .filter((point) => point.keep)
          .map((point) => point.payload);

        const keepZone =
          zone.zoneIndex.trim().length > 0 ||
          zone.note.trim().length > 0 ||
          zone.precursorPlaced ||
          temperatureProgram.length > 0 ||
          hasSourcePayload(zone.sourcePayload);

        return {
          keep: keepZone,
          payload: mergePayloadFields(
            zone.sourcePayload,
            {
              zone_index: normalizeNumberLike(zone.zoneIndex),
              precursor_placed: zone.precursorPlaced,
              note: zone.note.trim(),
              temperature_program: temperatureProgram,
            },
            ["zone_index", "precursor_placed", "note", "temperature_program"],
          ),
        };
      })
      .filter((zone) => zone.keep)
      .map((zone) => zone.payload),
  };
}

export function mergeFurnaceProgramPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: FurnaceProgramValues,
) {
  return mergePayloadFields(existingPayload, toFurnaceProgramPayload(values), ["zones"]);
}

export function toGasProgramPayload(values: GasProgramValues) {
  return {
    pre_washing_gas: normalizeNullableString(values.preWashingGas),
    segments: values.segments
      .map((segment) => {
        const hasComponentValues = segment.components.some(
          (component) =>
            hasAnyValue({
              gas: component.gas,
              ratioPercent: component.ratioPercent,
            }) || hasSourcePayload(component.sourcePayload),
        );

        return {
          keep:
            hasAnyValue({
              stage: segment.stage,
              gas: segment.gas,
              startMin: segment.startMin,
              endMin: segment.endMin,
              flowSccm: segment.flowSccm,
              note: segment.note,
            }) ||
            hasComponentValues ||
            hasSourcePayload(segment.sourcePayload),
          payload: (() => {
          const componentPayloads = segment.components
            .map((component) => ({
              keep:
                hasAnyValue({
                  gas: component.gas,
                  ratioPercent: component.ratioPercent,
                }) || hasSourcePayload(component.sourcePayload),
              payload: mergePayloadFields(
                component.sourcePayload,
                removeNullEntries({
                  name: normalizeNullableString(component.gas),
                  fraction: normalizeNumberLike(component.ratioPercent),
                }),
                ["name", "fraction", "gas", "ratio_percent"],
              ),
            }))
            .filter((component) => component.keep)
            .map((component) => component.payload);

          return mergePayloadFields(
            segment.sourcePayload,
            removeNullEntries({
              stage: normalizeNullableString(segment.stage),
              gas: normalizeNullableString(segment.gas),
              start_min: normalizeNumberLike(segment.startMin),
              end_min: normalizeNumberLike(segment.endMin),
              flow_sccm: normalizeNumberLike(segment.flowSccm),
              note: normalizeNullableString(segment.note),
              components: componentPayloads.length > 0 ? componentPayloads : undefined,
            }),
            ["stage", "gas", "start_min", "end_min", "flow_sccm", "note", "components"],
          );
          })(),
        };
      })
      .filter((segment) => segment.keep)
      .map((segment) => segment.payload),
  };
}

export function mergeGasProgramPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: GasProgramValues,
) {
  return mergePayloadFields(existingPayload, toGasProgramPayload(values), [
    "pre_washing_gas",
    "segments",
  ]);
}

export function toProcessObservationPayload(values: ProcessObservationValues) {
  const abnormalEvents = values.abnormalEvents
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return removeNullEntries({
    color_change: normalizeNullableString(values.colorChange),
    abnormal_events: abnormalEvents.length > 0 ? abnormalEvents : undefined,
    note: normalizeNullableString(values.note),
  });
}

export function mergeProcessObservationPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: ProcessObservationValues,
) {
  return mergePayloadFields(existingPayload, toProcessObservationPayload(values), [
    "color_change",
    "abnormal_events",
    "note",
  ]);
}

export function toCharacterizationPayload(values: CharacterizationValues) {
  const methods = values.methods
    .filter(
      (item) =>
        hasAnyValue({
          method: item.method,
          result: item.result,
          excitationNm: item.excitationNm,
          note: item.note,
        }) || hasSourcePayload(item.sourcePayload),
    )
    .map((item) =>
      mergePayloadFields(
        item.sourcePayload,
        removeNullEntries({
          method: normalizeNullableString(item.method),
          result: normalizeNullableString(item.result),
          enabled: item.enabled,
          excitation_nm: normalizeNumberLike(item.excitationNm),
          note: normalizeNullableString(item.note),
        }),
        ["method", "result", "enabled", "excitation_nm", "note"],
      ),
    );

  return removeNullEntries({
    methods: methods.length > 0 ? methods : undefined,
  });
}

export function mergeCharacterizationPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: CharacterizationValues,
) {
  return mergePayloadFields(existingPayload, toCharacterizationPayload(values), ["methods"]);
}

export function toResultSummaryPatch(values: ResultSummaryValues): ExperimentUpdateRequest {
  return {
    summary_result: normalizeNullableString(values.summaryResult),
  };
}

export function toResultSummaryPayload(values: ResultSummaryValues) {
  return removeNullEntries({
    summary_result: normalizeNullableString(values.summaryResult),
    quality_label: values.qualityLabel,
    next_step: normalizeNullableString(values.nextStep),
  });
}

export function mergeResultSummaryPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: ResultSummaryValues,
) {
  return mergePayloadFields(existingPayload, toResultSummaryPayload(values), [
    "summary_result",
    "quality_label",
    "next_step",
  ]);
}
