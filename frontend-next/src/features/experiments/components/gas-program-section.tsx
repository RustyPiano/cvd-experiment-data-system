import { useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'

import type { RecipeRead } from '@/shared/types/api'
import type { QuickTemplate } from '../data/builtin-templates'
import { BUILTIN_GAS_TEMPLATES } from '../data/builtin-templates'
import type {
  GasProgramValues,
  VocabularySelectOption,
} from '../editor-types'
import {
  createEmptyGasComponent,
  createEmptyGasSegment,
  inferComponentFlowSccm,
} from '../editor-types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { QuickTemplateMenu } from './quick-template-menu'
import { VocabularyCombobox } from './vocabulary-combobox'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  )
}

function asString(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return String(value)
  }

  return ''
}

function toGasProgramValues(payload: Record<string, unknown>): GasProgramValues {
  return {
    preWashingGas: asString(payload.pre_washing_gas),
    segments: asObjectArray(payload.segments).map((segment) => ({
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
        flowSccm:
          asString(component.flow_sccm) ||
          inferComponentFlowSccm(component, segment),
      })),
    })),
  }
}

function computeComponentPercent(
  flowSccm: string,
  totalFlow: number,
): string | null {
  const value = Number(flowSccm)
  if (!Number.isFinite(value) || value <= 0 || totalFlow <= 0) {
    return null
  }
  return `${Math.round((value / totalFlow) * 10000) / 100}%`
}

