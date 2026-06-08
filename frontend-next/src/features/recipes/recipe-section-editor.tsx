import { Plus, Trash2 } from 'lucide-react'

import { VocabularyCombobox } from '@/features/experiments/components/vocabulary-combobox'
import type { VocabularySelectOption } from '@/features/experiments/editor-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type RecipeModuleKey =
  | 'precursors'
  | 'substrates'
  | 'furnace_program'
  | 'gas_program'
  | 'characterization'

export type RecipeSectionEditorProps = {
  moduleKey: RecipeModuleKey
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  vocabularyOptions: Record<string, VocabularySelectOption[]>
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value
  return defaultValue
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  )
}

function updateList(
  value: Record<string, unknown>,
  listKey: string,
  updater: (items: Record<string, unknown>[]) => Record<string, unknown>[],
): Record<string, unknown> {
  return { ...value, [listKey]: updater(asObjectArray(value[listKey])) }
}

const POSITION_NONE = '__none__'

const SUBSTRATE_ROLE_CONFIGS = [
  { role: 'top', title: '上基底' },
  { role: 'bottom', title: '下基底' },
]
const SUBSTRATE_ROLE_SET = new Set(
  SUBSTRATE_ROLE_CONFIGS.map((item) => item.role),
)
const RELATIVE_POSITION_OPTIONS = [
  { label: '无', value: '' },
  { label: '-2', value: '-2' },
  { label: '-1', value: '-1' },
  { label: '0', value: '0' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
]

function relativePositionOptions(currentValue: unknown) {
  const value = asString(currentValue)
  if (
    !value ||
    RELATIVE_POSITION_OPTIONS.some((option) => option.value === value)
  ) {
    return RELATIVE_POSITION_OPTIONS
  }

  return [{ label: value, value }, ...RELATIVE_POSITION_OPTIONS]
}

function toNullablePosition(value: string): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// 编辑器内的列表项卡片：轻量边框 + 标题栏 + 操作区。
function ItemCard({
  title,
  action,
  children,
}: {
  title: string
  action: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <h5 className="text-sm font-medium text-foreground">{title}</h5>
        {action}
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="editor-field">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: number | null
  onChange: (value: number | null) => void
  ariaLabel: string
  placeholder?: string
}) {
  return (
    <Input
      type="number"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) =>
        onChange(e.target.value === '' ? null : Number(e.target.value))
      }
    />
  )
}

function DeleteButton({
  onClick,
  ariaLabel,
  disabled,
}: {
  onClick: () => void
  ariaLabel: string
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={ariaLabel}
      disabled={disabled}
      className="text-destructive hover:text-destructive"
      onClick={onClick}
    >
      <Trash2 className="size-4" />
    </Button>
  )
}

function AddButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="border-dashed"
      onClick={onClick}
    >
      <Plus className="size-4" />
      {children}
    </Button>
  )
}

function PrecursorsEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  vocabularyOptions: Record<string, VocabularySelectOption[]>
}) {
  const items = asObjectArray(value.items)

  const updateItem = (index: number, updated: Record<string, unknown>) => {
    onChange(
      updateList(value, 'items', (arr) =>
        arr.map((it, i) => (i === index ? updated : it)),
      ),
    )
  }

  const removeItem = (index: number) => {
    onChange(
      updateList(value, 'items', (arr) => arr.filter((_, i) => i !== index)),
    )
  }

  const addItem = () => {
    onChange(
      updateList(value, 'items', (arr) => [
        ...arr,
        {
          species: '',
          method: '',
          brand: '',
          concentration: null,
          concentration_unit: '',
          melting_temperature_C: null,
          spin_speed_rpm: null,
          preparation_time_min: null,
        },
      ]),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <ItemCard
          key={index}
          title={`前驱体 ${index + 1}`}
          action={
            <DeleteButton
              ariaLabel={`删除前驱体 ${index + 1}`}
              onClick={() => removeItem(index)}
            />
          }
        >
          <Field label="物种">
            <Input
              aria-label={`前驱体 ${index + 1} 物种`}
              value={asString(item.species)}
              onChange={(e) =>
                updateItem(index, { ...item, species: e.target.value })
              }
              placeholder="例如 MoO3"
            />
          </Field>
          <Field label="方法">
            <VocabularyCombobox
              ariaLabel={`前驱体 ${index + 1} 方法`}
              disabled={false}
              onChange={(v) => updateItem(index, { ...item, method: v })}
              options={vocabularyOptions.precursor_method ?? []}
              placeholder="选择或输入方法"
              value={asString(item.method)}
            />
          </Field>
          <Field label="品牌">
            <Input
              aria-label={`前驱体 ${index + 1} 品牌`}
              value={asString(item.brand)}
              onChange={(e) =>
                updateItem(index, { ...item, brand: e.target.value })
              }
            />
          </Field>
          <Field label="浓度">
            <NumberInput
              ariaLabel={`前驱体 ${index + 1} 浓度`}
              value={asNumber(item.concentration)}
              onChange={(v) => updateItem(index, { ...item, concentration: v })}
            />
          </Field>
          <Field label="浓度单位">
            <Input
              aria-label={`前驱体 ${index + 1} 浓度单位`}
              value={asString(item.concentration_unit)}
              onChange={(e) =>
                updateItem(index, {
                  ...item,
                  concentration_unit: e.target.value,
                })
              }
              placeholder="例如 mol/L"
            />
          </Field>
          <Field label="熔融温度 (°C)">
            <NumberInput
              ariaLabel={`前驱体 ${index + 1} 熔融温度`}
              value={asNumber(item.melting_temperature_C)}
              onChange={(v) =>
                updateItem(index, { ...item, melting_temperature_C: v })
              }
            />
          </Field>
          <Field label="旋涂转速 (rpm)">
            <NumberInput
              ariaLabel={`前驱体 ${index + 1} 旋涂转速`}
              value={asNumber(item.spin_speed_rpm)}
              onChange={(v) =>
                updateItem(index, { ...item, spin_speed_rpm: v })
              }
            />
          </Field>
          <Field label="制备时长 (min)">
            <NumberInput
              ariaLabel={`前驱体 ${index + 1} 制备时长`}
              value={asNumber(item.preparation_time_min)}
              onChange={(v) =>
                updateItem(index, { ...item, preparation_time_min: v })
              }
            />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={addItem}>添加前驱体</AddButton>
    </div>
  )
}

function SubstratesEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  vocabularyOptions: Record<string, VocabularySelectOption[]>
}) {
  const items = asObjectArray(value.items)

  const hasSubstrateValue = (item: Record<string, unknown>) =>
    ['type', 'brand', 'size_mm', 'treatment_method', 'position_mm'].some((key) =>
      key === 'position_mm'
        ? item[key] !== null && item[key] !== undefined
        : Boolean(asString(item[key]).trim()),
    )

  const updateRoleItem = (role: string, patch: Record<string, unknown>) => {
    const existing = items.find((item) => item.role === role)
    const nextItem = {
      role,
      type: '',
      brand: '',
      size_mm: '',
      treatment_method: '',
      position_mm: null,
      ...existing,
      ...patch,
    }
    const nextItems = SUBSTRATE_ROLE_CONFIGS.map((roleConfig) =>
      roleConfig.role === role
        ? nextItem
        : items.find((item) => item.role === roleConfig.role),
    ).filter((item): item is Record<string, unknown> =>
      Boolean(item && hasSubstrateValue(item)),
    )

    onChange({ ...value, items: nextItems })
  }

  const clearRoleItem = (role: string) => {
    onChange({
      ...value,
      items: items.filter(
        (item) =>
          item.role !== role && SUBSTRATE_ROLE_SET.has(asString(item.role)),
      ),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {SUBSTRATE_ROLE_CONFIGS.map((roleConfig) => {
        const item =
          items.find((substrate) => substrate.role === roleConfig.role) ?? {}

        return (
          <ItemCard
            key={roleConfig.role}
            title={roleConfig.title}
            action={
              <DeleteButton
                ariaLabel={`清空${roleConfig.title}`}
                disabled={
                  !items.some((substrate) => substrate.role === roleConfig.role)
                }
                onClick={() => clearRoleItem(roleConfig.role)}
              />
            }
          >
            <Field label="类型">
              <VocabularyCombobox
                ariaLabel={`${roleConfig.title} 类型`}
                disabled={false}
                onChange={(v) => updateRoleItem(roleConfig.role, { type: v })}
                options={vocabularyOptions.substrate_type ?? []}
                placeholder="选择或输入基底类型"
                value={asString(item.type)}
              />
            </Field>
            <Field label="品牌">
              <VocabularyCombobox
                ariaLabel={`${roleConfig.title} 品牌`}
                disabled={false}
                onChange={(v) => updateRoleItem(roleConfig.role, { brand: v })}
                options={vocabularyOptions.substrate_brand ?? []}
                placeholder="选择或输入品牌"
                value={asString(item.brand)}
              />
            </Field>
            <Field label="尺寸">
              <VocabularyCombobox
                ariaLabel={`${roleConfig.title} 尺寸`}
                disabled={false}
                onChange={(v) => updateRoleItem(roleConfig.role, { size_mm: v })}
                options={vocabularyOptions.substrate_size ?? []}
                placeholder="选择或输入尺寸"
                value={asString(item.size_mm)}
              />
            </Field>
            <Field label="处理方法">
              <VocabularyCombobox
                ariaLabel={`${roleConfig.title} 处理方法`}
                disabled={false}
                onChange={(v) =>
                  updateRoleItem(roleConfig.role, { treatment_method: v })
                }
                options={vocabularyOptions.substrate_treatment_method ?? []}
                placeholder="选择或输入处理方法"
                value={asString(item.treatment_method)}
              />
            </Field>
            <Field label="相对温区位置">
              <Select
                value={asString(item.position_mm) || POSITION_NONE}
                onValueChange={(v) =>
                  updateRoleItem(roleConfig.role, {
                    position_mm: toNullablePosition(
                      v === POSITION_NONE ? '' : v,
                    ),
                  })
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={`${roleConfig.title} 相对温区位置`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {relativePositionOptions(item.position_mm).map((option) => (
                    <SelectItem
                      key={option.value || POSITION_NONE}
                      value={option.value || POSITION_NONE}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </ItemCard>
        )
      })}
    </div>
  )
}

function FurnaceProgramEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  vocabularyOptions: Record<string, VocabularySelectOption[]>
}) {
  const furnaceInfoRaw = value.furnace_info as Record<string, unknown> | undefined
  const furnaceInfo =
    furnaceInfoRaw && typeof furnaceInfoRaw === 'object' ? furnaceInfoRaw : {}
  const zones = asObjectArray(value.zones)
  const zonesCount = asNumber(furnaceInfo.zones_count) ?? Math.max(zones.length, 2)

  const updateZone = (index: number, updated: Record<string, unknown>) => {
    onChange(
      updateList(value, 'zones', (arr) =>
        arr.map((it, i) => (i === index ? updated : it)),
      ),
    )
  }

  const removeZone = (index: number) => {
    onChange(
      updateList(value, 'zones', (arr) => arr.filter((_, i) => i !== index)),
    )
  }

  const addZone = () => {
    onChange(
      updateList(value, 'zones', (arr) => [
        ...arr,
        {
          zone_key: `zone_${arr.length + 1}`,
          temperature_program: [],
          note: '',
        },
      ]),
    )
  }

  const updateNode = (
    zoneIndex: number,
    nodeIndex: number,
    updated: Record<string, unknown>,
  ) => {
    const zone = zones[zoneIndex]
    const nodes = asObjectArray(zone.temperature_program)
    updateZone(zoneIndex, {
      ...zone,
      temperature_program: nodes.map((node, i) =>
        i === nodeIndex ? updated : node,
      ),
    })
  }

  const removeNode = (zoneIndex: number, nodeIndex: number) => {
    const zone = zones[zoneIndex]
    const nodes = asObjectArray(zone.temperature_program)
    updateZone(zoneIndex, {
      ...zone,
      temperature_program: nodes.filter((_, i) => i !== nodeIndex),
    })
  }

  const addNode = (zoneIndex: number) => {
    const zone = zones[zoneIndex]
    const nodes = asObjectArray(zone.temperature_program)
    updateZone(zoneIndex, {
      ...zone,
      temperature_program: [
        ...nodes,
        {
          node_index: nodes.length + 1,
          time_min: null,
          temperature_C: null,
          note: '',
        },
      ],
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="温区数量">
        <NumberInput
          ariaLabel="温区数量"
          value={zonesCount}
          onChange={(v) => {
            const newCount = v ?? 2
            onChange({
              ...value,
              furnace_info: {
                ...furnaceInfo,
                zones_count: newCount,
              },
            })
          }}
        />
      </Field>
      {zones.map((zone, zoneIndex) => {
        const nodes = asObjectArray(zone.temperature_program)
        return (
          <ItemCard
            key={zoneIndex}
            title={`温区 ${zoneIndex + 1} 温度变化`}
            action={
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`温区 ${zoneIndex + 1} 添加节点`}
                  onClick={() => addNode(zoneIndex)}
                >
                  <Plus className="size-4" />
                </Button>
                <DeleteButton
                  ariaLabel={`删除温区 ${zoneIndex + 1}`}
                  onClick={() => removeZone(zoneIndex)}
                />
              </div>
            }
          >
            <Field label="温区标识">
              <Input
                aria-label={`温区 ${zoneIndex + 1} 标识`}
                value={asString(zone.zone_key)}
                onChange={(e) =>
                  updateZone(zoneIndex, { ...zone, zone_key: e.target.value })
                }
                placeholder="例如 zone_1"
              />
            </Field>
            <Field label="温区备注">
              <Input
                aria-label={`温区 ${zoneIndex + 1} 备注`}
                value={asString(zone.note)}
                onChange={(e) =>
                  updateZone(zoneIndex, { ...zone, note: e.target.value })
                }
              />
            </Field>
            <div className="flex flex-col gap-2 border-l pl-3">
              <div className="text-sm font-medium text-muted-foreground">
                温度节点
              </div>
              {nodes.map((node, nodeIndex) => (
                <ItemCard
                  key={nodeIndex}
                  title={`节点 ${nodeIndex + 1}`}
                  action={
                    <DeleteButton
                      ariaLabel={`删除温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1}`}
                      onClick={() => removeNode(zoneIndex, nodeIndex)}
                    />
                  }
                >
                  <Field label="时间 (min)">
                    <NumberInput
                      ariaLabel={`温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1} 时间`}
                      value={asNumber(node.time_min)}
                      onChange={(v) =>
                        updateNode(zoneIndex, nodeIndex, {
                          ...node,
                          time_min: v,
                        })
                      }
                    />
                  </Field>
                  <Field label="温度 (°C)">
                    <NumberInput
                      ariaLabel={`温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1} 温度`}
                      value={asNumber(node.temperature_C)}
                      onChange={(v) =>
                        updateNode(zoneIndex, nodeIndex, {
                          ...node,
                          temperature_C: v,
                        })
                      }
                    />
                  </Field>
                  <Field label="说明">
                    <Input
                      aria-label={`温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1} 说明`}
                      value={asString(node.note)}
                      onChange={(e) =>
                        updateNode(zoneIndex, nodeIndex, {
                          ...node,
                          note: e.target.value,
                        })
                      }
                    />
                  </Field>
                </ItemCard>
              ))}
            </div>
          </ItemCard>
        )
      })}
      <AddButton onClick={addZone}>添加温区</AddButton>
    </div>
  )
}

function GasProgramEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  vocabularyOptions: Record<string, VocabularySelectOption[]>
}) {
  const segments = asObjectArray(value.segments)

  const updateSegment = (index: number, updated: Record<string, unknown>) => {
    const newSegments = segments.map((s, i) => (i === index ? updated : s))
    onChange({ ...value, segments: newSegments })
  }

  const removeSegment = (index: number) => {
    const newSegments = segments.filter((_, i) => i !== index)
    onChange({ ...value, segments: newSegments })
  }

  const addSegment = () => {
    const newSegments = [
      ...segments,
      {
        stage: '',
        gas: '',
        start_min: null,
        end_min: null,
        flow_sccm: null,
        note: '',
      },
    ]
    onChange({ ...value, segments: newSegments })
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="预冲洗气体">
        <VocabularyCombobox
          ariaLabel="预冲洗气体"
          disabled={false}
          onChange={(v) => onChange({ ...value, pre_washing_gas: v })}
          options={vocabularyOptions.gas_label ?? []}
          placeholder="选择或输入气体"
          value={asString(value.pre_washing_gas)}
        />
      </Field>
      {segments.map((seg, index) => (
        <ItemCard
          key={index}
          title={`段落 ${index + 1}`}
          action={
            <DeleteButton
              ariaLabel={`删除段落 ${index + 1}`}
              onClick={() => removeSegment(index)}
            />
          }
        >
          <Field label="阶段">
            <Input
              aria-label={`段落 ${index + 1} 阶段`}
              value={asString(seg.stage)}
              onChange={(e) =>
                updateSegment(index, { ...seg, stage: e.target.value })
              }
            />
          </Field>
          <Field label="气体">
            <VocabularyCombobox
              ariaLabel={`气体段落 ${index + 1}`}
              disabled={false}
              onChange={(v) => updateSegment(index, { ...seg, gas: v })}
              options={vocabularyOptions.gas_label ?? []}
              placeholder="选择或输入气体"
              value={asString(seg.gas)}
            />
          </Field>
          <Field label="开始时间 (min)">
            <NumberInput
              ariaLabel={`段落 ${index + 1} 开始时间`}
              value={asNumber(seg.start_min)}
              onChange={(v) => updateSegment(index, { ...seg, start_min: v })}
            />
          </Field>
          <Field label="结束时间 (min)">
            <NumberInput
              ariaLabel={`段落 ${index + 1} 结束时间`}
              value={asNumber(seg.end_min)}
              onChange={(v) => updateSegment(index, { ...seg, end_min: v })}
            />
          </Field>
          <Field label="流量 (sccm)">
            <NumberInput
              ariaLabel={`段落 ${index + 1} 流量`}
              value={asNumber(seg.flow_sccm)}
              onChange={(v) => updateSegment(index, { ...seg, flow_sccm: v })}
            />
          </Field>
          <Field label="备注">
            <Input
              aria-label={`段落 ${index + 1} 备注`}
              value={asString(seg.note)}
              onChange={(e) =>
                updateSegment(index, { ...seg, note: e.target.value })
              }
            />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={addSegment}>添加段落</AddButton>
    </div>
  )
}

function CharacterizationEditor({
  value,
  onChange,
  vocabularyOptions,
}: {
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  vocabularyOptions: Record<string, VocabularySelectOption[]>
}) {
  const methods = asObjectArray(value.methods)

  const updateMethod = (index: number, updated: Record<string, unknown>) => {
    onChange(
      updateList(value, 'methods', (arr) =>
        arr.map((it, i) => (i === index ? updated : it)),
      ),
    )
  }

  const removeMethod = (index: number) => {
    onChange(
      updateList(value, 'methods', (arr) => arr.filter((_, i) => i !== index)),
    )
  }

  const addMethod = () => {
    onChange(
      updateList(value, 'methods', (arr) => [
        ...arr,
        { method: '', result: '', enabled: true, excitation_nm: null, note: '' },
      ]),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {methods.map((item, index) => (
        <ItemCard
          key={index}
          title={`表征 ${index + 1}`}
          action={
            <DeleteButton
              ariaLabel={`删除表征 ${index + 1}`}
              onClick={() => removeMethod(index)}
            />
          }
        >
          <Field label="方法">
            <VocabularyCombobox
              ariaLabel={`表征 ${index + 1} 方法`}
              disabled={false}
              onChange={(v) => updateMethod(index, { ...item, method: v })}
              options={vocabularyOptions.characterization_method ?? []}
              placeholder="选择或输入方法"
              value={asString(item.method)}
            />
          </Field>
          <Field label="结果">
            <Input
              aria-label={`表征 ${index + 1} 结果`}
              value={asString(item.result)}
              onChange={(e) =>
                updateMethod(index, { ...item, result: e.target.value })
              }
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <Label>启用</Label>
            <Switch
              aria-label={`表征 ${index + 1} 启用`}
              checked={asBoolean(item.enabled, true)}
              onCheckedChange={(v) =>
                updateMethod(index, { ...item, enabled: v })
              }
            />
          </div>
          <Field label="激发波长 (nm)">
            <NumberInput
              ariaLabel={`表征 ${index + 1} 激发波长`}
              value={asNumber(item.excitation_nm)}
              onChange={(v) => updateMethod(index, { ...item, excitation_nm: v })}
            />
          </Field>
          <Field label="备注">
            <Input
              aria-label={`表征 ${index + 1} 备注`}
              value={asString(item.note)}
              onChange={(e) =>
                updateMethod(index, { ...item, note: e.target.value })
              }
            />
          </Field>
        </ItemCard>
      ))}
      <AddButton onClick={addMethod}>添加表征方法</AddButton>
    </div>
  )
}

export function RecipeSectionEditor({
  moduleKey,
  value,
  onChange,
  vocabularyOptions,
}: RecipeSectionEditorProps) {
  switch (moduleKey) {
    case 'precursors':
      return (
        <PrecursorsEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      )
    case 'substrates':
      return (
        <SubstratesEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      )
    case 'furnace_program':
      return (
        <FurnaceProgramEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      )
    case 'gas_program':
      return (
        <GasProgramEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      )
    case 'characterization':
      return (
        <CharacterizationEditor
          value={value}
          onChange={onChange}
          vocabularyOptions={vocabularyOptions}
        />
      )
  }
}
