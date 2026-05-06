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

const ROLE_OPTIONS = [
  { label: "顶部 (top)", value: "top" },
  { label: "底部 (bottom)", value: "bottom" },
];

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
          role: "",
          type: "",
          brand: "",
          size_mm: "",
          treatment_method: "",
          position_mm: null,
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
          title={`基底 ${index + 1}`}
          extra={
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeItem(index)}
              size="small"
            />
          }
        >
          <Form.Item label="角色" style={{ marginBottom: 8 }}>
            <Select
              allowClear
              onChange={(v) => updateItem(index, { ...item, role: v ?? "" })}
              options={ROLE_OPTIONS}
              placeholder="选择角色"
              style={{ width: "100%" }}
              value={asString(item.role) || undefined}
            />
          </Form.Item>
          <Form.Item label="类型" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`基底 ${index + 1} 类型`}
              disabled={false}
              onChange={(v) => updateItem(index, { ...item, type: v })}
              options={vocabularyOptions.substrate_type ?? []}
              placeholder="选择或输入基底类型"
              value={asString(item.type)}
            />
          </Form.Item>
          <Form.Item label="品牌" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.brand)}
              onChange={(e) => updateItem(index, { ...item, brand: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="尺寸 (mm)" style={{ marginBottom: 8 }}>
            <Input
              value={asString(item.size_mm)}
              onChange={(e) => updateItem(index, { ...item, size_mm: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="处理方法" style={{ marginBottom: 8 }}>
            <VocabularyCombobox
              ariaLabel={`基底 ${index + 1} 处理方法`}
              disabled={false}
              onChange={(v) => updateItem(index, { ...item, treatment_method: v })}
              options={vocabularyOptions.substrate_treatment_method ?? []}
              placeholder="选择或输入处理方法"
              value={asString(item.treatment_method)}
            />
          </Form.Item>
          <Form.Item label="位置 (mm)" style={{ marginBottom: 8 }}>
            <InputNumber
              value={asNumber(item.position_mm)}
              onChange={(v) => updateItem(index, { ...item, position_mm: v })}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Card>
      ))}
      <Button icon={<PlusOutlined />} onClick={addItem} type="dashed">
        添加基底
      </Button>
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
  const zones = asObjectArray(value.zones);

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
          zone_index: null,
          precursor_placed: false,
          note: "",
          temperature_program: [],
        },
      ]),
    );
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {zones.map((zone, zoneIndex) => {
        const tempProgram = asObjectArray(zone.temperature_program);

        const updateTempPoint = (
          pointIndex: number,
          updated: Record<string, unknown>,
        ) => {
          const newProgram = tempProgram.map((pt, i) => (i === pointIndex ? updated : pt));
          updateZone(zoneIndex, { ...zone, temperature_program: newProgram });
        };

        const removeTempPoint = (pointIndex: number) => {
          const newProgram = tempProgram.filter((_, i) => i !== pointIndex);
          updateZone(zoneIndex, { ...zone, temperature_program: newProgram });
        };

        const addTempPoint = () => {
          const newProgram = [...tempProgram, { time_min: null, temperature_C: null }];
          updateZone(zoneIndex, { ...zone, temperature_program: newProgram });
        };

        return (
          <Card
            key={zoneIndex}
            size="small"
            title={`温区 ${zoneIndex + 1}`}
            extra={
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeZone(zoneIndex)}
                size="small"
              />
            }
          >
            <Form.Item label="温区编号" style={{ marginBottom: 8 }}>
              <InputNumber
                value={asNumber(zone.zone_index)}
                onChange={(v) => updateZone(zoneIndex, { ...zone, zone_index: v })}
                style={{ width: "100%" }}
              />
            </Form.Item>
            <Form.Item label="前驱体放置" style={{ marginBottom: 8 }}>
              <Switch
                checked={asBoolean(zone.precursor_placed, false)}
                onChange={(v) => updateZone(zoneIndex, { ...zone, precursor_placed: v })}
              />
            </Form.Item>
            <Form.Item label="备注" style={{ marginBottom: 8 }}>
              <Input
                value={asString(zone.note)}
                onChange={(e) => updateZone(zoneIndex, { ...zone, note: e.target.value })}
              />
            </Form.Item>
            <div style={{ marginLeft: 16 }}>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>温度程序</div>
              {tempProgram.map((point, pointIndex) => (
                <Space key={pointIndex} style={{ marginBottom: 4 }}>
                  <InputNumber
                    addonBefore="时间 (min)"
                    value={asNumber(point.time_min)}
                    onChange={(v) => updateTempPoint(pointIndex, { ...point, time_min: v })}
                    style={{ width: 180 }}
                  />
                  <InputNumber
                    addonBefore="温度 (°C)"
                    value={asNumber(point.temperature_C)}
                    onChange={(v) =>
                      updateTempPoint(pointIndex, { ...point, temperature_C: v })
                    }
                    style={{ width: 180 }}
                  />
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeTempPoint(pointIndex)}
                    size="small"
                  />
                </Space>
              ))}
              <Button
                icon={<PlusOutlined />}
                onClick={addTempPoint}
                size="small"
                type="dashed"
              >
                添加温度点
              </Button>
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