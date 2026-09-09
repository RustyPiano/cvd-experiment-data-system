import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RequiredMark } from '@/shared/ui/required-mark'
import { FormulaInput } from './components/formula-input'
import { ModuleCard } from './components/module-card'
import { TargetBulkPhaseSelect } from './components/target-bulk-phase-select'
import {
  ELEMENT_SYMBOLS,
  formatChemicalFormula,
  generateSolidSolutionFormula,
  validateChemicalFormula,
} from './formula'
import {
  commonSuggestedBulkSpaceGroups,
  suggestedBulkSpaceGroups,
} from './space-groups'
import {
  targetSummary,
  targetValidationIssue,
} from './scientific-form-workflow'
import { changeTargetKind, targetKind } from './simple-preparation-editors'
import type {
  SimpleTarget,
  SimpleRegion,
  SimpleCompositionRelation,
  TargetKind,
} from './simple-preparation-editors'

const number = (value: string) =>
  value.trim() === '' ? undefined : Number(value)
const FORM_OPTIONS = {
  planar: '片/膜状',
  ribbon: '带状',
  wire: '线状',
  tube: '管状',
  rod: '棒状',
  particle: '颗粒状',
  bulk_crystal: '块状',
  other: '其他',
}
const OUTLINE_OPTIONS = {
  triangle: '三角形',
  truncated_triangle: '截角三角形',
  hexagon: '六边形',
  quadrilateral: '四边形（矩形/平行四边形/菱形）',
  other_regular_polygon: '其他多边形',
  circular_elliptical: '圆形/椭圆形',
  lobed_star: '星形/多裂片状',
  dendritic_fractal: '枝晶状',
  irregular: '不规则',
  other: '其他',
}

