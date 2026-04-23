import type {
  ExperimentModulePayloadRead,
  ExperimentRead,
  ExperimentUpdateRequest,
} from "../../shared/types/api";

export const editorSectionKeys = [
  "basic_info",
  "precheck",
  "precursors",
  "substrates",
  "furnace_program",
  "gas_program",
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

export type PrecursorItemValues = {
  role: string;
  type: string;
};

export type PrecursorsValues = {
  items: PrecursorItemValues[];
};

export type SubstrateItemValues = {
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

export type FurnacePointValues = {
  timeMin: string;
  temperatureC: string;
};

export type FurnaceZoneValues = {
  zoneIndex: string;
  precursorPlaced: boolean;
  note: string;
  temperatureProgram: FurnacePointValues[];
};

export type FurnaceProgramValues = {
  zones: FurnaceZoneValues[];
};

export type GasSegmentValues = {
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

export type ExperimentEditorValues = {
  basicInfo: BasicInfoValues;
  precheck: PrecheckValues;
  precursors: PrecursorsValues;
  substrates: SubstratesValues;
  furnaceProgram: FurnaceProgramValues;
  gasProgram: GasProgramValues;
};

type ModulePayloadMap = Partial<Record<EditorSectionKey, Record<string, unknown>>>;

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

export function createInitialSectionStates(): Record<EditorSectionKey, SectionSaveState> {
  return {
    basic_info: { status: "idle", message: null },
    precheck: { status: "idle", message: null },
    precursors: { status: "idle", message: null },
    substrates: { status: "idle", message: null },
    furnace_program: { status: "idle", message: null },
    gas_program: { status: "idle", message: null },
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
  const precheck = asRecord(payloads.precheck);
  const precursors = asRecord(payloads.precursors);
  const substrates = asRecord(payloads.substrates);
  const furnaceProgram = asRecord(payloads.furnace_program);
  const gasProgram = asRecord(payloads.gas_program);

  return {
    basicInfo: {
      experimentType: asString(basicInfo.experiment_type ?? experiment.experiment_type),
      materialSystem: asString(basicInfo.material_system ?? experiment.material_system),
      experimentDate: asString(basicInfo.experiment_date ?? experiment.experiment_date),
      objective: asString(basicInfo.objective ?? experiment.objective),
    },
    precheck: {
      sealIntact: asBoolean(precheck.seal_intact),
      riskNote: asString(precheck.risk_note),
    },
    precursors: {
      items: asObjectArray(precursors.items).map((item) => ({
        role: asString(item.role),
        type: asString(item.type),
      })),
    },
    substrates: {
      items: asObjectArray(substrates.items).map((item) => ({
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
        zoneIndex: asString(zone.zone_index),
        precursorPlaced: asBoolean(zone.precursor_placed),
        note: asString(zone.note),
        temperatureProgram: asObjectArray(zone.temperature_program).map((point) => ({
          timeMin: asString(point.time_min),
          temperatureC: asString(point.temperature_C),
        })),
      })),
    },
    gasProgram: {
      preWashingGas: asString(gasProgram.pre_washing_gas),
      segments: asObjectArray(gasProgram.segments).map((segment) => ({
        stage: asString(segment.stage),
        gas: asString(segment.gas),
        startMin: asString(segment.start_min),
        endMin: asString(segment.end_min),
        flowSccm: asString(segment.flow_sccm),
      })),
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

export function toPrecheckPayload(values: PrecheckValues) {
  return {
    seal_intact: values.sealIntact,
    risk_note: values.riskNote.trim(),
  };
}

export function toPrecursorsPayload(values: PrecursorsValues) {
  return {
    items: values.items
      .filter((item) => hasAnyValue(item))
      .map((item) =>
        removeNullEntries({
          role: normalizeNullableString(item.role),
          type: normalizeNullableString(item.type),
        }),
      ),
  };
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
        }),
      )
      .map((item) =>
        removeNullEntries({
          role: normalizeNullableString(item.role),
          type: normalizeNullableString(item.type),
          brand: normalizeNullableString(item.brand),
          size_mm: normalizeNullableString(item.sizeMm),
          treatment_method: normalizeNullableString(item.treatmentMethod),
          position_mm: normalizeNumberLike(item.positionMm),
        }),
      ),
  };
}

export function toFurnaceProgramPayload(values: FurnaceProgramValues) {
  return {
    zones: values.zones
      .map((zone) => ({
        zone_index: normalizeNumberLike(zone.zoneIndex),
        precursor_placed: zone.precursorPlaced,
        note: zone.note.trim(),
        temperature_program: zone.temperatureProgram
          .map((point) => ({
            time_min: normalizeNumberLike(point.timeMin),
            temperature_C: normalizeNumberLike(point.temperatureC),
          }))
          .filter((point) => point.time_min !== null || point.temperature_C !== null),
      }))
      .filter(
        (zone) =>
          zone.zone_index !== null ||
          zone.temperature_program.length > 0 ||
          zone.note.length > 0 ||
          zone.precursor_placed,
      ),
  };
}

export function toGasProgramPayload(values: GasProgramValues) {
  return {
    pre_washing_gas: normalizeNullableString(values.preWashingGas),
    segments: values.segments
      .map((segment) => ({
        stage: normalizeNullableString(segment.stage),
        gas: normalizeNullableString(segment.gas),
        start_min: normalizeNumberLike(segment.startMin),
        end_min: normalizeNumberLike(segment.endMin),
        flow_sccm: normalizeNumberLike(segment.flowSccm),
      }))
      .filter(
        (segment) =>
          segment.stage !== null ||
          segment.gas !== null ||
          segment.start_min !== null ||
          segment.end_min !== null ||
          segment.flow_sccm !== null,
      )
      .map((segment) => removeNullEntries(segment)),
  };
}
