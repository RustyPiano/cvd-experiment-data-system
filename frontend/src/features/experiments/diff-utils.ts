import { editorSectionKeys, type EditorSectionKey } from "./editor-types";

export type DiffStatus = "added" | "modified" | "removed" | "same";

export type DiffRow = {
  key: string;
  path: string;
  label: string;
  sourceValue: unknown;
  currentValue: unknown;
  status: DiffStatus;
};

export type ModuleDiff = {
  moduleKey: EditorSectionKey;
  moduleLabel: string;
  status: DiffStatus;
  rows: DiffRow[];
};

export type ModulePayloadDiffInput = {
  sourceModules: Partial<Record<EditorSectionKey | string, Record<string, unknown>>>;
  currentModules: Partial<Record<EditorSectionKey | string, Record<string, unknown>>>;
};

const moduleLabels: Record<EditorSectionKey, string> = {
  basic_info: "基础信息",
  environment: "环境条件",
  precheck: "预检查",
  precursors: "前驱体",
  substrates: "基底",
  furnace_program: "炉温程序",
  gas_program: "气体程序",
  process_observation: "过程观察",
  characterization: "表征结果",
  result_summary: "结果总结",
};

const fieldLabels: Record<string, string> = {
  abnormal_events: "异常事件",
  abnormal_note: "异常说明",
  batch_no: "批次",
  boat_contamination_level: "瓷舟污染",
  brand: "品牌",
  color_change: "颜色变化",
  components: "组分",
  concentration: "浓度",
  concentration_unit: "浓度单位",
  duration_min: "持续时间 (min)",
  is_hold: "恒温保持",
  enabled: "启用",
  end_min: "结束时间 (min)",
  excitation_nm: "激发波长 (nm)",
  experiment_date: "实验日期",
  experiment_type: "实验类型",
  flange_blocked: "法兰已堵住",
  flow_sccm: "流量 (sccm)",
  gas: "气体",
  hood_clean: "通风橱已清洁",
  indoor_humidity_percent: "室内湿度 (%)",
  indoor_temperature_C: "室内温度 (C)",
  items: "条目",
  mass_mg: "质量 (mg)",
  material_system: "材料体系",
  melting_temperature_C: "熔融温度 (C)",
  method: "方法",
  methods: "表征方法",
  next_step: "下一步建议",
  note: "备注",
  objective: "实验目的",
  operator_id: "操作人",
  pre_spin_speed_rpm: "预旋涂转速 (rpm)",
  pre_washing_gas: "预清洗气体",
  preparation_time_min: "制备时间 (min)",
  quality_label: "质量评级",
  ratio_percent: "占比 (%)",
  result: "结果",
  risk_note: "风险说明",
  role: "角色",
  sample_env: "样品环境",
  seal_intact: "密封完好",
  segments: "程序段",
  size_mm: "尺寸 (mm)",
  position_mm: "相对温区位置",
  species: "种类",
  spin_speed_rpm: "旋涂转速 (rpm)",
  stage: "阶段",
  start_min: "开始时间 (min)",
  summary_result: "总结结论",
  surface_finish: "表面状态",
  temperature_C: "温度 (C)",
  temperature_program: "温度程序",
  temperatures_C: "温度",
  time_min: "时间 (min)",
  treatment_method: "处理方法",
  treatment_params: "处理参数",
  tube_contamination_level: "石英管污染",
  type: "类型",
  step_index: "步骤序号",
  step_name: "步骤名称",
  furnace_info: "炉体信息",
  zones_count: "温区数量",
  initial_temperatures_C: "初始温度",
  model: "型号",
  node_index: "节点序号",
  position_cm: "位置 (cm)",
  material: "前驱体材料",
  zone_key: "温区",
  zones: "温区程序",
};

