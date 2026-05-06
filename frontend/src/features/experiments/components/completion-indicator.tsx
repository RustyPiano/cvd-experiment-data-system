import type { ExperimentValidationIssue } from "../../../shared/types/api";

export type ModuleCompletionStatus =
  | { state: "empty"; percent: number }
  | { state: "partial"; percent: number }
  | { state: "complete"; percent: number }
  | { state: "warning"; percent: number; warnings: number }
  | { state: "error"; percent: number; errors: number };

export type CompletionValidationIssue = ExperimentValidationIssue & {
  severity?: "error" | "warning";
};

export type CompletionSummary = {
  percent: number;
  completedCount: number;
  totalCount: number;
  blockingCount: number;
  warningCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(isFilled);
  }

  if (typeof value === "object") {
    return Object.values(value).some(isFilled);
  }

  return false;
}

function getValue(payload: Record<string, unknown>, keys: string[]) {
  const matchingKey = keys.find((key) => key in payload);
  return matchingKey ? payload[matchingKey] : undefined;
}

function toStepStatus(percent: number): ModuleCompletionStatus {
  if (percent <= 0) {
    return { state: "empty", percent: 0 };
  }

  if (percent >= 100) {
    return { state: "complete", percent: 100 };
  }

  return { state: "partial", percent };
}

function scoreBooleanSteps(completed: number, total: number) {
  if (completed <= 0) {
    return 0;
  }

  if (completed >= total) {
    return 100;
  }

  return 50;
}

function isPositiveNumberLike(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value === "string") {
    const numericValue = Number(value.trim());
    return Number.isFinite(numericValue) && numericValue > 0;
  }

  return false;
}

function getDeclaredFurnaceZoneKeys(payload: Record<string, unknown>) {
  const furnaceInfo = asRecord(payload.furnace_info);
  const rawZonesCount = getValue(furnaceInfo, ["zones_count", "zonesCount"]);
  const zonesCount =
    typeof rawZonesCount === "number" ? rawZonesCount : Number(String(rawZonesCount ?? "").trim());

  if (!Number.isFinite(zonesCount) || zonesCount < 1) {
    return [];
  }

  return Array.from({ length: Math.floor(zonesCount) }, (_, index) => `zone_${index + 1}`);
}

function baseCompletion(moduleKey: string, payload: Record<string, unknown>) {
  if (moduleKey === "basic_info") {
    return scoreBooleanSteps(
      [
        getValue(payload, ["experiment_date", "experimentDate"]),
        getValue(payload, ["material_system", "materialSystem"]),
      ].filter(isFilled).length,
      2,
    );
  }

  if (moduleKey === "environment") {
    return scoreBooleanSteps(
      [
        getValue(payload, ["indoor_temperature_C", "indoorTemperatureC"]),
        getValue(payload, ["indoor_humidity_percent", "indoorHumidityPercent"]),
      ].filter(isFilled).length,
      2,
    );
  }

  if (moduleKey === "precheck") {
    const requiredFields = [
      ["seal_intact", "sealIntact"],
      ["hood_clean", "hoodClean"],
      ["flange_blocked", "flangeBlocked"],
      ["boat_contamination_level", "boatContaminationLevel"],
      ["tube_contamination_level", "tubeContaminationLevel"],
    ];
    return scoreBooleanSteps(
      requiredFields.filter((keys) => isFilled(getValue(payload, keys))).length,
      requiredFields.length,
    );
  }

  if (moduleKey === "precursors") {
    const items = asRecordArray(payload.items);
    if (!items.length) {
      return 0;
    }

    return items.every((item) => isFilled(item.species) && isFilled(item.method)) ? 100 : 50;
  }

  if (moduleKey === "substrates") {
    const items = asRecordArray(payload.items);
    if (!items.length) {
      return 0;
    }

    return items.every((item) => isFilled(item.type) && isFilled(item.role)) ? 100 : 50;
  }

  if (moduleKey === "furnace_program") {
    const steps = asRecordArray(payload.steps);
    if (!steps.length) {
      return 0;
    }

    const declaredZoneKeys = getDeclaredFurnaceZoneKeys(payload);
    const hasValidDuration = steps.every(
      (step) => isPositiveNumberLike(step.duration_min),
    );
    const hasValidTemps = steps.every((step) => {
      const temps = asRecord(step.temperatures_C);
      if (declaredZoneKeys.length > 0) {
        return declaredZoneKeys.every((zoneKey) => isFilled(temps[zoneKey]) || isPositiveNumberLike(temps[zoneKey]));
      }

      return Object.keys(temps).length > 0 && Object.values(temps).every((v) => isFilled(v) || isPositiveNumberLike(v));
    });
    return hasValidDuration && hasValidTemps ? 100 : 50;
  }

  if (moduleKey === "gas_program") {
    const segments = asRecordArray(payload.segments);
    if (!segments.length) {
      return 0;
    }

    return segments.every((segment) => {
      if (isPositiveNumberLike(segment.flow_sccm ?? segment.flowSccm)) {
        return true;
      }
      const components = asRecordArray(segment.components);
      return components.length > 0 && components.some((c) => isPositiveNumberLike(c.flow_sccm));
    })
      ? 100
      : 50;
  }

  if (moduleKey === "process_observation") {
    return isFilled(payload) ? 100 : 0;
  }

  if (moduleKey === "characterization") {
    return asRecordArray(payload.methods).some((method) => method.enabled === true) ? 100 : 0;
  }

  if (moduleKey === "result_summary") {
    const qualityLabel = getValue(payload, ["quality_label", "qualityLabel"]);
    return isFilled(qualityLabel) && qualityLabel !== "unknown" ? 100 : 0;
  }

  return 0;
}

