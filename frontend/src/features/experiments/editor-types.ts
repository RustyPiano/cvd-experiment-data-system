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

export type FurnaceInfoValues = {
  zonesCount: string;
  model: string;
  initialTemperaturesC: Record<string, string>;
};

export type FurnaceQuickProgramValues = {
  startTemperatureC: string;
  rampDurationMin: string;
  holdDurationMin: string;
  coolDurationMin: string;
  endTemperatureC: string;
  targetTemperaturesC: Record<string, string>;
  isCustom: boolean;
};

export type FurnacePlacementValues = PayloadBackedValue & {
  precursorIndex: string;
  zoneKey: string;
  positionCm: string;
  note: string;
};

export type FurnaceTemperatureNodeValues = PayloadBackedValue & {
  timeMin: string;
  temperatureC: string;
  note: string;
};

export type FurnaceZoneValues = PayloadBackedValue & {
  zoneKey: string;
  temperatureProgram: FurnaceTemperatureNodeValues[];
  note: string;
};

export type FurnaceProgramValues = {
  furnaceInfo: FurnaceInfoValues;
  quickProgram?: FurnaceQuickProgramValues;
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

function parseNullableInteger(value: string, label: string): NumberParseResult {
  const result = parseNullableNumber(value, label);
  if (!result.ok || result.value === null) {
    return result;
  }

  if (!Number.isInteger(result.value)) {
    return { ok: false, message: `${label} 必须是整数` };
  }

  return result;
}

function normalizeNumberLike(value: string) {
  const result = parseNullableNumber(value, "数值");
  return result.ok ? result.value : null;
}

function normalizeIntegerLike(value: string) {
  const result = parseNullableInteger(value, "数值");
  return result.ok ? result.value : null;
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
      appendNumberValidationError(
        errors,
        sectionKey,
        `items.${index}.concentration`,
        item.concentration,
        `浓度 ${rowNumber}`,
      );
      appendNumberValidationError(
        errors,
        sectionKey,
        `items.${index}.meltingTemperatureC`,
        item.meltingTemperatureC,
        `熔融温度 ${rowNumber}`,
      );
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
        `items.${index}.preSpinSpeedRpm`,
        item.preSpinSpeedRpm,
        `预旋涂转速 ${rowNumber}`,
      );
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
    const zonesCount = parseInt(values.furnaceProgram.furnaceInfo.zonesCount, 10);
    if (Number.isNaN(zonesCount) || zonesCount < 1) {
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
      let previousTime: number | null = null;
      zone.temperatureProgram.forEach((node, nodeIndex) => {
        appendNumberValidationError(
          errors,
          sectionKey,
          `zones.${zoneIndex}.temperatureProgram.${nodeIndex}.timeMin`,
          node.timeMin,
          `时间 温区${zoneIndex + 1}-${nodeIndex + 1}`,
        );
        appendNumberValidationError(
          errors,
          sectionKey,
          `zones.${zoneIndex}.temperatureProgram.${nodeIndex}.temperatureC`,
          node.temperatureC,
          `温度 温区${zoneIndex + 1}-${nodeIndex + 1}`,
        );
        const timeResult = parseNullableNumber(node.timeMin, "时间");
        if (timeResult.ok && timeResult.value !== null) {
          if (timeResult.value < 0) {
            errors.push({
              sectionKey,
              fieldPath: `zones.${zoneIndex}.temperatureProgram.${nodeIndex}.timeMin`,
              message: `温区 ${zoneIndex + 1} 的时间必须非负`,
            });
          }
          if (previousTime !== null && timeResult.value <= previousTime) {
            errors.push({
              sectionKey,
              fieldPath: `zones.${zoneIndex}.temperatureProgram.${nodeIndex}.timeMin`,
              message: `温区 ${zoneIndex + 1} 的时间节点必须递增`,
            });
          }
          previousTime = timeResult.value;
        }
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
  const zonesCount = parseInt(zonesCountValue, 10);
  return Number.isFinite(zonesCount) && zonesCount > 0 ? getFurnaceZoneKeys(zonesCount) : [];
}

function formatMinuteValue(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

function parseMinuteValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function durationBetween(startValue: string, endValue: string) {
  const start = parseMinuteValue(startValue);
  const end = parseMinuteValue(endValue);
  if (start === null || end === null) {
    return "";
  }

  return formatMinuteValue(end - start);
}

function defaultFurnaceQuickProgram(zoneKeys: string[]): FurnaceQuickProgramValues {
  return {
    startTemperatureC: "25",
    rampDurationMin: "30",
    holdDurationMin: "15",
    coolDurationMin: "50",
    endTemperatureC: "25",
    targetTemperaturesC: Object.fromEntries(zoneKeys.map((zoneKey) => [zoneKey, ""])),
    isCustom: false,
  };
}

function getFurnaceTargetTemperature(zone: FurnaceZoneValues) {
  return zone.temperatureProgram[1]?.temperatureC ?? "";
}

export function createQuickProgramFromZones(
  zones: FurnaceZoneValues[],
  zoneKeys: string[],
): FurnaceQuickProgramValues {
  const defaults = defaultFurnaceQuickProgram(zoneKeys);
  if (zones.length === 0) {
    return defaults;
  }

  const zonesByKey = new Map(zones.map((zone) => [zone.zoneKey, zone]));
  const firstZone = zonesByKey.get(zoneKeys[0]) ?? zones[0];
  const firstProgram = firstZone.temperatureProgram;
  const startNode = firstProgram[0];
  const rampNode = firstProgram[1];
  const holdNode = firstProgram[2];
  const coolNode = firstProgram[3];
  const endNode = firstProgram[firstProgram.length - 1];

  const targetTemperaturesC: Record<string, string> = {};
  for (const zoneKey of zoneKeys) {
    const zone = zonesByKey.get(zoneKey);
    targetTemperaturesC[zoneKey] = zone ? getFurnaceTargetTemperature(zone) : "";
  }

  const expectedTimes = firstProgram.map((node) => node.timeMin);
  const isCustom = zoneKeys.some((zoneKey) => {
    const zone = zonesByKey.get(zoneKey);
    if (!zone || zone.temperatureProgram.length !== firstProgram.length) {
      return true;
    }

    return zone.temperatureProgram.some((node, index) => node.timeMin !== expectedTimes[index]);
  });

  return {
    startTemperatureC: startNode?.temperatureC || defaults.startTemperatureC,
    rampDurationMin: rampNode ? durationBetween(startNode?.timeMin ?? "0", rampNode.timeMin) : "",
    holdDurationMin: holdNode && rampNode ? durationBetween(rampNode.timeMin, holdNode.timeMin) : "",
    coolDurationMin: coolNode && holdNode ? durationBetween(holdNode.timeMin, coolNode.timeMin) : "",
    endTemperatureC: endNode?.temperatureC || defaults.endTemperatureC,
    targetTemperaturesC,
    isCustom,
  };
}

function appendQuickProgramNode(
  nodes: FurnaceTemperatureNodeValues[],
  currentTime: number | null,
  durationValue: string,
  temperatureC: string,
  note: string,
  required: boolean,
) {
  const trimmedDuration = durationValue.trim();
  const duration = parseMinuteValue(trimmedDuration);
  if (!trimmedDuration) {
    if (required) {
      nodes.push({ timeMin: "", temperatureC, note });
    }
    return required ? null : currentTime;
  }

  if (duration === null) {
    nodes.push({ timeMin: trimmedDuration, temperatureC, note });
    return null;
  }

  const nextTime = currentTime === null ? duration : currentTime + duration;
  nodes.push({ timeMin: formatMinuteValue(nextTime), temperatureC, note });
  return nextTime;
}

export function buildFurnaceZonesFromQuickProgram(
  zoneKeys: string[],
  quickProgram: FurnaceQuickProgramValues,
  existingZones: FurnaceZoneValues[] = [],
): FurnaceZoneValues[] {
  const zonesByKey = new Map(existingZones.map((zone) => [zone.zoneKey, zone]));

  return zoneKeys.map((zoneKey) => {
    const existingZone = zonesByKey.get(zoneKey);
    const targetTemperature = quickProgram.targetTemperaturesC[zoneKey] ?? "";
    const nodes: FurnaceTemperatureNodeValues[] = [
      { timeMin: "0", temperatureC: quickProgram.startTemperatureC, note: "起始" },
    ];
    let currentTime: number | null = 0;

    currentTime = appendQuickProgramNode(
      nodes,
      currentTime,
      quickProgram.rampDurationMin,
      targetTemperature,
      "升温结束",
      true,
    );
    currentTime = appendQuickProgramNode(
      nodes,
      currentTime,
      quickProgram.holdDurationMin,
      targetTemperature,
      "恒温结束",
      false,
    );
    appendQuickProgramNode(
      nodes,
      currentTime,
      quickProgram.coolDurationMin,
      quickProgram.endTemperatureC,
      "降温结束",
      false,
    );

    return {
      sourcePayload: existingZone?.sourcePayload,
      zoneKey,
      note: existingZone?.note ?? "",
      temperatureProgram: nodes,
    };
  });
}

export function syncFurnaceProgramZonesCount(
  value: FurnaceProgramValues,
  newZonesCountStr: string,
): FurnaceProgramValues {
  const newCount = parseInt(newZonesCountStr, 10);
  if (!Number.isFinite(newCount) || newCount < 1) {
    return {
      ...value,
      furnaceInfo: { ...value.furnaceInfo, zonesCount: newZonesCountStr },
    };
  }

  const newZoneKeys = getFurnaceZoneKeys(newCount);
  const currentZoneKeys = getValidFurnaceZoneKeys(value.furnaceInfo.zonesCount);
  const currentQuickProgram =
    value.quickProgram ?? createQuickProgramFromZones(value.zones, currentZoneKeys);
  const targetTemperaturesC: Record<string, string> = {};
  for (const zoneKey of newZoneKeys) {
    targetTemperaturesC[zoneKey] = currentQuickProgram.targetTemperaturesC[zoneKey] ?? "";
  }

  const nextQuickProgram: FurnaceQuickProgramValues = {
    ...currentQuickProgram,
    targetTemperaturesC,
  };
  const newZoneKeySet = new Set(newZoneKeys);

  return {
    furnaceInfo: {
      ...value.furnaceInfo,
      zonesCount: newZonesCountStr,
      initialTemperaturesC: Object.fromEntries(
        newZoneKeys.map((zoneKey) => [zoneKey, nextQuickProgram.startTemperatureC]),
      ),
    },
    quickProgram: nextQuickProgram,
    placements: value.placements.map((placement) =>
      placement.zoneKey && !newZoneKeySet.has(placement.zoneKey)
        ? { ...placement, zoneKey: "" }
        : placement,
    ),
    zones: buildFurnaceZonesFromQuickProgram(newZoneKeys, nextQuickProgram, value.zones),
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

export function createEmptyFurnaceTemperatureNode(): FurnaceTemperatureNodeValues {
  return {
    timeMin: "",
    temperatureC: "",
    note: "",
  };
}

export function createEmptyFurnaceZone(zoneKey = ""): FurnaceZoneValues {
  return {
    zoneKey,
    temperatureProgram: [],
    note: "",
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

function findPrecursorIndexBySpecies(
  precursorItems: Record<string, unknown>[],
  species: unknown,
): string {
  const speciesString = asString(species).trim();
  if (!speciesString) {
    return "";
  }

  const index = precursorItems.findIndex((item) => asString(item.species).trim() === speciesString);
  return index >= 0 ? String(index) : "";
}

function toFurnacePlacements(
  furnaceProgram: Record<string, unknown>,
  precursorItems: Record<string, unknown>[],
): FurnacePlacementValues[] {
  const placements = asObjectArray(furnaceProgram.placements);
  if (placements.length > 0) {
    return placements.map((placement) => ({
      sourcePayload: placement,
      precursorIndex: asString(placement.precursor_index),
      zoneKey: asString(placement.zone_key),
      positionCm: asString(placement.position_cm),
      note: asString(placement.note),
    }));
  }

  return asObjectArray(furnaceProgram.precursors).map((legacy) => ({
    sourcePayload: legacy,
    precursorIndex: findPrecursorIndexBySpecies(precursorItems, legacy.material),
    zoneKey: "",
    positionCm: asString(legacy.position_cm),
    note: asString(legacy.note),
  }));
}

function zoneSortKey(zoneKey: string) {
  const match = /^zone_(\d+)$/.exec(zoneKey);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function getDeclaredZoneKeysFromPayload(
  furnaceProgram: Record<string, unknown>,
  furnaceInfo: Record<string, unknown>,
) {
  const rawZonesCount = Number(asString(furnaceInfo.zones_count));
  if (Number.isInteger(rawZonesCount) && rawZonesCount > 0) {
    return getFurnaceZoneKeys(rawZonesCount);
  }

  const zoneKeys = new Set<string>();
  for (const key of Object.keys(asRecord(furnaceInfo.initial_temperatures_C))) {
    zoneKeys.add(key);
  }
  for (const zone of asObjectArray(furnaceProgram.zones)) {
    const zoneKey = asString(zone.zone_key);
    if (zoneKey) {
      zoneKeys.add(zoneKey);
    }
  }
  for (const step of asObjectArray(furnaceProgram.steps)) {
    for (const key of Object.keys(asRecord(step.temperatures_C))) {
      zoneKeys.add(key);
    }
  }

  return [...zoneKeys].sort((a, b) => zoneSortKey(a) - zoneSortKey(b) || a.localeCompare(b));
}

function toFurnaceZones(
  furnaceProgram: Record<string, unknown>,
  furnaceInfo: Record<string, unknown>,
): FurnaceZoneValues[] {
  const zones = asObjectArray(furnaceProgram.zones);
  if (zones.length > 0) {
    return zones.map((zone, index) => ({
      sourcePayload: zone,
      zoneKey: asString(zone.zone_key) || `zone_${index + 1}`,
      note: asString(zone.note),
      temperatureProgram: asObjectArray(zone.temperature_program).map((node) => ({
        sourcePayload: node,
        timeMin: asString(node.time_min),
        temperatureC: asString(node.temperature_C),
        note: asString(node.note),
      })),
    }));
  }

  const steps = asObjectArray(furnaceProgram.steps);
  const zoneKeys = getDeclaredZoneKeysFromPayload(furnaceProgram, furnaceInfo);
  const initialTemperatures = asRecord(furnaceInfo.initial_temperatures_C);

  return zoneKeys.map((zoneKey) => {
    let elapsedMin = 0;
    const temperatureProgram: FurnaceTemperatureNodeValues[] = [];
    const initialTemperature = asString(initialTemperatures[zoneKey]);
    if (initialTemperature) {
      temperatureProgram.push({
        timeMin: "0",
        temperatureC: initialTemperature,
        note: "",
      });
    }

    for (const step of steps) {
      const duration = Number(asString(step.duration_min));
      if (Number.isFinite(duration)) {
        elapsedMin += duration;
      }
      const temperatures = asRecord(step.temperatures_C);
      if (!(zoneKey in temperatures)) {
        continue;
      }
      temperatureProgram.push({
        timeMin: String(elapsedMin),
        temperatureC: asString(temperatures[zoneKey]),
        note: asString(step.note),
      });
    }

    return {
      zoneKey,
      note: "",
      temperatureProgram,
    };
  });
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
              preSpinSpeedRpm: asString(item.pre_spin_speed_rpm),
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
        treatmentMethod: asString(item.treatment_method),
        positionMm: asString(item.position_mm),
        treatmentTemperatureC: asString(asRecord(item.treatment_params).temperature_C),
        treatmentDurationMin: asString(asRecord(item.treatment_params).duration_min),
        treatmentPowerW: asString(asRecord(item.treatment_params).power_W),
        treatmentGas: asString(asRecord(item.treatment_params).gas),
      })),
    },
    furnaceProgram: (() => {
      const fp = asRecord(furnaceProgram);
      const info = asRecord(fp.furnace_info);
      const initialTempsRaw = asRecord(info.initial_temperatures_C);
      const initialTemperaturesC: Record<string, string> = {};
      for (const [key, value] of Object.entries(initialTempsRaw)) {
        initialTemperaturesC[key] = asString(value);
      }
      const zones = toFurnaceZones(fp, info);
      const zoneKeys = getDeclaredZoneKeysFromPayload(fp, info);
      return {
        furnaceInfo: {
          zonesCount: asString(info.zones_count) || "2",
          model: asString(info.model),
          initialTemperaturesC,
        },
        quickProgram: createQuickProgramFromZones(zones, zoneKeys),
        placements: toFurnacePlacements(fp, precursorItems),
        zones,
      };
    })(),
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
            species: normalizeNullableString(item.species),
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
            "species",
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
  const zonesCount = normalizeIntegerLike(values.furnaceInfo.zonesCount) ?? 2;
  const initialTemperaturesC: Record<string, number | null> = {};
  for (const zone of values.zones) {
    const firstNode = zone.temperatureProgram[0];
    initialTemperaturesC[zone.zoneKey] = firstNode ? normalizeNumberLike(firstNode.temperatureC) : null;
  }

  return {
    furnace_info: removeNullEntries({
      zones_count: zonesCount,
      model: normalizeNullableString(values.furnaceInfo.model),
      initial_temperatures_C: initialTemperaturesC,
    }),
    placements: values.placements
      .filter(
        (placement) =>
          hasAnyValue({
            precursorIndex: placement.precursorIndex,
            zoneKey: placement.zoneKey,
            positionCm: placement.positionCm,
            note: placement.note,
          }) || hasSourcePayload(placement.sourcePayload),
      )
      .map((placement) =>
        mergePayloadFields(
          placement.sourcePayload,
          removeNullEntries({
            precursor_index: normalizeIntegerLike(placement.precursorIndex),
            zone_key: normalizeNullableString(placement.zoneKey),
            position_cm: normalizeNumberLike(placement.positionCm),
            note: normalizeNullableString(placement.note),
          }),
          ["precursor_index", "zone_key", "position_cm", "note", "material", "mass_mg"],
        ),
      ),
    zones: values.zones.map((zone) =>
      mergePayloadFields(
        zone.sourcePayload,
        removeNullEntries({
          zone_key: normalizeNullableString(zone.zoneKey),
          temperature_program: zone.temperatureProgram
            .map((node, index) => {
              const keep =
                node.timeMin.trim().length > 0 ||
                node.temperatureC.trim().length > 0 ||
                node.note.trim().length > 0 ||
                hasSourcePayload(node.sourcePayload);

              return {
                keep,
                payload: mergePayloadFields(
                  node.sourcePayload,
                  removeNullEntries({
                    node_index: index + 1,
                    time_min: normalizeNumberLike(node.timeMin),
                    temperature_C: normalizeNumberLike(node.temperatureC),
                    note: normalizeNullableString(node.note),
                  }),
                  ["node_index", "time_min", "temperature_C", "note"],
                ),
              };
            })
            .filter((node) => node.keep)
            .map((node) => node.payload),
          note: normalizeNullableString(zone.note),
        }),
        ["zone_key", "temperature_program", "note", "zone_index", "precursor_placed"],
      ),
    ),
  };
}

export function mergeFurnaceProgramPayload(
  existingPayload: Record<string, unknown> | undefined,
  values: FurnaceProgramValues,
) {
  return mergePayloadFields(existingPayload, toFurnaceProgramPayload(values), [
    "furnace_info",
    "placements",
    "precursors",
    "zones",
    "steps",
  ]);
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