export function GasProgramSection({
  disabled,
  gasOptions,
  materialSystem,
  onChange,
  recipeTemplates = [],
  templates = BUILTIN_GAS_TEMPLATES,
  value,
}: {
  disabled: boolean
  gasOptions: VocabularySelectOption[]
  materialSystem?: string
  onChange: (nextValue: GasProgramValues) => void
  recipeTemplates?: RecipeRead[]
  templates?: QuickTemplate[]
  value: GasProgramValues
}) {
  const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<
    string | null
  >(null)

  const emitManualChange = (nextValue: GasProgramValues) => {
    setAppliedTemplateLabel(null)
    onChange(nextValue)
  }

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label)
    onChange(toGasProgramValues(asRecord(template.payload)))
  }

  const getSegmentTotalFlow = (segment: (typeof value.segments)[number]) => {
    return segment.components.reduce((sum, c) => {
      const v = Number(c.flowSccm)
      return Number.isFinite(v) && v > 0 ? sum + v : sum
    }, 0)
  }

  const updateSegment = (
    index: number,
    patch: Partial<(typeof value.segments)[number]>,
  ) => {
    emitManualChange({
      ...value,
      segments: value.segments.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, ...patch } : segment,
      ),
    })
  }

  const updateComponent = (
    segmentIndex: number,
    componentIndex: number,
    patch: Partial<(typeof value.segments)[number]['components'][number]>,
  ) => {
    emitManualChange({
      ...value,
      segments: value.segments.map((segment, currentSegmentIndex) =>
        currentSegmentIndex === segmentIndex
          ? {
              ...segment,
              components: segment.components.map(
                (component, currentComponentIndex) =>
                  currentComponentIndex === componentIndex
                    ? { ...component, ...patch }
                    : component,
              ),
            }
          : segment,
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <QuickTemplateMenu
          disabled={disabled}
          materialSystem={materialSystem}
          moduleKey="gas_program"
          onSelect={applyTemplate}
          recipeTemplates={recipeTemplates}
          templates={templates}
        />
      </div>
      {appliedTemplateLabel ? (
        <Alert className="border-success/40 bg-success-soft [&>svg]:text-success">
          <CheckCircle2 />
          <AlertDescription className="text-foreground">
            已应用模板：{appliedTemplateLabel}，请确认或修改。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="editor-field">
        <Label>预清洗气体</Label>
        <VocabularyCombobox
          ariaLabel="预清洗气体"
          disabled={disabled}
          onChange={(nextValue) =>
            emitManualChange({ ...value, preWashingGas: nextValue })
          }
          options={gasOptions}
          placeholder="选择或输入气体"
          value={value.preWashingGas}
        />
      </div>

      {value.segments.length === 0 ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          尚未添加气体程序段
        </p>
      ) : null}

      {value.segments.map((segment, index) => {
        const totalComponentFlow = getSegmentTotalFlow(segment)
        const isAutoFlow = totalComponentFlow > 0
        return (
          <div key={`gas-segment-${index + 1}`} className="rounded-md border p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <span className="text-sm font-semibold">{`程序段 ${index + 1}`}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  emitManualChange({
                    ...value,
                    segments: value.segments.filter(
                      (_, segmentIndex) => segmentIndex !== index,
                    ),
                  })
                }}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                <span className="sr-only">删除程序段</span>
              </Button>
            </div>

            <div className="editor-grid">
              <div className="editor-field">
                <Label htmlFor={`gas-segment-${index}-stage`}>
                  {`阶段 ${index + 1}`}
                </Label>
                <Input
                  id={`gas-segment-${index}-stage`}
                  aria-label={`阶段 ${index + 1}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="例如 growth"
                  value={segment.stage}
                  onChange={(event) =>
                    updateSegment(index, { stage: event.target.value })
                  }
                />
              </div>
              <div className="editor-field">
                <Label>{`气体 ${index + 1}`}</Label>
                <VocabularyCombobox
                  ariaLabel={`气体 ${index + 1}`}
                  disabled={disabled}
                  onChange={(nextValue) =>
                    updateSegment(index, { gas: nextValue })
                  }
                  options={gasOptions}
                  placeholder="选择或输入气体"
                  value={segment.gas}
                />
              </div>
              <div className="editor-field">
                <Label htmlFor={`gas-segment-${index}-start`}>
                  {`开始时间 ${index + 1}`}
                </Label>
                <Input
                  id={`gas-segment-${index}-start`}
                  aria-label={`开始时间 ${index + 1}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="start_min"
                  value={segment.startMin}
                  onChange={(event) =>
                    updateSegment(index, { startMin: event.target.value })
                  }
                />
              </div>
              <div className="editor-field">
                <Label htmlFor={`gas-segment-${index}-end`}>
                  {`结束时间 ${index + 1}`}
                </Label>
                <Input
                  id={`gas-segment-${index}-end`}
                  aria-label={`结束时间 ${index + 1}`}
                  autoComplete="off"
                  disabled={disabled}
                  placeholder="end_min"
                  value={segment.endMin}
                  onChange={(event) =>
                    updateSegment(index, { endMin: event.target.value })
                  }
                />
              </div>
              <div className="editor-field">
                <Label htmlFor={`gas-segment-${index}-flow`}>
                  {`流量 ${index + 1}`}
                </Label>
                {isAutoFlow ? (
                  <Input
                    id={`gas-segment-${index}-flow`}
                    aria-label={`流量 ${index + 1}`}
                    autoComplete="off"
                    disabled
                    placeholder="由组分流量自动合计"
                    value={String(totalComponentFlow)}
                  />
                ) : (
                  <Input
                    id={`gas-segment-${index}-flow`}
                    aria-label={`流量 ${index + 1}`}
                    autoComplete="off"
                    disabled={disabled}
                    placeholder="flow_sccm"
                    value={segment.flowSccm}
                    onChange={(event) =>
                      updateSegment(index, { flowSccm: event.target.value })
                    }
                  />
                )}
              </div>
              <div className="editor-field editor-field-wide">
                <Label htmlFor={`gas-segment-${index}-note`}>
                  {`程序段备注 ${index + 1}`}
                </Label>
                <Textarea
                  id={`gas-segment-${index}-note`}
                  aria-label={`程序段备注 ${index + 1}`}
                  disabled={disabled}
                  rows={2}
                  placeholder="记录该阶段的补充说明"
                  value={segment.note}
                  onChange={(event) =>
                    updateSegment(index, { note: event.target.value })
                  }
                />
              </div>

              <div className="editor-field editor-field-wide">
                <Label asChild>
                  <span>{`组分配置 ${index + 1}`}</span>
                </Label>
                <div className="flex flex-col gap-3">
                  {segment.components.map((component, componentIndex) => (
                    <div
                      key={`gas-segment-${index + 1}-component-${componentIndex + 1}`}
                      className="rounded-md border p-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <span className="text-xs font-medium text-muted-foreground">
                          {`组分 ${index + 1}-${componentIndex + 1}`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          onClick={() => {
                            updateSegment(index, {
                              components: segment.components.filter(
                                (_, currentComponentIndex) =>
                                  currentComponentIndex !== componentIndex,
                              ),
                            })
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">删除组分</span>
                        </Button>
                      </div>
                      <div className="editor-grid">
                        <div className="editor-field">
                          <Label>{`组件气体 ${index + 1}-${componentIndex + 1}`}</Label>
                          <VocabularyCombobox
                            ariaLabel={`组件气体 ${index + 1}-${componentIndex + 1}`}
                            disabled={disabled}
                            onChange={(nextValue) =>
                              updateComponent(index, componentIndex, {
                                gas: nextValue,
                              })
                            }
                            options={gasOptions}
                            placeholder="选择或输入气体"
                            value={component.gas}
                          />
                        </div>
                        <div className="editor-field">
                          <Label
                            htmlFor={`gas-${index}-component-${componentIndex}-flow`}
                          >
                            {`组分流量 ${index + 1}-${componentIndex + 1}`}
                          </Label>
                          <Input
                            id={`gas-${index}-component-${componentIndex}-flow`}
                            aria-label={`组分流量 ${index + 1}-${componentIndex + 1}`}
                            autoComplete="off"
                            disabled={disabled}
                            placeholder="sccm"
                            value={component.flowSccm}
                            onChange={(event) =>
                              updateComponent(index, componentIndex, {
                                flowSccm: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="editor-field">
                          <Label
                            htmlFor={`gas-${index}-component-${componentIndex}-percent`}
                          >
                            {`占比 ${index + 1}-${componentIndex + 1}`}
                          </Label>
                          <Input
                            id={`gas-${index}-component-${componentIndex}-percent`}
                            aria-label={`占比 ${index + 1}-${componentIndex + 1}`}
                            autoComplete="off"
                            disabled
                            placeholder="自动计算"
                            value={
                              computeComponentPercent(
                                component.flowSccm,
                                totalComponentFlow,
                              ) ?? ''
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        updateSegment(index, {
                          components: [
                            ...segment.components,
                            createEmptyGasComponent(),
                          ],
                        })
                      }}
                    >
                      <Plus className="size-4" />
                      添加组分
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            emitManualChange({
              ...value,
              segments: [...value.segments, createEmptyGasSegment()],
            })
          }}
        >
          <Plus className="size-4" />
          添加气体程序段
        </Button>
      </div>
    </div>
  )
}