function Choice({
  label,
  value,
  options,
  disabled,
  onChange,
  required = false,
}: {
  label: string
  value?: string
  options: Record<string, string>
  disabled: boolean
  required?: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>
        {label} {required ? <RequiredMark /> : null}
      </FieldLabel>
      <Select
        value={value || 'unspecified'}
        onValueChange={(next) => onChange(next === 'unspecified' ? '' : next)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full" aria-label={label}>
          <SelectValue placeholder="请选择" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {!required ? (
              <SelectItem value="unspecified">不指定</SelectItem>
            ) : null}
            {Object.keys(options).some((code) => code.endsWith('_site')) ? (
              <>
                <SelectLabel>取代位点</SelectLabel>
                {Object.entries(options)
                  .filter(([code]) => code.endsWith('_site'))
                  .map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name}
                    </SelectItem>
                  ))}
                <SelectLabel>非取代位点</SelectLabel>
                {Object.entries(options)
                  .filter(([code]) => !code.endsWith('_site'))
                  .map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {name}
                    </SelectItem>
                  ))}
              </>
            ) : (
              Object.entries(options).map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))
            )}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function TargetMaterialEditor({
  region,
  relations,
  onChange,
  disabled,
  showErrors,
}: {
  region: SimpleRegion
  relations: SimpleCompositionRelation[]
  disabled: boolean
  showErrors?: boolean
  onChange: (
    region: SimpleRegion,
    relations: SimpleCompositionRelation[],
  ) => void
}) {
  const id = useId()
  const [phaseWarning, setPhaseWarning] = useState(false)
  const [compositionDraft, setCompositionDraft] = useState<{
    region: SimpleRegion
    relations: SimpleCompositionRelation[]
  }>()
  const alloy = relations.filter(
    (item) => item.relation_type === 'solid_solution_component',
  )
  const dopants = relations.filter((item) => item.relation_type === 'doped_by')
  const setDopants = (next: SimpleCompositionRelation[]) =>
    onChange(region, [
      ...relations.filter((item) => item.relation_type !== 'doped_by'),
      ...next,
    ])
  const setAlloy = (next: SimpleCompositionRelation[]) => {
    const formula =
      generateSolidSolutionFormula(
        next.map((item) => ({
          formula: item.species,
          fraction: item.nominal_value,
        })),
      ) ?? ''
    const previous = commonSuggestedBulkSpaceGroups(
      alloy.map((item) => item.species),
    )
    const candidates = commonSuggestedBulkSpaceGroups(
      next.map((item) => item.species),
    )
    const clear =
      previous.some((item) => item.phase === region.target_bulk_phase) &&
      !candidates.some((item) => item.phase === region.target_bulk_phase)
    if (clear) setPhaseWarning(true)
    onChange(
      {
        ...region,
        formula,
        ...(clear
          ? {
              target_bulk_phase: undefined,
              target_bulk_space_group_number: undefined,
            }
          : {}),
      },
      [
        ...relations.filter(
          (item) => item.relation_type !== 'solid_solution_component',
        ),
        ...next,
      ],
    )
  }
  const changeFormula = (formula: string) => {
    const previous = suggestedBulkSpaceGroups(region.formula)
    const clear =
      previous.some((item) => item.phase === region.target_bulk_phase) &&
      !suggestedBulkSpaceGroups(formula).some(
        (item) => item.phase === region.target_bulk_phase,
      )
    const elements = validateChemicalFormula(formula).elements
    if (clear) setPhaseWarning(true)
    onChange(
      {
        ...region,
        formula,
        ...(clear
          ? {
              target_bulk_phase: undefined,
              target_bulk_space_group_number: undefined,
            }
          : {}),
      },
      relations.map((item) =>
        item.site_or_location?.endsWith('_site') &&
        !elements.includes(item.site_or_location.slice(0, -5))
          ? { ...item, site_or_location: undefined }
          : item,
      ),
    )
  }
  const newDopant = (): SimpleCompositionRelation => ({
    relation_type: 'doped_by',
    host_region_key: region.region_key,
    species: '',
    value_basis: 'unspecified',
  })
  return (
    <FieldGroup>
      <Choice
        label="组成填写方式"
        value={alloy.length ? 'alloy' : 'formula'}
        options={{ formula: '化学式', alloy: '合金组分' }}
        required
        disabled={disabled}
        onChange={(value) => {
          setCompositionDraft({ region, relations })
          if (
            compositionDraft &&
            Boolean(
              compositionDraft.relations.some(
                (item) => item.relation_type === 'solid_solution_component',
              ),
            ) ===
              (value === 'alloy')
          ) {
            onChange(
              {
                ...compositionDraft.region,
                target_layer_count: region.target_layer_count,
              },
              [
                ...compositionDraft.relations.filter(
                  (item) => item.relation_type !== 'doped_by',
                ),
                ...dopants,
              ],
            )
          } else if (value === 'alloy')
            setAlloy(
              [region.formula, ''].map((species) => ({
                relation_type: 'solid_solution_component',
                host_region_key: region.region_key,
                species,
                value_basis: 'mol_fraction',
              })),
            )
          else
            onChange(
              region,
              relations.filter(
                (item) => item.relation_type !== 'solid_solution_component',
              ),
            )
        }}
      />
      {alloy.length ? (
        <FieldGroup>
          <FieldDescription>各组分的目标摩尔分数之和为 1。</FieldDescription>
          {alloy.map((component, index) => (
            <fieldset key={index} className="rounded-lg border p-3">
              <legend className="px-1 text-sm">
                组分 {String.fromCharCode(65 + index)}
              </legend>
              <FieldGroup className="sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel>
                    材料化学式 <RequiredMark />
                  </FieldLabel>
                  <FormulaInput
                    value={component.species}
                    disabled={disabled}
                    required
                    showErrors={showErrors}
                    placeholder={index === 0 ? '例如 MoS2' : '例如 WS2'}
                    onChange={(species) =>
                      setAlloy(
                        alloy.map((item, position) =>
                          position === index ? { ...item, species } : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-fraction-${index}`}>
                    目标摩尔分数 <RequiredMark />
                  </FieldLabel>
                  <Input
                    id={`${id}-fraction-${index}`}
                    type="number"
                    min="0"
                    max="1"
                    step="any"
                    value={component.nominal_value ?? ''}
                    disabled={disabled}
                    aria-invalid={Boolean(
                      showErrors &&
                      !(
                        component.nominal_value! > 0 &&
                        component.nominal_value! < 1
                      ),
                    )}
                    onChange={(event) =>
                      setAlloy(
                        alloy.map((item, position) =>
                          position === index
                            ? {
                                ...item,
                                nominal_value: number(event.target.value),
                                value_basis: 'mol_fraction',
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
              </FieldGroup>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || alloy.length <= 2}
                onClick={() =>
                  setAlloy(alloy.filter((_, position) => position !== index))
                }
              >
                <Trash2 data-icon="inline-start" />
                移除组分 {index + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              setAlloy([
                ...alloy,
                {
                  relation_type: 'solid_solution_component',
                  host_region_key: region.region_key,
                  species: '',
                  value_basis: 'mol_fraction',
                },
              ])
            }
          >
            <Plus data-icon="inline-start" />
            添加组分
          </Button>
          <p className="text-sm">
            目标化学式：
            {region.formula
              ? formatChemicalFormula(region.formula)
              : '请填写有效组分及比例'}
          </p>
        </FieldGroup>
      ) : (
        <Field
          data-invalid={Boolean(
            showErrors && !validateChemicalFormula(region.formula).valid,
          )}
        >
          <FieldLabel htmlFor={`${id}-formula`}>
            材料化学式 <RequiredMark />
          </FieldLabel>
          <FormulaInput
            id={`${id}-formula`}
            value={region.formula}
            required
            showErrors={showErrors}
            placeholder="例如 MoS2"
            disabled={disabled}
            onChange={changeFormula}
          />
        </Field>
      )}
      <TargetBulkPhaseSelect
        formula={region.formula}
        candidateFormulas={
          alloy.length ? alloy.map((item) => item.species) : undefined
        }
        phase={region.target_bulk_phase}
        spaceGroupNumber={region.target_bulk_space_group_number}
        disabled={disabled}
        onChange={(phase, group) => {
          setPhaseWarning(false)
          onChange(
            {
              ...region,
              target_bulk_phase: phase,
              target_bulk_space_group_number: group,
            },
            relations,
          )
        }}
      />
      {phaseWarning ? (
        <p role="status" className="text-sm text-muted-foreground">
          化学式已变更，原晶体结构选择已清除，请重新选择。
        </p>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${id}-layers`}>目标层数</FieldLabel>
        <Input
          id={`${id}-layers`}
          type="number"
          min="1"
          step="1"
          value={region.target_layer_count ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              { ...region, target_layer_count: number(event.target.value) },
              relations,
            )
          }
        />
        <FieldDescription>
          仅层状材料填写；例如单层 MoS₂ 填 1，非层状材料留空。
        </FieldDescription>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id={`${id}-doping`}
          checked={dopants.length > 0}
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (
              !checked &&
              dopants.some((item) => item.species.trim()) &&
              !window.confirm(
                '取消掺杂目标将移除本区域已填写的掺杂信息，是否继续？',
              )
            )
              return
            setDopants(checked ? [newDopant()] : [])
          }}
        />
        <FieldLabel htmlFor={`${id}-doping`}>填写掺杂目标</FieldLabel>
      </Field>
      {dopants.map((dopant, index) => {
        const patch = (value: Partial<SimpleCompositionRelation>) =>
          setDopants(
            dopants.map((item, position) =>
              position === index ? { ...item, ...value } : item,
            ),
          )
        const basis =
          dopant.value_basis === 'mol_fraction' ? 'mol_fraction' : 'at_percent'
        const displayed =
          dopant.nominal_value === undefined
            ? ''
            : dopant.nominal_value * (basis === 'mol_fraction' ? 100 : 1)
        const site = dopant.site_or_location ?? 'unspecified'
        return (
          <fieldset key={index} className="rounded-lg border p-3">
            <legend className="px-1 text-sm">掺杂目标 {index + 1}</legend>
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${id}-dopant-${index}`}>
                  掺杂元素 <RequiredMark />
                </FieldLabel>
                <Input
                  id={`${id}-dopant-${index}`}
                  value={dopant.species}
                  list={`${id}-elements`}
                  disabled={disabled}
                  aria-invalid={Boolean(
                    showErrors &&
                    !ELEMENT_SYMBOLS.includes(dopant.species as never),
                  )}
                  placeholder="例如 Nb"
                  onChange={(event) => patch({ species: event.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-amount-${index}`}>
                  目标掺杂含量
                </FieldLabel>
                <Input
                  id={`${id}-amount-${index}`}
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={displayed}
                  disabled={disabled}
                  onChange={(event) => {
                    const value = number(event.target.value)
                    patch({
                      nominal_value:
                        value === undefined
                          ? undefined
                          : value / (basis === 'mol_fraction' ? 100 : 1),
                      value_basis: value === undefined ? 'unspecified' : basis,
                    })
                  }}
                />
              </Field>
              <Choice
                label="掺杂含量单位"
                value={basis}
                options={{ at_percent: 'at.%', mol_fraction: 'mol.%' }}
                required
                disabled={disabled}
                onChange={(value) =>
                  patch({
                    value_basis:
                      value as SimpleCompositionRelation['value_basis'],
                    nominal_value:
                      dopant.nominal_value === undefined
                        ? undefined
                        : Number(displayed) /
                          (value === 'mol_fraction' ? 100 : 1),
                  })
                }
              />
              <Choice
                label="目标掺杂位点"
                value={site.startsWith('other:') ? 'other' : site}
                options={{
                  ...Object.fromEntries(
                    validateChemicalFormula(region.formula).elements.map(
                      (element) => [`${element}_site`, `${element} 位点`],
                    ),
                  ),
                  interstitial: '间隙位点',
                  interlayer: '层间位置',
                  surface: '表面位置',
                  unspecified: '未指定',
                  other: '其他',
                }}
                required
                disabled={disabled}
                onChange={(value) =>
                  patch({
                    site_or_location:
                      value === 'other' ? 'other:' : value || 'unspecified',
                  })
                }
              />
              {site.startsWith('other:') ? (
                <Field>
                  <FieldLabel htmlFor={`${id}-site-${index}`}>
                    其他掺杂位点 <RequiredMark />
                  </FieldLabel>
                  <Input
                    id={`${id}-site-${index}`}
                    value={site.slice(6)}
                    disabled={disabled}
                    onChange={(event) =>
                      patch({ site_or_location: `other:${event.target.value}` })
                    }
                  />
                </Field>
              ) : null}
            </FieldGroup>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() =>
                setDopants(dopants.filter((_, position) => position !== index))
              }
            >
              <Trash2 data-icon="inline-start" />
              移除掺杂目标 {index + 1}
            </Button>
          </fieldset>
        )
      })}
      {dopants.length ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setDopants([...dopants, newDopant()])}
        >
          <Plus data-icon="inline-start" />
          添加掺杂元素
        </Button>
      ) : null}
      <datalist id={`${id}-elements`}>
        {ELEMENT_SYMBOLS.map((element) => (
          <option value={element} key={element} />
        ))}
      </datalist>
    </FieldGroup>
  )
}