const statusLabels: Record<DiffStatus, string> = {
  added: "新增",
  modified: "已修改",
  removed: "已删除",
  same: "相同",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullish(value: unknown) {
  return value === null || value === undefined;
}

function normalizeCollectionLabel(key: string, nextPart?: string) {
  if (key !== "items") {
    return fieldLabels[key] ?? key;
  }

  if (
    nextPart &&
    ["species", "concentration", "concentration_unit", "spin_speed_rpm", "mass_mg"].includes(
      nextPart,
    )
  ) {
    return "前驱体";
  }

  if (
    nextPart &&
    ["role", "size_mm", "treatment_method", "treatment_params", "surface_finish"].includes(
      nextPart,
    )
  ) {
    return "基底";
  }

  return fieldLabels[key] ?? key;
}

function normalizePathPart(part: string, nextPart?: string) {
  const match = part.match(/^(.+)\[(\d+)\]$/);
  if (!match) {
    return fieldLabels[part] ?? part;
  }

  const [, key, index] = match;
  const baseLabel = normalizeCollectionLabel(key, nextPart);
  return `${baseLabel} ${Number(index) + 1}`;
}

export function getFieldLabel(path: string) {
  const parts = path.split(".");
  return parts.map((part, index) => normalizePathPart(part, parts[index + 1])).join(" / ");
}

export function getModuleLabel(moduleKey: EditorSectionKey) {
  return moduleLabels[moduleKey];
}

export function getDiffStatusLabel(status: DiffStatus) {
  return statusLabels[status];
}

function valuesAreSame(sourceValue: unknown, currentValue: unknown) {
  if (isNullish(sourceValue) && isNullish(currentValue)) {
    return true;
  }

  return Object.is(sourceValue, currentValue);
}

function joinPath(parentPath: string, key: string) {
  return parentPath ? `${parentPath}.${key}` : key;
}

function compareValues(sourceValue: unknown, currentValue: unknown, path = ""): DiffRow[] {
  if (isNullish(sourceValue) && isNullish(currentValue)) {
    return [];
  }

  if (Array.isArray(sourceValue) || Array.isArray(currentValue)) {
    const sourceItems = Array.isArray(sourceValue) ? sourceValue : [];
    const currentItems = Array.isArray(currentValue) ? currentValue : [];
    const itemCount = Math.max(sourceItems.length, currentItems.length);
    const rows = Array.from({ length: itemCount }, (_, index) =>
      compareValues(sourceItems[index], currentItems[index], `${path}[${index}]`),
    ).flat();

    if (rows.length > 0 || sourceItems.length !== currentItems.length) {
      return rows;
    }

    return [
      {
        key: path,
        path,
        label: getFieldLabel(path),
        sourceValue,
        currentValue,
        status: "same",
      },
    ];
  }

  if (isRecord(sourceValue) || isRecord(currentValue)) {
    const sourceRecord = isRecord(sourceValue) ? sourceValue : {};
    const currentRecord = isRecord(currentValue) ? currentValue : {};
    const keys = Array.from(
      new Set([...Object.keys(sourceRecord), ...Object.keys(currentRecord)]),
    ).sort((a, b) => a.localeCompare(b));

    return keys.flatMap((key) =>
      compareValues(sourceRecord[key], currentRecord[key], joinPath(path, key)),
    );
  }

  const status: DiffStatus = valuesAreSame(sourceValue, currentValue)
    ? "same"
    : isNullish(sourceValue)
      ? "added"
      : isNullish(currentValue)
        ? "removed"
        : "modified";

  return [
    {
      key: path,
      path,
      label: getFieldLabel(path),
      sourceValue,
      currentValue,
      status,
    },
  ];
}

function summarizeModuleStatus(rows: DiffRow[]): DiffStatus {
  if (rows.some((row) => row.status === "modified")) {
    return "modified";
  }
  if (rows.some((row) => row.status === "added")) {
    return "added";
  }
  if (rows.some((row) => row.status === "removed")) {
    return "removed";
  }
  return "same";
}

export function buildExperimentModuleDiffs({
  sourceModules,
  currentModules,
}: ModulePayloadDiffInput): ModuleDiff[] {
  return editorSectionKeys
    .filter((moduleKey) => sourceModules[moduleKey] || currentModules[moduleKey])
    .map((moduleKey) => {
      const rows = compareValues(sourceModules[moduleKey], currentModules[moduleKey]);
      const normalizedRows =
        rows.length > 0
          ? rows
          : [
              {
                key: moduleKey,
                path: moduleKey,
                label: getModuleLabel(moduleKey),
                sourceValue: sourceModules[moduleKey],
                currentValue: currentModules[moduleKey],
                status: "same" as const,
              },
            ];

      return {
        moduleKey,
        moduleLabel: getModuleLabel(moduleKey),
        status: summarizeModuleStatus(normalizedRows),
        rows: normalizedRows,
      };
    });
}
