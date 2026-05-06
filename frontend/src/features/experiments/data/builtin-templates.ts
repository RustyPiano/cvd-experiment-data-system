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
      zones: [
        {
          zone_index: 1,
          precursor_placed: true,
          note: "MoO3 前驱体温区",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 35, temperature_C: 650 },
            { time_min: 50, temperature_C: 650 },
            { time_min: 85, temperature_C: 25 },
          ],
        },
        {
          zone_index: 2,
          precursor_placed: false,
          note: "生长基底温区",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 35, temperature_C: 780 },
            { time_min: 50, temperature_C: 780 },
            { time_min: 85, temperature_C: 25 },
          ],
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
      zones: [
        {
          zone_index: 1,
          precursor_placed: true,
          note: "WO3 前驱体温区",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 40, temperature_C: 750 },
            { time_min: 55, temperature_C: 750 },
            { time_min: 90, temperature_C: 25 },
          ],
        },
        {
          zone_index: 2,
          precursor_placed: false,
          note: "生长基底温区",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 40, temperature_C: 850 },
            { time_min: 55, temperature_C: 850 },
            { time_min: 90, temperature_C: 25 },
          ],
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
      zones: [
        {
          zone_index: 1,
          precursor_placed: true,
          note: "硼氮前驱体温区",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 30, temperature_C: 95 },
            { time_min: 55, temperature_C: 95 },
            { time_min: 80, temperature_C: 25 },
          ],
        },
        {
          zone_index: 2,
          precursor_placed: false,
          note: "催化基底温区",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 30, temperature_C: 1030 },
            { time_min: 55, temperature_C: 1030 },
            { time_min: 100, temperature_C: 25 },
          ],
        },
      ],
    },
  },
  {
    key: "blank-two-zone",
    label: "空白两区",
    moduleKey: "furnace_program",
    payload: {
      zones: [
        {
          zone_index: 1,
          precursor_placed: false,
          note: "",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 30, temperature_C: null },
            { time_min: 60, temperature_C: 25 },
          ],
        },
        {
          zone_index: 2,
          precursor_placed: false,
          note: "",
          temperature_program: [
            { time_min: 0, temperature_C: 25 },
            { time_min: 30, temperature_C: null },
            { time_min: 60, temperature_C: 25 },
          ],
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