export function SimpleTargetEditor({
  target,
  onChange,
  onKindChange,
  disabled,
  showErrors,
}: {
  target: SimpleTarget
  onChange: (value: SimpleTarget) => void
  onKindChange?: (kind: TargetKind) => void
  disabled: boolean
  showErrors?: boolean
}) {
  const id = useId()
  const kind = targetKind(target)
  const legacyPlanar = ['continuous_film', 'discrete_planar_crystal'].includes(
    target.dimensional_form ?? '',
  )
  const shape = legacyPlanar ? 'planar' : target.dimensional_form
  const film =
    target.dimensional_form === 'continuous_film'
      ? 'continuous'
      : target.dimensional_form === 'discrete_planar_crystal'
        ? 'discrete'
        : target.film_form
  const issue = showErrors ? targetValidationIssue(target) : null
  const change = (patch: Partial<SimpleTarget>) =>
    onChange({ ...target, ...patch })
  const sortRegions = (regions: SimpleRegion[]) =>
    change({
      material_regions: regions.map((region, index) => ({
        ...region,
        layer_index: kind === 'vertical' ? index + 1 : undefined,
        lateral_region:
          kind === 'lateral' ? String.fromCharCode(65 + index) : undefined,
      })),
    })
  return (
    <ModuleCard id="module-target_product" title="目标材料">
      {issue ? (
        <p className="text-destructive text-sm" role="alert">
          {issue}
        </p>
      ) : null}
      <FieldGroup>
        <Choice
          label="结构形式"
          value={kind}
          options={{
            single: '单一区域',
            vertical: '垂直堆叠',
            lateral: '横向拼接',
          }}
          required
          disabled={disabled}
          onChange={(value) =>
            onKindChange
              ? onKindChange(value as TargetKind)
              : onChange(changeTargetKind(target, value as TargetKind))
          }
        />
        {kind === 'vertical' ? (
          <FieldDescription>
            材料按从下到上排列；每份材料的层数独立填写。
          </FieldDescription>
        ) : null}
        {target.material_regions.map((region, index) => (
          <fieldset key={region.region_key} className="rounded-lg border p-4">
            <legend className="px-1 font-medium">
              {kind === 'lateral'
                ? `区域 ${String.fromCharCode(65 + index)}`
                : `材料 ${index + 1}`}
            </legend>
            {kind !== 'single' ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {kind === 'vertical' ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled || index === 0}
                      onClick={() => {
                        const next = [...target.material_regions]
                        ;[next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ]
                        sortRegions(next)
                      }}
                    >
                      <ArrowUp data-icon="inline-start" />
                      上移
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        disabled || index === target.material_regions.length - 1
                      }
                      onClick={() => {
                        const next = [...target.material_regions]
                        ;[next[index + 1], next[index]] = [
                          next[index],
                          next[index + 1],
                        ]
                        sortRegions(next)
                      }}
                    >
                      <ArrowDown data-icon="inline-start" />
                      下移
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || target.material_regions.length <= 2}
                  onClick={() => {
                    if (!window.confirm('移除此材料及其组成、掺杂信息？'))
                      return
                    onChange({
                      ...target,
                      material_regions: target.material_regions
                        .filter((item) => item.region_key !== region.region_key)
                        .map((item, position) => ({
                          ...item,
                          layer_index:
                            kind === 'vertical' ? position + 1 : undefined,
                          lateral_region:
                            kind === 'lateral'
                              ? String.fromCharCode(65 + position)
                              : undefined,
                        })),
                      composition_relations:
                        target.composition_relations.filter(
                          (item) => item.host_region_key !== region.region_key,
                        ),
                    })
                  }}
                >
                  <Trash2 data-icon="inline-start" />
                  移除材料
                </Button>
              </div>
            ) : null}
            <TargetMaterialEditor
              region={region}
              relations={target.composition_relations.filter(
                (item) => item.host_region_key === region.region_key,
              )}
              disabled={disabled}
              showErrors={showErrors}
              onChange={(nextRegion, relations) =>
                change({
                  material_regions: target.material_regions.map((item) =>
                    item.region_key === region.region_key ? nextRegion : item,
                  ),
                  composition_relations: [
                    ...target.composition_relations.filter(
                      (item) => item.host_region_key !== region.region_key,
                    ),
                    ...relations,
                  ],
                })
              }
            />
          </fieldset>
        ))}
        {kind !== 'single' ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              sortRegions([
                ...target.material_regions,
                {
                  region_key: `region_${crypto.randomUUID().replaceAll('-', '')}`,
                  formula: '',
                  spatial_role:
                    kind === 'vertical' ? 'layer' : 'lateral_region',
                },
              ])
            }
          >
            <Plus data-icon="inline-start" />
            {kind === 'vertical' ? '添加材料' : '添加区域'}
          </Button>
        ) : null}
        <p className="text-sm">
          目标材料预览：{targetSummary(target) || '请填写目标材料'}
        </p>
        <FieldGroup className="sm:grid sm:grid-cols-2">
          <Choice
            label="目标几何形态"
            value={shape}
            options={FORM_OPTIONS}
            disabled={disabled}
            onChange={(value) =>
              change({
                dimensional_form: (value ||
                  undefined) as SimpleTarget['dimensional_form'],
                film_form: value === 'planar' ? film : undefined,
                dimensional_form_other:
                  value === 'other' ? target.dimensional_form_other : undefined,
                in_plane_outline:
                  value === 'planar' ? target.in_plane_outline : undefined,
                in_plane_outline_other:
                  value === 'planar'
                    ? target.in_plane_outline_other
                    : undefined,
              })
            }
          />
          {shape === 'planar' ? (
            <Choice
              label="目标成膜形式"
              value={film}
              options={{ discrete: '分立片状', continuous: '连续膜' }}
              disabled={disabled}
              onChange={(value) =>
                change({
                  dimensional_form: 'planar',
                  film_form: (value || undefined) as SimpleTarget['film_form'],
                  in_plane_outline:
                    value === 'discrete' ? target.in_plane_outline : undefined,
                  in_plane_outline_other:
                    value === 'discrete'
                      ? target.in_plane_outline_other
                      : undefined,
                })
              }
            />
          ) : null}
          {shape === 'other' ? (
            <Field>
              <FieldLabel htmlFor={`${id}-form-other`}>其他目标形态</FieldLabel>
              <Input
                id={`${id}-form-other`}
                value={target.dimensional_form_other ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  change({
                    dimensional_form_other: event.target.value || undefined,
                  })
                }
              />
            </Field>
          ) : null}
          {shape === 'planar' && film === 'discrete' ? (
            <Choice
              label="目标平面轮廓"
              value={target.in_plane_outline}
              options={OUTLINE_OPTIONS}
              disabled={disabled}
              onChange={(value) =>
                change({
                  in_plane_outline: (value ||
                    undefined) as SimpleTarget['in_plane_outline'],
                  in_plane_outline_other: [
                    'other',
                    'other_regular_polygon',
                  ].includes(value)
                    ? target.in_plane_outline_other
                    : undefined,
                })
              }
            />
          ) : null}
          {shape === 'planar' &&
          film === 'discrete' &&
          ['other', 'other_regular_polygon'].includes(
            target.in_plane_outline ?? '',
          ) ? (
            <Field>
              <FieldLabel htmlFor={`${id}-outline-other`}>
                其他轮廓名称
              </FieldLabel>
              <Input
                id={`${id}-outline-other`}
                placeholder="例如 五边形"
                value={target.in_plane_outline_other ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  change({
                    in_plane_outline_other: event.target.value || undefined,
                  })
                }
              />
            </Field>
          ) : null}
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-objective`}>实验目标</FieldLabel>
          <Textarea
            id={`${id}-objective`}
            value={target.optimization_objective ?? ''}
            disabled={disabled}
            onChange={(event) =>
              change({ optimization_objective: event.target.value })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>补充说明</FieldLabel>
          <Textarea
            id={`${id}-note`}
            value={target.note ?? ''}
            disabled={disabled}
            onChange={(event) => change({ note: event.target.value })}
          />
        </Field>
      </FieldGroup>
    </ModuleCard>
  )
}
