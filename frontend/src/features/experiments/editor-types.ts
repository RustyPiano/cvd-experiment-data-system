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

export type EditorValidationError = {
  sectionKey: EditorSectionKey;
  fieldPath: string;
  message: string;
};

export type VocabularySelectOption = {
  label: string;
  value: string;
};

type NumberParseResult =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

export type BasicInfoValues = {
  experimentType: string;
  materialSystem: string;
  experimentDate: string;
  layerCount: string;
  objective: string;
};

export type PrecheckValues = {
  sealIntact: NullableBooleanValue;
  riskNote: string;
  hoodClean: NullableBooleanValue;
  flangeBlocked: NullableBooleanValue;
  boatContaminationLevel: NullableBooleanValue;
  tubeContaminationLevel: NullableBooleanValue;
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
  species: string;
  brand: string;
  concentration: string;
  concentrationUnit: string;
  method: string;
  meltingTemperatureC: string;
  spinSpeedRpm: string;
  spinTimeS: string;
  preSpinSpeedRpm: string;
  preSpinTimeS: string;
  preparationTimeMin: string;
  massMg: string;
  batchNo: string;
};

export type PrecursorsValues = {
  items: PrecursorItemValues[];
};

export type PrecursorMethodFlags = {
  showConcentrationFields: boolean;
  showSpinFields: boolean;
  hideMassAndPrepTime: boolean;
  showMeltingFields: boolean;
};