function isInRange(value: unknown, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
}

function countFrontendWarnings(moduleKey: string, payload: Record<string, unknown>) {
  if (moduleKey === "environment") {
    const temperature = getValue(payload, ["indoor_temperature_C", "indoorTemperatureC"]);
    const humidity = getValue(payload, ["indoor_humidity_percent", "indoorHumidityPercent"]);
    let count = 0;
    if (isFilled(temperature) && !isInRange(temperature, 15, 35)) {
      count += 1;
    }
    if (isFilled(humidity) && !isInRange(humidity, 0, 100)) {
      count += 1;
    }
    return count;
  }

  if (moduleKey === "precheck") {
    const sealIntact = getValue(payload, ["seal_intact", "sealIntact"]);
    const riskNote = getValue(payload, ["risk_note", "riskNote"]);
    const boatContaminationLevel = getValue(payload, [
      "boat_contamination_level",
      "boatContaminationLevel",
    ]);
    const tubeContaminationLevel = getValue(payload, [
      "tube_contamination_level",
      "tubeContaminationLevel",
    ]);
    let count = 0;
    if (isFilled(sealIntact) && sealIntact === false && !isFilled(riskNote)) {
      count += 1;
    }
    if (isFilled(boatContaminationLevel) && boatContaminationLevel === true) {
      count += 1;
    }
    if (isFilled(tubeContaminationLevel) && tubeContaminationLevel === true) {
      count += 1;
    }
    return count;
  }

  if (moduleKey === "result_summary") {
    const qualityLabel = getValue(payload, ["quality_label", "qualityLabel"]);
    if (isFilled(qualityLabel) && qualityLabel === "unknown") {
      return 1;
    }
  }

  return 0;
}

function issuesForModule(moduleKey: string, validationIssues: CompletionValidationIssue[]) {
  return validationIssues.filter((issue) => issue.module_key === moduleKey);
}

export function computeModuleCompletion(
  moduleKey: string,
  payload: Record<string, unknown> | null | undefined,
  validationErrors: CompletionValidationIssue[] = [],
): ModuleCompletionStatus {
  const safePayload = asRecord(payload);
  const percent = baseCompletion(moduleKey, safePayload);
  const moduleIssues = issuesForModule(moduleKey, validationErrors);
  const hasApiIssues = moduleIssues.length > 0;

  if (hasApiIssues) {
    const errorCount = moduleIssues.filter((issue) => issue.severity !== "warning").length;
    if (errorCount > 0) {
      return { state: "error", percent, errors: errorCount };
    }
    const warningCount = moduleIssues.filter((issue) => issue.severity === "warning").length;
    if (warningCount > 0) {
      return { state: "warning", percent, warnings: warningCount };
    }
    return toStepStatus(percent);
  }

  const frontendWarningCount = countFrontendWarnings(moduleKey, safePayload);
  if (frontendWarningCount > 0) {
    return { state: "warning", percent, warnings: frontendWarningCount };
  }

  return toStepStatus(percent);
}
