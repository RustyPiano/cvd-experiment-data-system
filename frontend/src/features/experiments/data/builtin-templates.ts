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
      zones: [
        {
          zone_key: "zone_1",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 35, temperature_C: 650, note: "升温结束" },
            { node_index: 3, time_min: 50, temperature_C: 650, note: "恒温结束" },
            { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
        {
          zone_key: "zone_2",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 35, temperature_C: 780, note: "升温结束" },
            { node_index: 3, time_min: 50, temperature_C: 780, note: "恒温结束" },
            { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
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
      zones: [
        {
          zone_key: "zone_1",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 40, temperature_C: 750, note: "升温结束" },
            { node_index: 3, time_min: 55, temperature_C: 750, note: "恒温结束" },
            { node_index: 4, time_min: 110, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
        {
          zone_key: "zone_2",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 40, temperature_C: 850, note: "升温结束" },
            { node_index: 3, time_min: 55, temperature_C: 850, note: "恒温结束" },
            { node_index: 4, time_min: 110, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
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
      zones: [
        {
          zone_key: "zone_1",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 30, temperature_C: 95, note: "升温结束" },
            { node_index: 3, time_min: 55, temperature_C: 95, note: "恒温结束" },
            { node_index: 4, time_min: 125, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
        {
          zone_key: "zone_2",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 30, temperature_C: 1030, note: "升温结束" },
            { node_index: 3, time_min: 55, temperature_C: 1030, note: "恒温结束" },
            { node_index: 4, time_min: 125, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
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
      zones: [
        {
          zone_key: "zone_1",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 30, temperature_C: null, note: "升温结束" },
            { node_index: 3, time_min: 60, temperature_C: null, note: "恒温结束" },
            { node_index: 4, time_min: 90, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
        {
          zone_key: "zone_2",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 30, temperature_C: null, note: "升温结束" },
            { node_index: 3, time_min: 60, temperature_C: null, note: "恒温结束" },
            { node_index: 4, time_min: 90, temperature_C: 25, note: "降温结束" },
          ],
          note: "",
        },
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