export type SubstrateItemValues = PayloadBackedValue & {
  role: string;
  type: string;
  brand: string;
  sizeMm: string;
  batchNo: string;
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

export type FurnaceInfoValues = {
  zonesCount: string;
  model: string;
};

/** A single editable time-segment between two temperature nodes. */
export type FurnaceSegmentValues = {
  /** Human-readable label, e.g. "升温", "保温", "降温" */
  label: string;
  /** Duration in minutes as a string (may be empty for new rows) */
  durationMin: string;
  /** Target temperature at end of segment in °C as a string */
  targetTemperatureC: string;
  /** Optional note for the end node of this segment */
  note: string;
};

export type FurnacePlacementValues = {
  precursorIndex: string;
  zoneKey: string;
  positionCm: string;
  note: string;
};

export type FurnaceZoneValues = {
  zoneKey: string;
  /** Starting temperature of the zone (at t=0), as a string */
  startTemperatureC: string;
  segments: FurnaceSegmentValues[];
  note: string;
};

export type FurnaceProgramValues = {
  furnaceInfo: FurnaceInfoValues;
  placements: FurnacePlacementValues[];
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
  flowSccm: string;
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

export function inferComponentFlowSccm(
  component: Record<string, unknown>,
  segment: Record<string, unknown>,
): string {
  const segmentFlow = Number(segment.flow_sccm);
  if (!Number.isFinite(segmentFlow) || segmentFlow <= 0) {
    return "";
  }
  if (component.fraction != null) {
    const f = Number(component.fraction);
    if (Number.isFinite(f)) {
      return String(Math.round(f * segmentFlow * 1000) / 1000);
    }
  }
  if (component.ratio_percent != null) {
    const rp = Number(component.ratio_percent);
    if (Number.isFinite(rp)) {
      return String(Math.round((rp / 100) * segmentFlow * 1000) / 1000);
    }
  }
  return "";
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

export function resolvePrecursorMethodFlags(method: string): PrecursorMethodFlags {
  const normalizedMethod = method.trim().toLowerCase();
  const isSolutionOrSpin = normalizedMethod === "solution" || normalizedMethod === "spin_coating";
  const isMelting = normalizedMethod === "melting";
  return {
    showConcentrationFields: isSolutionOrSpin,
    showSpinFields: isSolutionOrSpin,
    hideMassAndPrepTime: isSolutionOrSpin,
    showMeltingFields: isMelting,
  };
}

export function createPrecursorMethodPatch(method: string): Partial<PrecursorItemValues> {
  const flags = resolvePrecursorMethodFlags(method);
  const patch: Partial<PrecursorItemValues> = { method };

  if (flags.hideMassAndPrepTime) {
    patch.massMg = "";
    patch.preparationTimeMin = "";
  }
  if (!flags.showConcentrationFields) {
    patch.concentration = "";
    patch.concentrationUnit = "";
  }
  if (!flags.showSpinFields) {
    patch.spinSpeedRpm = "";
    patch.spinTimeS = "";
    patch.preSpinSpeedRpm = "";
    patch.preSpinTimeS = "";
  }
  if (!flags.showMeltingFields) {
    patch.meltingTemperatureC = "";
  }

  return patch;
}

export function withLegacyVocabularyOption(
  options: VocabularySelectOption[],
  currentValue: string,
) {
  const normalizedValue = currentValue.trim();
  if (!normalizedValue || options.some((option) => option.value === normalizedValue)) {
    return options;
  }

  return [
    {
      label: normalizedValue,
      value: normalizedValue,
    },
    ...options,
  ];
}

function parseNullableNumber(value: string, label: string): NumberParseResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return { ok: false, message: `${label} 必须是数字` };
  }

  return { ok: true, value: numericValue };
}



function normalizeNumberLike(value: string) {
  const result = parseNullableNumber(value, "数值");
  return result.ok ? result.value : null;
}

function parsePositiveIntegerValue(value: string) {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isSafeInteger(numericValue) ? numericValue : null;
}

function appendNumberValidationError(
  errors: EditorValidationError[],
  sectionKey: EditorSectionKey,
  fieldPath: string,
  value: string,
  label: string,
) {
  const result = parseNullableNumber(value, label);
  if (!result.ok) {
    errors.push({
      sectionKey,
      fieldPath,
      message: result.message,
    });
  }
}

function appendPositiveNumberValidationError(
  errors: EditorValidationError[],
  sectionKey: EditorSectionKey,
  fieldPath: string,
  value: string,
  label: string,
) {
  const result = parseNullableNumber(value, label);
  if (!result.ok) {
    errors.push({
      sectionKey,
      fieldPath,
      message: result.message,
    });
    return;
  }

  if (result.value !== null && result.value <= 0) {
    errors.push({
      sectionKey,
      fieldPath,
      message: `${label} 必须是正数`,
    });
  }
}

export function validateSectionValues(
  sectionKey: EditorSectionKey,
  values: ExperimentEditorValues,
): EditorValidationError[] {
  const errors: EditorValidationError[] = [];

  if (sectionKey === "environment") {
    appendNumberValidationError(
      errors,
      sectionKey,
      "indoorTemperatureC",
      values.environment.indoorTemperatureC,
      "环境温度",
    );
    appendNumberValidationError(
      errors,
      sectionKey,
      "indoorHumidityPercent",
      values.environment.indoorHumidityPercent,
      "室内湿度",
    );
  }

  if (sectionKey === "precursors") {
    values.precursors.items.forEach((item, index) => {
      const rowNumber = index + 1;
      const flags = resolvePrecursorMethodFlags(item.method);
      if (flags.showConcentrationFields) {
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.concentration`,
          item.concentration,
          `浓度 ${rowNumber}`,
        );
      }
      if (flags.showMeltingFields) {
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.meltingTemperatureC`,
          item.meltingTemperatureC,
          `熔融温度 ${rowNumber}`,
        );
      }
      if (flags.showSpinFields) {
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.spinSpeedRpm`,
          item.spinSpeedRpm,
          `旋涂转速 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.spinTimeS`,
          item.spinTimeS,
          `旋涂时长 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.preSpinSpeedRpm`,
          item.preSpinSpeedRpm,
          `预旋涂转速 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.preSpinTimeS`,
          item.preSpinTimeS,
          `预旋涂时长 ${rowNumber}`,
        );
      }
      if (!flags.hideMassAndPrepTime) {
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.preparationTimeMin`,
          item.preparationTimeMin,
          `制备时长 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.massMg`,
          item.massMg,
          `前驱体质量 ${rowNumber}`,
        );
      }
    });
  }

  if (sectionKey === "substrates") {
    values.substrates.items
      .filter((item) => item.role === "top" || item.role === "bottom")
      .forEach((item, index) => {
        const rowNumber = index + 1;
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.positionMm`,
          item.positionMm,
          `位置 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.treatmentTemperatureC`,
          item.treatmentTemperatureC,
          `处理参数温度 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.treatmentDurationMin`,
          item.treatmentDurationMin,
          `处理参数时长 ${rowNumber}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `items.${index}.treatmentPowerW`,
          item.treatmentPowerW,
          `处理参数功率 ${rowNumber}`,
        );
      });
  }

  if (sectionKey === "furnace_program") {
    const zonesCount = parsePositiveIntegerValue(values.furnaceProgram.furnaceInfo.zonesCount);
    if (zonesCount === null) {
      errors.push({
        sectionKey,
        fieldPath: "furnaceInfo.zonesCount",
        message: "温区数量必须是正整数",
      });
    }
    values.furnaceProgram.placements.forEach((placement, placementIndex) => {
      appendNumberValidationError(
        errors,
        sectionKey,
        `placements.${placementIndex}.positionCm`,
        placement.positionCm,
        `前驱体放置位置 ${placementIndex + 1}`,
      );
    });
    const allowedZoneKeys = new Set(getValidFurnaceZoneKeys(values.furnaceProgram.furnaceInfo.zonesCount));
    values.furnaceProgram.zones.forEach((zone, zoneIndex) => {
      if (allowedZoneKeys.size > 0 && !allowedZoneKeys.has(zone.zoneKey)) {
        errors.push({
          sectionKey,
          fieldPath: `zones.${zoneIndex}.zoneKey`,
          message: `温区 ${zoneIndex + 1} 不在声明温区范围内`,
        });
      }
      // Only block autosave if startTemperatureC is filled but invalid (not-a-number)
      appendNumberValidationError(
        errors,
        sectionKey,
        `zones.${zoneIndex}.startTemperatureC`,
        zone.startTemperatureC,
        `初始温度 温区${zoneIndex + 1}`,
      );
      zone.segments.forEach((segment, segIndex) => {
        appendPositiveNumberValidationError(
          errors,
          sectionKey,
          `zones.${zoneIndex}.segments.${segIndex}.durationMin`,
          segment.durationMin,
          `时长 温区${zoneIndex + 1}-区间${segIndex + 1}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `zones.${zoneIndex}.segments.${segIndex}.targetTemperatureC`,
          segment.targetTemperatureC,
          `目标温度 温区${zoneIndex + 1}-区间${segIndex + 1}`,
        );
      });
    });
  }

  if (sectionKey === "gas_program") {
    values.gasProgram.segments.forEach((segment, segmentIndex) => {
      const rowNumber = segmentIndex + 1;
      appendNumberValidationError(
        errors,
        sectionKey,
        `segments.${segmentIndex}.startMin`,
        segment.startMin,
        `开始时间 ${rowNumber}`,
      );
      appendNumberValidationError(
        errors,
        sectionKey,
        `segments.${segmentIndex}.endMin`,
        segment.endMin,
        `结束时间 ${rowNumber}`,
      );
      appendNumberValidationError(
        errors,
        sectionKey,
        `segments.${segmentIndex}.flowSccm`,
        segment.flowSccm,
        `流量 ${rowNumber}`,
      );
      segment.components.forEach((component, componentIndex) => {
        appendNumberValidationError(
          errors,
          sectionKey,
          `segments.${segmentIndex}.components.${componentIndex}.flowSccm`,
          component.flowSccm,
          `组分流量 ${rowNumber}-${componentIndex + 1}`,
        );
      });
    });
  }

  if (sectionKey === "characterization") {
    values.characterization.methods.forEach((item, index) => {
      appendNumberValidationError(
        errors,
        sectionKey,
        `methods.${index}.excitationNm`,
        item.excitationNm,
        `激发波长 ${index + 1}`,
      );
    });
  }

  return errors;
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

function hasSubstrateEditableValue(item: SubstrateItemValues) {
  return hasAnyValue({
    type: item.type,
    brand: item.brand,
    sizeMm: item.sizeMm,
    batchNo: item.batchNo,
    treatmentMethod: item.treatmentMethod,
    positionMm: item.positionMm,
    treatmentTemperatureC: item.treatmentTemperatureC,
    treatmentDurationMin: item.treatmentDurationMin,
    treatmentPowerW: item.treatmentPowerW,
    treatmentGas: item.treatmentGas,
  });
}

export function shouldSanitizeSubstratesBeforeSubmit(values: SubstratesValues) {
  return values.items.some((item) => {
    const isFixedRole = item.role === "top" || item.role === "bottom";
    return (
      !isFixedRole || (hasSourcePayload(item.sourcePayload) && !hasSubstrateEditableValue(item))
    );
  });
}

function getFurnaceZoneKeys(zonesCount: number) {
  return Array.from({ length: zonesCount }, (_, index) => `zone_${index + 1}`);
}

function getValidFurnaceZoneKeys(zonesCountValue: string) {
  const zonesCount = parsePositiveIntegerValue(zonesCountValue);
  return zonesCount === null ? [] : getFurnaceZoneKeys(zonesCount);
}


/** Default segment configs for a new zone */
const defaultSegmentConfigs: FurnaceSegmentValues[] = [
  { label: "升温", durationMin: "30", targetTemperatureC: "", note: "升温结束" },
  { label: "保温", durationMin: "15", targetTemperatureC: "", note: "恒温结束" },
  { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
];

export function createDefaultZoneSegments(): FurnaceSegmentValues[] {
  return defaultSegmentConfigs.map((cfg) => ({ ...cfg }));
}

export function createEmptyFurnaceZone(zoneKey = ""): FurnaceZoneValues {
  return {
    zoneKey,
    startTemperatureC: "25",
    segments: createDefaultZoneSegments(),
    note: "",
  };
}

/**
 * Convert segments + startTemperatureC to temperature_program nodes for backend payload.
 * node[0] is always the start node (t=0); each segment contributes one end-node.
 */
export function segmentsToTemperatureNodes(
  startTemperatureC: string,
  segments: FurnaceSegmentValues[],
): { node_index: number; time_min: number | null; temperature_C: number | null; note: string }[] {
  const startTrimmed = startTemperatureC.trim();
  const startTemp = startTrimmed ? Number(startTrimmed) : null;
  const nodes: { node_index: number; time_min: number | null; temperature_C: number | null; note: string }[] = [
    {
      node_index: 1,
      time_min: 0,
      temperature_C: startTemp !== null && Number.isFinite(startTemp) ? startTemp : null,
      note: "",
    },
  ];

  let elapsed = 0;
  let timeValid = true;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const durTrimmed = seg.durationMin.trim();
    const dur = durTrimmed ? Number(durTrimmed) : null;
    if (dur !== null && Number.isFinite(dur) && timeValid) {
      elapsed += dur;
    } else {
      timeValid = false;
    }
    const tempTrimmed = seg.targetTemperatureC.trim();
    const temp = tempTrimmed ? Number(tempTrimmed) : null;
    nodes.push({
      node_index: i + 2,
      time_min: timeValid ? elapsed : null,
      temperature_C: temp !== null && Number.isFinite(temp) ? temp : null,
      note: seg.note,
    });
  }
  return nodes;
}

function inferFurnaceSegmentLabel(
  node: Record<string, unknown>,
  prevNode: Record<string, unknown>,
  fallbackLabel: string | undefined,
  index: number,
) {
  const note = asString(node.note);
  if (note.includes("升温")) {
    return "升温";
  }
  if (note.includes("恒温") || note.includes("保温")) {
    return "保温";
  }
  if (note.includes("降温")) {
    return "降温";
  }

  const prevTemperature = prevNode.temperature_C != null ? Number(prevNode.temperature_C) : null;
  const currentTemperature = node.temperature_C != null ? Number(node.temperature_C) : null;
  if (
    prevTemperature !== null &&
    currentTemperature !== null &&
    Number.isFinite(prevTemperature) &&
    Number.isFinite(currentTemperature)
  ) {
    if (currentTemperature > prevTemperature) {
      return "升温";
    }
    if (currentTemperature === prevTemperature) {
      return "保温";
    }
    return "降温";
  }

  return fallbackLabel ?? `区间 ${index + 1}`;
}

/**
 * Convert temperature_program nodes (from payload) back to segments editing model.
 * node[0] is the start node; each subsequent node becomes a segment.
 */
export function temperatureNodesToSegments(
  nodes: Record<string, unknown>[],
  defaultLabels: string[] = ["升温", "保温", "降温"],
): { startTemperatureC: string; segments: FurnaceSegmentValues[] } {
  if (nodes.length === 0) {
    return { startTemperatureC: "25", segments: createDefaultZoneSegments() };
  }

  const startNode = nodes[0];
  const startTemperatureC = startNode.temperature_C != null ? String(startNode.temperature_C) : "";

  if (nodes.length === 1) {
    return { startTemperatureC: startTemperatureC || "25", segments: createDefaultZoneSegments() };
  }

  const segments: FurnaceSegmentValues[] = nodes.slice(1).map((node, index) => {
    const prevNode = nodes[index]; // node[index] because slice(1) shifts by 1
    const prevTime = prevNode.time_min != null ? Number(prevNode.time_min) : null;
    const curTime = node.time_min != null ? Number(node.time_min) : null;
    const dur =
      prevTime !== null &&
      curTime !== null &&
      Number.isFinite(prevTime) &&
      Number.isFinite(curTime)
        ? curTime - prevTime
        : null;
    return {
      label: inferFurnaceSegmentLabel(node, prevNode, defaultLabels[index], index),
      durationMin: dur !== null ? String(Math.round(dur * 1000) / 1000) : "",
      targetTemperatureC: node.temperature_C != null ? String(node.temperature_C) : "",
      note: node.note != null ? String(node.note) : "",
    };
  });

  return { startTemperatureC: startTemperatureC || "25", segments };
}

/**
 * Convert a raw backend furnace_program payload to FurnaceProgramValues.
 * This is the single source of truth for loading furnace data into the editor.
 */
export function payloadToFurnaceProgramValues(
  furnaceProgram: Record<string, unknown>,
): FurnaceProgramValues {
  const info = asRecord(furnaceProgram.furnace_info);
  const model = asString(info.model);

  const rawZones = asObjectArray(furnaceProgram.zones);
  const declaredZonesCount = parsePositiveIntegerValue(asString(info.zones_count));
  const rawZoneValues = rawZones.map((zone, i) => {
    const nodes = asObjectArray(zone.temperature_program);
    const { startTemperatureC, segments } = temperatureNodesToSegments(nodes);
    return {
      zoneKey: asString(zone.zone_key) || `zone_${i + 1}`,
      startTemperatureC,
      segments,
      note: asString(zone.note),
    };
  });
  const declaredZoneKeys =
    declaredZonesCount !== null
      ? getFurnaceZoneKeys(declaredZonesCount)
      : rawZoneValues.length > 0
        ? rawZoneValues.map((zone) => zone.zoneKey)
        : ["zone_1", "zone_2"];
  const existingZonesByKey = new Map(rawZoneValues.map((zone) => [zone.zoneKey, zone]));
  const zones: FurnaceZoneValues[] = declaredZoneKeys.map(
    (zoneKey) => existingZonesByKey.get(zoneKey) ?? createEmptyFurnaceZone(zoneKey),
  );
  const zonesCount = declaredZonesCount !== null ? String(declaredZonesCount) : String(declaredZoneKeys.length);

  const placements: FurnacePlacementValues[] = asObjectArray(furnaceProgram.placements).map((p) => ({
    precursorIndex: asString(p.precursor_index),
    zoneKey: asString(p.zone_key),
    positionCm: asString(p.position_cm),
    note: asString(p.note),
  }));

  return {
    furnaceInfo: { zonesCount, model },
    placements,
    zones,
  };
}

export function syncFurnaceProgramZonesCount(
  value: FurnaceProgramValues,
  newZonesCountStr: string,
): FurnaceProgramValues {
  const newCount = parsePositiveIntegerValue(newZonesCountStr);
  if (newCount === null) {
    return {
      ...value,
      furnaceInfo: { ...value.furnaceInfo, zonesCount: newZonesCountStr },
    };
  }

  const newZoneKeys = getFurnaceZoneKeys(newCount);
  const existingByKey = new Map(value.zones.map((z) => [z.zoneKey, z]));
  const newZoneKeySet = new Set(newZoneKeys);

  return {
    furnaceInfo: { ...value.furnaceInfo, zonesCount: newZonesCountStr },
    placements: value.placements.map((p) =>
      p.zoneKey && !newZoneKeySet.has(p.zoneKey) ? { ...p, zoneKey: "" } : p,
    ),
    zones: newZoneKeys.map((k) => existingByKey.get(k) ?? createEmptyFurnaceZone(k)),
  };
}

export function createEmptyPrecursorItem(): PrecursorItemValues {
  return {
    species: "",
    brand: "",
    concentration: "",
    concentrationUnit: "",
    method: "",
    meltingTemperatureC: "",
    spinSpeedRpm: "",
    spinTimeS: "",
    preSpinSpeedRpm: "",
    preSpinTimeS: "",
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
    batchNo: "",
    treatmentMethod: "",
    positionMm: "",
    treatmentTemperatureC: "",
    treatmentDurationMin: "",
    treatmentPowerW: "",
    treatmentGas: "",
  };
}


export function createEmptyFurnacePlacement(): FurnacePlacementValues {
  return {
    precursorIndex: "",
    zoneKey: "",
    positionCm: "",
    note: "",
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
  const precursorItems = asObjectArray(precursors.items);
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
      layerCount: asString(basicInfo.layer_count),
      objective: asString(experiment.objective),
    },
    environment: {
      indoorTemperatureC: asString(environment.indoor_temperature_C),
      indoorHumidityPercent: asString(environment.indoor_humidity_percent),
      sampleEnv: asString(environment.sample_env),
      abnormalNote: asString(environment.abnormal_note),
    },
    precheck: {
      sealIntact: asNullableBooleanValue(precheck.seal_intact),
      riskNote: asString(precheck.risk_note),
      hoodClean: asNullableBooleanValue(precheck.hood_clean),
      flangeBlocked: asNullableBooleanValue(precheck.flange_blocked),
      boatContaminationLevel: asNullableBooleanValue(precheck.boat_contamination_level),
      tubeContaminationLevel: asNullableBooleanValue(precheck.tube_contamination_level),
    },
    precursors: {
      items:
        precursorItems.length > 0
          ? precursorItems.map((item) => ({
              sourcePayload: item,
              species: asString(item.species),
              brand: asString(item.brand),
              concentration: asString(item.concentration),
              concentrationUnit: asString(item.concentration_unit),
              method: asString(item.method),
              meltingTemperatureC: asString(item.melting_temperature_C),
              spinSpeedRpm: asString(item.spin_speed_rpm),
              spinTimeS: asString(item.spin_time_s),
              preSpinSpeedRpm: asString(item.pre_spin_speed_rpm),
              preSpinTimeS: asString(item.pre_spin_time_s),
              preparationTimeMin: asString(item.preparation_time_min),
              massMg: asString(item.mass_mg),
              batchNo: asString(item.batch_no),
            }))
          : [createEmptyPrecursorItem(), createEmptyPrecursorItem()],
    },
    substrates: {
      items: asObjectArray(substrates.items).map((item) => ({
        sourcePayload: item,
        role: asString(item.role),
        type: asString(item.type),
        brand: asString(item.brand),
        sizeMm: asString(item.size_mm),
        batchNo: asString(item.batch_no),
        treatmentMethod: asString(item.treatment_method),
        positionMm: asString(item.position_mm),
        treatmentTemperatureC: asString(asRecord(item.treatment_params).temperature_C),
        treatmentDurationMin: asString(asRecord(item.treatment_params).duration_min),
        treatmentPowerW: asString(asRecord(item.treatment_params).power_W),
        treatmentGas: asString(asRecord(item.treatment_params).gas),
      })),
    },
    furnaceProgram: payloadToFurnaceProgramValues(furnaceProgram),
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
          flowSccm: asString(component.flow_sccm) || inferComponentFlowSccm(component, segment),
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
    experiment_date: values.experimentDate.trim(),
    objective: normalizeNullableString(values.objective),
  };
}

export function toBasicInfoPayload(values: BasicInfoValues, operatorId: string) {
  return {
    operator_id: operatorId,
    experiment_type: values.experimentType.trim(),
    material_system: normalizeNullableString(values.materialSystem),
    experiment_date: values.experimentDate.trim(),
    layer_count: normalizeNullableString(values.layerCount),
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
    [
      "operator_id",
      "experiment_type",
      "material_system",
      "experiment_date",
      "layer_count",
      "objective",
    ],
  );
}

export function toPrecheckPayload(values: PrecheckValues) {
  return {
    seal_intact: normalizeNullableBoolean(values.sealIntact),
    risk_note: values.riskNote.trim(),
    hood_clean: normalizeNullableBoolean(values.hoodClean),
    flange_blocked: normalizeNullableBoolean(values.flangeBlocked),
    boat_contamination_level: normalizeNullableBoolean(values.boatContaminationLevel),
    tube_contamination_level: normalizeNullableBoolean(values.tubeContaminationLevel),
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
      .map((item) => ({ ...item, ...createPrecursorMethodPatch(item.method) }))
      .filter(
        (item) =>
          hasAnyValue({
            species: item.species,
            brand: item.brand,
            concentration: item.concentration,
            concentrationUnit: item.concentrationUnit,
            method: item.method,
            meltingTemperatureC: item.meltingTemperatureC,
            spinSpeedRpm: item.spinSpeedRpm,
            spinTimeS: item.spinTimeS,
            preSpinSpeedRpm: item.preSpinSpeedRpm,
            preSpinTimeS: item.preSpinTimeS,
            preparationTimeMin: item.preparationTimeMin,
            massMg: item.massMg,
            batchNo: item.batchNo,
          }) || hasSourcePayload(item.sourcePayload),
      )
      .map((item) =>
        mergePayloadFields(
          item.sourcePayload,
          removeNullEntries({
            species: normalizeNullableString(item.species),
            brand: normalizeNullableString(item.brand),
            concentration: normalizeNumberLike(item.concentration),
            concentration_unit: normalizeNullableString(item.concentrationUnit),
            method: normalizeNullableString(item.method),
            melting_temperature_C: normalizeNumberLike(item.meltingTemperatureC),
            spin_speed_rpm: normalizeNumberLike(item.spinSpeedRpm),
            spin_time_s: normalizeNumberLike(item.spinTimeS),
            pre_spin_speed_rpm: normalizeNumberLike(item.preSpinSpeedRpm),
            pre_spin_time_s: normalizeNumberLike(item.preSpinTimeS),
            preparation_time_min: normalizeNumberLike(item.preparationTimeMin),
            mass_mg: normalizeNumberLike(item.massMg),
            batch_no: normalizeNullableString(item.batchNo),
          }),
          [
            "role",
            "type",
            "species",
            "brand",
            "concentration",
            "concentration_unit",
            "method",
            "melting_temperature_C",
            "spin_speed_rpm",
            "spin_time_s",
            "pre_spin_speed_rpm",
            "pre_spin_time_s",
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
        (item.role === "top" || item.role === "bottom") && hasSubstrateEditableValue(item),
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
            batch_no: normalizeNullableString(item.batchNo),
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
            "batch_no",
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
  const zonesCount = parsePositiveIntegerValue(values.furnaceInfo.zonesCount);
  const initialTemperaturesC = Object.fromEntries(
    values.zones.map((zone) => [zone.zoneKey, normalizeNumberLike(zone.startTemperatureC)]),
  );

  return {
    furnace_info: {
      zones_count: zonesCount,
      ...(values.furnaceInfo.model ? { model: values.furnaceInfo.model } : {}),
      initial_temperatures_C: initialTemperaturesC,
    },
    placements: values.placements
      .filter((p) => p.precursorIndex.trim() || p.zoneKey || p.positionCm.trim() || p.note.trim())
      .map((p) => {
        const precursorIndex = parseInt(p.precursorIndex, 10);
        return {
          precursor_index: Number.isFinite(precursorIndex) ? precursorIndex : null,
          zone_key: p.zoneKey || null,
          position_cm: normalizeNumberLike(p.positionCm),
          note: p.note,
        };
      }),
    zones: values.zones.map((zone) => ({
      zone_key: zone.zoneKey,
      temperature_program: segmentsToTemperatureNodes(zone.startTemperatureC, zone.segments),
      note: zone.note,
    })),
  };
}

export function mergeFurnaceProgramPayload(
  _existingPayload: Record<string, unknown> | undefined,
  values: FurnaceProgramValues,
) {
  return toFurnaceProgramPayload(values);
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
              flowSccm: component.flowSccm,
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
                  flowSccm: component.flowSccm,
                }) || hasSourcePayload(component.sourcePayload),
              payload: mergePayloadFields(
                component.sourcePayload,
                removeNullEntries({
                  name: normalizeNullableString(component.gas),
                  flow_sccm: normalizeNumberLike(component.flowSccm),
                }),
                ["name", "flow_sccm", "gas", "fraction", "ratio_percent"],
              ),
            }))
            .filter((component) => component.keep)
            .map((component) => component.payload);

          const validComponentFlows = segment.components
            .map((c) => Number(c.flowSccm))
            .filter((v) => Number.isFinite(v) && v > 0);
          const totalComponentFlow = validComponentFlows.reduce((sum, v) => sum + v, 0);

          const computedSegmentFlow = componentPayloads.length > 0 && totalComponentFlow > 0
            ? totalComponentFlow
            : normalizeNumberLike(segment.flowSccm);

          for (const cp of componentPayloads) {
            const compFlow = cp.flow_sccm as number | null;
            if (typeof compFlow === "number" && totalComponentFlow > 0) {
              cp.fraction = Math.round((compFlow / totalComponentFlow) * 1000000) / 1000000;
              cp.ratio_percent = Math.round((compFlow / totalComponentFlow) * 10000) / 100;
            } else {
              cp.fraction = null;
              cp.ratio_percent = null;
            }
          }

          return mergePayloadFields(
            segment.sourcePayload,
            removeNullEntries({
              stage: normalizeNullableString(segment.stage),
              gas: normalizeNullableString(segment.gas),
              start_min: normalizeNumberLike(segment.startMin),
              end_min: normalizeNumberLike(segment.endMin),
              flow_sccm: computedSegmentFlow,
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

function toCharacterizationPayload(values: CharacterizationValues) {
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
