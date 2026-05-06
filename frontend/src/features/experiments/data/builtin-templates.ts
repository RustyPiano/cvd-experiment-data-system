export interface QuickTemplate {
  key: string;
  label: string;
  materialSystem?: string;
  moduleKey: "furnace_program" | "gas_program";
  payload: Record<string, unknown>;
}

export const BUILTIN_FURNACE_TEMPLATES: QuickTemplate[] = [
  {
    key: "mos2-standard-two-zone",
    label: "MoS2 标准两区",
    materialSystem: "MoS2",
    moduleKey: "furnace_program",
    payload: {
      furnace_info: {
        zones_count: 2,
        model: "",
        initial_temperatures_C: { zone_1: 25, zone_2: 25 },
      },
      precursors: [
        { material: "MoO3", position_cm: -15, mass_mg: 15, note: "上游温区" },
        { material: "S", position_cm: -25, mass_mg: 200, note: "硫粉上游" },
      ],
      steps: [
        { step_index: 1, step_name: "升温", duration_min: 35, is_hold: false, temperatures_C: { zone_1: 650, zone_2: 780 }, note: "" },
        { step_index: 2, step_name: "恒温沉积", duration_min: 15, is_hold: true, temperatures_C: { zone_1: 650, zone_2: 780 }, note: "" },
        { step_index: 3, step_name: "降温", duration_min: 50, is_hold: false, temperatures_C: { zone_1: 25, zone_2: 25 }, note: "" },
      ],
    },
  },
  {
    key: "ws2-standard-two-zone",
    label: "WS2 标准两区",
    materialSystem: "WS2",
    moduleKey: "furnace_program",
    payload: {
      furnace_info: {
        zones_count: 2,
        model: "",
        initial_temperatures_C: { zone_1: 25, zone_2: 25 },
      },
      precursors: [
        { material: "WO3", position_cm: -15, mass_mg: 20, note: "上游温区" },
        { material: "S", position_cm: -25, mass_mg: 200, note: "硫粉上游" },
      ],
      steps: [
        { step_index: 1, step_name: "升温", duration_min: 40, is_hold: false, temperatures_C: { zone_1: 750, zone_2: 850 }, note: "" },
        { step_index: 2, step_name: "恒温沉积", duration_min: 15, is_hold: true, temperatures_C: { zone_1: 750, zone_2: 850 }, note: "" },
        { step_index: 3, step_name: "降温", duration_min: 55, is_hold: false, temperatures_C: { zone_1: 25, zone_2: 25 }, note: "" },
      ],
    },
  },
  {
    key: "hbn-standard-two-zone",
    label: "hBN 标准两区",
    materialSystem: "hBN",
    moduleKey: "furnace_program",
    payload: {
      furnace_info: {
        zones_count: 2,
        model: "",
        initial_temperatures_C: { zone_1: 25, zone_2: 25 },
      },
      precursors: [
        { material: "硼氮前驱体", position_cm: -10, mass_mg: 50, note: "上游温区" },
      ],
      steps: [
        { step_index: 1, step_name: "升温", duration_min: 30, is_hold: false, temperatures_C: { zone_1: 95, zone_2: 1030 }, note: "" },
        { step_index: 2, step_name: "恒温沉积", duration_min: 25, is_hold: true, temperatures_C: { zone_1: 95, zone_2: 1030 }, note: "" },
        { step_index: 3, step_name: "降温", duration_min: 70, is_hold: false, temperatures_C: { zone_1: 25, zone_2: 25 }, note: "" },
      ],
    },
  },
  {
    key: "blank-two-zone",
    label: "空白两区",
    moduleKey: "furnace_program",
    payload: {
      furnace_info: {
        zones_count: 2,
        model: "",
        initial_temperatures_C: { zone_1: 25, zone_2: 25 },
      },
      precursors: [],
      steps: [
        { step_index: 1, step_name: "升温", duration_min: 30, is_hold: false, temperatures_C: { zone_1: null, zone_2: null }, note: "" },
        { step_index: 2, step_name: "恒温", duration_min: 30, is_hold: true, temperatures_C: { zone_1: null, zone_2: null }, note: "" },
        { step_index: 3, step_name: "降温", duration_min: 30, is_hold: false, temperatures_C: { zone_1: 25, zone_2: 25 }, note: "" },
      ],
    },
  },
];

export const BUILTIN_GAS_TEMPLATES: QuickTemplate[] = [
  {
    key: "ar-wash-ar-growth",
    label: "Ar 清洗 + Ar 生长",
    moduleKey: "gas_program",
    payload: {
      pre_washing_gas: "Ar",
      segments: [
        {
          stage: "purge",
          gas: "Ar",
          start_min: 0,
          end_min: 10,
          flow_sccm: 200,
          note: "装样后高流量置换管内空气",
        },
        {
          stage: "growth",
          gas: "Ar",
          start_min: 10,
          end_min: 55,
          flow_sccm: 80,
          note: "生长阶段载气",
        },
      ],
    },
  },
  {
    key: "ar-growth-only",
    label: "仅 Ar 生长",
    moduleKey: "gas_program",
    payload: {
      pre_washing_gas: "",
      segments: [
        {
          stage: "growth",
          gas: "Ar",
          start_min: 0,
          end_min: 45,
          flow_sccm: 80,
          note: "单段 Ar 载气生长",
        },
      ],
    },
  },
  {
    key: "ar-h2-growth",
    label: "Ar + H2 生长",
    moduleKey: "gas_program",
    payload: {
      pre_washing_gas: "Ar",
      segments: [
        {
          stage: "growth",
          gas: "Ar/H2",
          start_min: 0,
          end_min: 45,
          flow_sccm: 100,
          note: "还原性气氛生长",
          components: [
            { name: "Ar", flow_sccm: 95 },
            { name: "H2", flow_sccm: 5 },
          ],
        },
      ],
    },
  },
];
