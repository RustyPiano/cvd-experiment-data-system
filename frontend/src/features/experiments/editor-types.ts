import type {
  ExperimentModulePayloadRead,
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
};

export type EnvironmentValues = {
  indoorTemperatureC: string;
  sampleEnv: string;
  abnormalNote: string;
};

type PayloadBackedValue = {
  sourcePayload?: Record<string, unknown>;
};

export type PrecursorItemValues = PayloadBackedValue & {
  role: string;
  type: string;
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
};

export type GasProgramValues = {
  preWashingGas: string;
  segments: GasSegmentValues[];
};

export type ProcessObservationValues = {
  colorChange: string;
  abnormalEvents: string[];
  note: string;
};

export type CharacterizationMethodValues = PayloadBackedValue & {
  method: string;
  result: string;
};

export type CharacterizationValues = {
  methods: CharacterizationMethodValues[];
};

export type ResultSummaryValues = {
  summaryResult: string;
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

function hasAnyValue(record: Record<string, string>) {
  return Object.values(record).some((value) => value.trim().length > 0);
}

export function createEmptyPrecursorItem(): PrecursorItemValues {
  return {
    role: "",
    type: "",
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
  };
}

export function createEmptyObservationEvent() {
  return "";
}

export function createEmptyCharacterizationMethod(): CharacterizationMethodValues {
  return {
    method: "",
    result: "",
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
  const environment = asRecord(payloads.environment);
  const precheck = asRecord(payloads.precheck);
  const precursors = asRecord(payloads.precursors);
  const substrates = asRecord(payloads.substrates);
  const furnaceProgram = asRecord(payloads.furnace_program);
  const gasProgram = asRecord(payloads.gas_program);
  const processObservation = asRecord(payloads.process_observation);
  const characterization = asRecord(payloads.characterization);

  return {
    basicInfo: {
      experimentType: asString(experiment.experiment_type),
      materialSystem: asString(experiment.material_system),
      experimentDate: asString(experiment.experiment_date),
      objective: asString(experiment.objective),
    },
    environment: {
      indoorTemperatureC: asString(environment.indoor_temperature_C),
      sampleEnv: asString(environment.sample_env),
      abnormalNote: asString(environment.abnormal_note),
    },
    precheck: {
      sealIntact: asBoolean(precheck.seal_intact),
      riskNote: asString(precheck.risk_note),
    },
    precursors: {
      items: asObjectArray(precursors.items).map((item) => ({
        sourcePayload: item,
        role: asString(item.role),
        type: asString(item.type),
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
      })),
    },
    resultSummary: {
      summaryResult: asString(experiment.summary_result),
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
  };
}

export function mergePrecheckPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: PrecheckValues,
) {
  return mergePayloadFields(existingPayload, toPrecheckPayload(values), ["seal_intact", "risk_note"]);
}

export function toEnvironmentPayload(values: EnvironmentValues) {
  return removeNullEntries({
    indoor_temperature_C: normalizeNumberLike(values.indoorTemperatureC),
    sample_env: normalizeNullableString(values.sampleEnv),
    abnormal_note: values.abnormalNote.trim(),
  });
}

export function mergeEnvironmentPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: EnvironmentValues,
) {
  return mergePayloadFields(
    existingPayload,
    {
      ...toEnvironmentPayload(values),
      indoor_humidity_percent: asRecord(existingPayload).indoor_humidity_percent,
    },
    [
      "indoor_temperature_C",
      "indoor_humidity_percent",
      "sample_env",
      "abnormal_note",
    ],
  );
}

export function toPrecursorsPayload(values: PrecursorsValues) {
  return {
    items: values.items
      .filter(
        (item) =>
          hasAnyValue({
            role: item.role,
            type: item.type,
          }) || hasSourcePayload(item.sourcePayload),
      )
      .map((item) =>
        mergePayloadFields(
          item.sourcePayload,
          removeNullEntries({
            role: normalizeNullableString(item.role),
            type: normalizeNullableString(item.type),
          }),
          ["role", "type"],
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
        }) || hasSourcePayload(item.sourcePayload),
      )
      .map((item) =>
        mergePayloadFields(
          item.sourcePayload,
          removeNullEntries({
            role: normalizeNullableString(item.role),
            type: normalizeNullableString(item.type),
            brand: normalizeNullableString(item.brand),
            size_mm: normalizeNullableString(item.sizeMm),
            treatment_method: normalizeNullableString(item.treatmentMethod),
            position_mm: normalizeNumberLike(item.positionMm),
          }),
          ["role", "type", "brand", "size_mm", "treatment_method", "position_mm"],
        ),
      ),
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
      .map((segment) => ({
        keep:
          hasAnyValue({
            stage: segment.stage,
            gas: segment.gas,
            startMin: segment.startMin,
            endMin: segment.endMin,
            flowSccm: segment.flowSccm,
          }) || hasSourcePayload(segment.sourcePayload),
        payload: removeNullEntries(
          mergePayloadFields(
            segment.sourcePayload,
            removeNullEntries({
              stage: normalizeNullableString(segment.stage),
              gas: normalizeNullableString(segment.gas),
              start_min: normalizeNumberLike(segment.startMin),
              end_min: normalizeNumberLike(segment.endMin),
              flow_sccm: normalizeNumberLike(segment.flowSccm),
            }),
            ["stage", "gas", "start_min", "end_min", "flow_sccm"],
          ),
        ),
      }))
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
        }) || hasSourcePayload(item.sourcePayload),
    )
    .map((item) =>
      mergePayloadFields(
        item.sourcePayload,
        removeNullEntries({
          method: normalizeNullableString(item.method),
          result: normalizeNullableString(item.result),
        }),
        ["method", "result"],
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
  });
}

export function mergeResultSummaryPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: ResultSummaryValues,
) {
  return mergePayloadFields(existingPayload, toResultSummaryPayload(values), ["summary_result"]);
}
