import { Button, Card, Form, Input, InputNumber, Select, Space, Switch } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";

import { VocabularyCombobox } from "../experiments/components/vocabulary-combobox";
import type { VocabularySelectOption } from "../experiments/editor-types";

export type RecipeModuleKey =
  | "precursors"
  | "substrates"
  | "furnace_program"
  | "gas_program"
  | "characterization";

export type RecipeSectionEditorProps = {
  moduleKey: RecipeModuleKey;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
};

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function updateList(
  value: Record<string, unknown>,
  listKey: string,
  updater: (items: Record<string, unknown>[]) => Record<string, unknown>[],
): Record<string, unknown> {
  return { ...value, [listKey]: updater(asObjectArray(value[listKey])) };
}

const SUBSTRATE_ROLE_CONFIGS = [
  { role: "top", title: "上基底" },
  { role: "bottom", title: "下基底" },
];
const SUBSTRATE_ROLE_SET = new Set(SUBSTRATE_ROLE_CONFIGS.map((item) => item.role));
const RELATIVE_POSITION_OPTIONS = [
  { label: "无", value: "" },
  { label: "-2", value: "-2" },
  { label: "-1", value: "-1" },
  { label: "0", value: "0" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
];

function relativePositionOptions(currentValue: unknown) {
  const value = asString(currentValue);
  if (!value || RELATIVE_POSITION_OPTIONS.some((option) => option.value === value)) {
    return RELATIVE_POSITION_OPTIONS;
  }

  return [{ label: value, value }, ...RELATIVE_POSITION_OPTIONS];
}

function toNullablePosition(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function PrecursorsEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
}) {
  const items = asObjectArray(value.items);

  const updateItem = (index: number, updated: Record<string, unknown>) => {
    onChange(updateList(value, "items", (arr) => arr.map((it, i) => (i === index ? updated : it))));
  };

  const removeItem = (index: number) => {
    onChange(updateList(value, "items", (arr) => arr.filter((_, i) => i !== index)));
  };

  const addItem = () => {
    onChange(
      updateList(value, "items", (arr) => [
        ...arr,
        {
          species: "",
          method: "",
          brand: "",
          concentration: null,
          concentration_unit: "",
          melting_temperature_C: null,
          spin_speed_rpm: null,
          preparation_time_min: null,
        },
      ]),
    );
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {items.map((item, index) => (
        <Card
          key={index}
          size="small"
          title={`前驱体 ${index + 1}`}
          extra={
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeItem(index)}
              size="small"
            />
          }
        >
          <Form.Item label="物种" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.species)}
              onChange={(e) => updateItem(index, { ...item, species: e.target.value })}
              placeholder="例如 MoO3"
            />
          </Form.Item>
          <Form.Item label="方法" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`前驱体 ${index + 1} 方法`}
              disabled={false}
              onChange={(v) => updateItem(index, { ...item, method: v })}
              options={vocabularyOptions.precursor_method ?? []}
              placeholder="选择或输入方法"
              value={asString(item.method)}
            />
          </Form.Item>
          <Form.Item label="品牌" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.brand)}
              onChange={(e) => updateItem(index, { ...item, brand: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="浓度" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(item.concentration)}
              onChange={(v) => updateItem(index, { ...item, concentration: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="浓度单位" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.concentration_unit)}
              onChange={(e) => updateItem(index, { ...item, concentration_unit: e.target.value })}
              placeholder="例如 mol/L"
            />
          </Form.Item>
          <Form.Item label="熔融温度 (°C)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(item.melting_temperature_C)}
              onChange={(v) => updateItem(index, { ...item, melting_temperature_C: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="旋涂转速 (rpm)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(item.spin_speed_rpm)}
              onChange={(v) => updateItem(index, { ...item, spin_speed_rpm: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="制备时长 (min)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(item.preparation_time_min)}
              onChange={(v) => updateItem(index, { ...item, preparation_time_min: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Card>
      ))}
      <Button icon={<PlusOutlined />} onClick={addItem} type="dashed">
        添加前驱体
      </Button>
    </Space>
  );
}

function SubstratesEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
}) {
  const items = asObjectArray(value.items);

  const hasSubstrateValue = (item: Record<string, unknown>) =>
    ["type", "brand", "size_mm", "treatment_method", "position_mm"].some((key) =>
      key === "position_mm" ? item[key] !== null && item[key] !== undefined : Boolean(asString(item[key]).trim()),
    );

  const updateRoleItem = (role: string, patch: Record<string, unknown>) => {
    const existing = items.find((item) => item.role === role);
    const nextItem = {
      role,
      type: "",
      brand: "",
      size_mm: "",
      treatment_method: "",
      position_mm: null,
      ...existing,
      ...patch,
    };
    const nextItems = SUBSTRATE_ROLE_CONFIGS.map((roleConfig) =>
      roleConfig.role === role ? nextItem : items.find((item) => item.role === roleConfig.role),
    ).filter((item): item is Record<string, unknown> => Boolean(item && hasSubstrateValue(item)));

    onChange({ ...value, items: nextItems });
  };

  const clearRoleItem = (role: string) => {
    onChange({
      ...value,
      items: items.filter(
        (item) => item.role !== role && SUBSTRATE_ROLE_SET.has(asString(item.role)),
      ),
    });
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {SUBSTRATE_ROLE_CONFIGS.map((roleConfig) => {
        const item = items.find((substrate) => substrate.role === roleConfig.role) ?? {};

        return (
        <Card
          key={roleConfig.role}
          size="small"
          title={roleConfig.title}
          extra={
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={!items.some((substrate) => substrate.role === roleConfig.role)}
              onClick={() => clearRoleItem(roleConfig.role)}
              size="small"
              aria-label={`清空${roleConfig.title}`}
            />
          }
        >
          <Form.Item label="类型" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`${roleConfig.title} 类型`}
              disabled={false}
              onChange={(v) => updateRoleItem(roleConfig.role, { type: v })}
              options={vocabularyOptions.substrate_type ?? []}
              placeholder="选择或输入基底类型"
              value={asString(item.type)}
            />
          </Form.Item>
          <Form.Item label="品牌" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`${roleConfig.title} 品牌`}
              disabled={false}
              onChange={(v) => updateRoleItem(roleConfig.role, { brand: v })}
              options={vocabularyOptions.substrate_brand ?? []}
              placeholder="选择或输入品牌"
              value={asString(item.brand)}
            />
          </Form.Item>
          <Form.Item label="尺寸" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`${roleConfig.title} 尺寸`}
              disabled={false}
              onChange={(v) => updateRoleItem(roleConfig.role, { size_mm: v })}
              options={vocabularyOptions.substrate_size ?? []}
              placeholder="选择或输入尺寸"
              value={asString(item.size_mm)}
            />
          </Form.Item>
          <Form.Item label="处理方法" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`${roleConfig.title} 处理方法`}
              disabled={false}
              onChange={(v) => updateRoleItem(roleConfig.role, { treatment_method: v })}
              options={vocabularyOptions.substrate_treatment_method ?? []}
              placeholder="选择或输入处理方法"
              value={asString(item.treatment_method)}
            />
          </Form.Item>
          <Form.Item label="相对温区位置" style={{ marginBottom: 8 }}>
            <Select
              aria-label={`${roleConfig.title} 相对温区位置`}
              onChange={(v) => updateRoleItem(roleConfig.role, { position_mm: toNullablePosition(v) })}
              options={relativePositionOptions(item.position_mm)}
              style={{ width: "100%" }}
              value={asString(item.position_mm)}
            />
          </Form.Item>
        </Card>
        );
      })}
    </Space>
  );
}

function FurnaceProgramEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
}) {
  const furnaceInfoRaw = value.furnace_info as Record<string, unknown> | undefined;
  const furnaceInfo = furnaceInfoRaw && typeof furnaceInfoRaw === "object" ? furnaceInfoRaw : {};
  const zones = asObjectArray(value.zones);
  const zonesCount = asNumber(furnaceInfo.zones_count) ?? Math.max(zones.length, 2);

  const updateZone = (index: number, updated: Record<string, unknown>) => {
    onChange(updateList(value, "zones", (arr) => arr.map((it, i) => (i === index ? updated : it))));
  };

  const removeZone = (index: number) => {
    onChange(updateList(value, "zones", (arr) => arr.filter((_, i) => i !== index)));
  };

  const addZone = () => {
    onChange(
      updateList(value, "zones", (arr) => [
        ...arr,
        {
          zone_key: `zone_${arr.length + 1}`,
          temperature_program: [],
          note: "",
        },
      ]),
    );
  };

  const updateNode = (
    zoneIndex: number,
    nodeIndex: number,
    updated: Record<string, unknown>,
  ) => {
    const zone = zones[zoneIndex];
    const nodes = asObjectArray(zone.temperature_program);
    updateZone(zoneIndex, {
      ...zone,
      temperature_program: nodes.map((node, i) => (i === nodeIndex ? updated : node)),
    });
  };

  const removeNode = (zoneIndex: number, nodeIndex: number) => {
    const zone = zones[zoneIndex];
    const nodes = asObjectArray(zone.temperature_program);
    updateZone(zoneIndex, {
      ...zone,
      temperature_program: nodes.filter((_, i) => i !== nodeIndex),
    });
  };

  const addNode = (zoneIndex: number) => {
    const zone = zones[zoneIndex];
    const nodes = asObjectArray(zone.temperature_program);
    updateZone(zoneIndex, {
      ...zone,
      temperature_program: [
        ...nodes,
        {
          node_index: nodes.length + 1,
          time_min: null,
          temperature_C: null,
          note: "",
        },
      ],
    });
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <div style={{ marginBottom: 8, fontWeight: 500 }}>炉体信息</div>
      <Form.Item label="温区数量" style={{ marginBottom: 8 }}>
        <InputNumber
          value={zonesCount}
          onChange={(v) => {
            const newCount = v ?? 2;
            onChange({
              ...value,
              furnace_info: {
                ...furnaceInfo,
                zones_count: newCount,
              },
            });
          }}
          style={{ width: "100%" }}
        />
      </Form.Item>
      {zones.map((zone, zoneIndex) => {
        const nodes = asObjectArray(zone.temperature_program);
        return (
          <Card
            key={zoneIndex}
            size="small"
            title={`温区 ${zoneIndex + 1} 温度变化`}
            extra={
              <Space>
                <Button icon={<PlusOutlined />} onClick={() => addNode(zoneIndex)} size="small" />
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeZone(zoneIndex)}
                  size="small"
                />
              </Space>
            }
          >
            <Form.Item label="温区标识" style={{ marginBottom: 8 }}>
              <Input
                value={asString(zone.zone_key)}
                onChange={(e) => updateZone(zoneIndex, { ...zone, zone_key: e.target.value })}
                placeholder="例如 zone_1"
              />
            </Form.Item>
            <Form.Item label="温区备注" style={{ marginBottom: 8 }}>
              <Input
                value={asString(zone.note)}
                onChange={(e) => updateZone(zoneIndex, { ...zone, note: e.target.value })}
              />
            </Form.Item>
            <div style={{ marginLeft: 16 }}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>温度节点</div>
              {nodes.map((node, nodeIndex) => (
                <Card
                  key={nodeIndex}
                  size="small"
                  title={`节点 ${nodeIndex + 1}`}
                  extra={
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeNode(zoneIndex, nodeIndex)}
                      size="small"
                    />
                  }
                >
                  <Form.Item label="时间 (min)" style={{ marginBottom: 4 }}>
                  <InputNumber
                    value={asNumber(node.time_min)}
                    onChange={(v) => updateNode(zoneIndex, nodeIndex, { ...node, time_min: v })}
                    style={{ width: "100%" }}
                  />
                </Form.Item>
                  <Form.Item label="温度 (°C)" style={{ marginBottom: 4 }}>
                    <InputNumber
                      value={asNumber(node.temperature_C)}
                      onChange={(v) =>
                        updateNode(zoneIndex, nodeIndex, { ...node, temperature_C: v })
                      }
                      style={{ width: "100%" }}
                    />
                  </Form.Item>
                  <Form.Item label="说明" style={{ marginBottom: 4 }}>
                    <Input
                      value={asString(node.note)}
                      onChange={(e) =>
                        updateNode(zoneIndex, nodeIndex, { ...node, note: e.target.value })
                      }
                    />
                  </Form.Item>
                </Card>
              ))}
            </div>
          </Card>
        );
      })}
      <Button icon={<PlusOutlined />} onClick={addZone} type="dashed">
        添加温区
      </Button>
    </Space>
  );
}

function GasProgramEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
}) {
  const segments = asObjectArray(value.segments);

  const updateSegment = (index: number, updated: Record<string, unknown>) => {
    const newSegments = segments.map((s, i) => (i === index ? updated : s));
    onChange({ ...value, segments: newSegments });
  };

  const removeSegment = (index: number) => {
    const newSegments = segments.filter((_, i) => i !== index);
    onChange({ ...value, segments: newSegments });
  };

  const addSegment = () => {
    const newSegments = [
      ...segments,
      { stage: "", gas: "", start_min: null, end_min: null, flow_sccm: null, note: "" },
    ];
    onChange({ ...value, segments: newSegments });
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Form.Item label="预冲洗气体" style={{ marginBottom: 8 }}>
        <VocabularyCombobox
          ariaLabel="预冲洗气体"
          disabled={false}
          onChange={(v) => onChange({ ...value, pre_washing_gas: v })}
          options={vocabularyOptions.gas_label ?? []}
          placeholder="选择或输入气体"
          value={asString(value.pre_washing_gas)}
        />
      </Form.Item>
      {segments.map((seg, index) => (
        <Card
          key={index}
          size="small"
          title={`段落 ${index + 1}`}
          extra={
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeSegment(index)}
              size="small"
            />
          }
        >
          <Form.Item label="阶段" style={{ marginBottom: 8 }}>
            <Input
              value={asString(seg.stage)}
              onChange={(e) => updateSegment(index, { ...seg, stage: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="气体" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`气体段落 ${index + 1}`}
              disabled={false}
              onChange={(v) => updateSegment(index, { ...seg, gas: v })}
              options={vocabularyOptions.gas_label ?? []}
              placeholder="选择或输入气体"
              value={asString(seg.gas)}
            />
          </Form.Item>
          <Form.Item label="开始时间 (min)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(seg.start_min)}
              onChange={(v) => updateSegment(index, { ...seg, start_min: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="结束时间 (min)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(seg.end_min)}
              onChange={(v) => updateSegment(index, { ...seg, end_min: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="流量 (sccm)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(seg.flow_sccm)}
              onChange={(v) => updateSegment(index, { ...seg, flow_sccm: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="备注" style={{ marginBottom: 8 }}>
            <Input
              value={asString(seg.note)}
              onChange={(e) => updateSegment(index, { ...seg, note: e.target.value })}
            />
          </Form.Item>
        </Card>
      ))}
      <Button icon={<PlusOutlined />} onClick={addSegment} type="dashed">
        添加段落
      </Button>
    </Space>
  );
}

function CharacterizationEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
}) {
  const methods = asObjectArray(value.methods);

  const updateMethod = (index: number, updated: Record<string, unknown>) => {
    onChange(updateList(value, "methods", (arr) => arr.map((it, i) => (i === index ? updated : it))));
  };

  const removeMethod = (index: number) => {
    onChange(updateList(value, "methods", (arr) => arr.filter((_, i) => i !== index)));
  };

  const addMethod = () => {
    onChange(
      updateList(value, "methods", (arr) => [
        ...arr,
        { method: "", result: "", enabled: true, excitation_nm: null, note: "" },
      ]),
    );
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {methods.map((item, index) => (
        <Card
          key={index}
          size="small"
          title={`表征 ${index + 1}`}
          extra={
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeMethod(index)}
              size="small"
            />
          }
        >
          <Form.Item label="方法" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`表征 ${index + 1} 方法`}
              disabled={false}
              onChange={(v) => updateMethod(index, { ...item, method: v })}
              options={vocabularyOptions.characterization_method ?? []}
              placeholder="选择或输入方法"
              value={asString(item.method)}
            />
          </Form.Item>
          <Form.Item label="结果" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.result)}
              onChange={(e) => updateMethod(index, { ...item, result: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="启用" style={{ marginBottom: 8 }}>
            <Switch
              checked={asBoolean(item.enabled, true)}
              onChange={(v) => updateMethod(index, { ...item, enabled: v })}
            />
          </Form.Item>
          <Form.Item label="激发波长 (nm)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(item.excitation_nm)}
              onChange={(v) => updateMethod(index, { ...item, excitation_nm: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="备注" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.note)}
              onChange={(e) => updateMethod(index, { ...item, note: e.target.value })}
            />
          </Form.Item>
        </Card>
      ))}
      <Button icon={<PlusOutlined />} onClick={addMethod} type="dashed">
        添加表征方法
      </Button>
    </Space>
  );
}

export function RecipeSectionEditor({
  moduleKey,
  value,
  onChange,
  vocabularyOptions,
}: RecipeSectionEditorProps) {
  switch (moduleKey) {
    case "precursors":
      return (
        <PrecursorsEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      );
    case "substrates":
      return (
        <SubstratesEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      );
    case "furnace_program":
      return (
        <FurnaceProgramEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      );
    case "gas_program":
      return (
        <GasProgramEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      );
    case "characterization":
      return (
        <CharacterizationEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      );
  }
}
