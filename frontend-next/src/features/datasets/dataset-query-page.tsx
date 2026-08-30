import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Download, Plus, Search, Trash2 } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { queryDataset } from '@/features/experiments-v2/api'
import type { DatasetFilter } from '@/features/experiments-v2/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { characterizationProperties } from '@/shared/generated/field-metadata'
import { triggerBlobDownload } from '@/shared/lib/download'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type ValueType = 'text' | 'number' | 'boolean' | 'growth'
export const MAX_DATASET_FILTERS = 50
export type FilterDraft = {
  field: string
  operator: string
  value: string
  propertyCode: string
}

const FIELD_TYPES: Record<string, ValueType> = {
  target_formula: 'text',
  architecture_type: 'text',
  setup_id: 'text',
  material_lot_id: 'text',
  substrate_material: 'text',
  max_temperature_setpoint_C: 'number',
  max_temperature_measured_C: 'number',
  ramp_rate_setpoint_C_min: 'number',
  ramp_rate_measured_C_min: 'number',
  growth_duration_s: 'number',
  pressure_setpoint_min_Pa: 'number',
  pressure_setpoint_max_Pa: 'number',
  pressure_measured_min_Pa: 'number',
  pressure_measured_max_Pa: 'number',
  gas_species: 'text',
  has_process_event: 'boolean',
  growth_presence: 'growth',
  property: 'number',
  provenance_complete: 'boolean',
}
const FIELD_LABELS: Record<string, string> = {
  target_formula: '目标化学式',
  architecture_type: '空间架构',
  setup_id: '实验装置',
  material_lot_id: '物料批次',
  substrate_material: '衬底材料',
  max_temperature_setpoint_C: '最高设定温度（°C）',
  max_temperature_measured_C: '最高实测温度（°C）',
  ramp_rate_setpoint_C_min: '最大设定升温速率（°C/min）',
  ramp_rate_measured_C_min: '最大实测升温速率（°C/min）',
  growth_duration_s: '生长时长（s）',
  pressure_setpoint_min_Pa: '最低设定压力（Pa）',
  pressure_setpoint_max_Pa: '最高设定压力（Pa）',
  pressure_measured_min_Pa: '最低实测压力（Pa）',
  pressure_measured_max_Pa: '最高实测压力（Pa）',
  gas_species: '气体种类',
  has_process_event: '是否有过程事件',
  growth_presence: '实际生长结论',
  property: '实测属性',
  provenance_complete: '溯源是否完整',
}
const OPERATOR_LABELS: Record<string, string> = {
  eq: '等于',
  ne: '不等于',
  lt: '小于',
  lte: '小于或等于',
  gt: '大于',
  gte: '大于或等于',
  contains: '包含',
  between: '介于',
}
export const DATASET_PROPERTY_OPTIONS = Object.entries(
  characterizationProperties,
)
  .filter(([, property]) => property.value_type === 'numeric')
  .map(([code, property]) => ({
    code,
    label: `${property.label_zh}${property.unit && property.unit !== '—' ? `（${property.unit}）` : ''}`,
  }))

const operators = (type: ValueType) =>
  type === 'boolean' || type === 'growth'
    ? ['eq', 'ne']
    : type === 'number'
      ? ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between']
      : ['eq', 'ne', 'contains']

export function datasetFilterIssue(item: FilterDraft): string | null {
  const value = item.value.trim()
  if (!value) return '请填写筛选值'
  if (FIELD_TYPES[item.field] === 'text') {
    return value.length <= 255 ? null : '筛选值不能超过 255 个字符'
  }
  if (FIELD_TYPES[item.field] !== 'number') return null
  if (item.operator !== 'between') {
    return Number.isFinite(Number(item.value.trim())) ? null : '请输入有效数值'
  }
  const parts = item.value.split(',').map((part) => part.trim())
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || !Number.isFinite(Number(part)))
  ) {
    return '请按“下限,上限”填写两个有效数值'
  }
  return Number(parts[0]) <= Number(parts[1]) ? null : '上限不能小于下限'
}

export const canAddDatasetFilter = (count: number) =>
  count < MAX_DATASET_FILTERS

export function toDatasetFilter(item: FilterDraft): DatasetFilter {
  const issue = datasetFilterIssue(item)
  if (issue) throw new Error(issue)
  const type = FIELD_TYPES[item.field]
  const value =
    type === 'number'
      ? item.operator === 'between'
        ? item.value.split(',').map((part) => Number(part.trim()))
        : Number(item.value.trim())
      : type === 'boolean'
        ? item.value === 'true'
        : item.value.trim()
  return {
    field: item.field,
    operator: item.operator,
    value,
    ...(item.field === 'property' ? { property_code: item.propertyCode } : {}),
  }
}

export function DatasetQueryPage() {
  const { session } = useAuth()
  const [filters, setFilters] = useState<FilterDraft[]>([
    {
      field: 'target_formula',
      operator: 'contains',
      value: '',
      propertyCode: 'coverage_percent',
    },
  ])
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof queryDataset>
  > | null>(null)
  const [frozenFilters, setFrozenFilters] = useState<DatasetFilter[] | null>(
    null,
  )
  const mutation = useMutation({
    mutationFn: ({
      cursor,
      queryFilters,
    }: {
      cursor?: string
      append: boolean
      queryFilters: DatasetFilter[]
    }) => queryDataset(queryFilters, session.accessToken || '', cursor),
    onSuccess: (data, variables) =>
      setResult((current) =>
        variables.append && current
          ? {
              ...data,
              items: [...current.items, ...data.items],
              query_manifest: {
                ...current.query_manifest,
                run_revision_ids: [...current.items, ...data.items].map(
                  (item) => item.run_revision_id,
                ),
              },
            }
          : data,
      ),
  })
  const clearResult = () => {
    setResult(null)
    setFrozenFilters(null)
    mutation.reset()
  }
  const patch = (index: number, value: Partial<FilterDraft>) => {
    clearResult()
    setFilters((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...value } : item,
      ),
    )
  }
  const hasFilterIssue = filters.some(datasetFilterIssue)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          科学数据集构建
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按不可变炉次修订的目标、物料、过程、事件、实际结论和测量属性筛选。
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>结构化查询条件</CardTitle>
          <CardDescription>
            条件使用 AND 组合；数值区间输入“下限,上限”。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {filters.map((filter, index) => {
            const type = FIELD_TYPES[filter.field]
            return (
              <div
                key={index}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1.3fr_1fr_1.5fr_auto]"
              >
                <Select
                  value={filter.field}
                  disabled={mutation.isPending}
                  onValueChange={(field) =>
                    patch(index, {
                      field,
                      operator: operators(FIELD_TYPES[field])[0],
                      value:
                        FIELD_TYPES[field] === 'boolean'
                          ? 'true'
                          : FIELD_TYPES[field] === 'growth'
                            ? 'present'
                            : '',
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`第 ${index + 1} 个筛选条件的字段`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(FIELD_TYPES).map((field) => (
                      <SelectItem key={field} value={field}>
                        {FIELD_LABELS[field]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filter.operator}
                  disabled={mutation.isPending}
                  onValueChange={(operator) => patch(index, { operator })}
                >
                  <SelectTrigger
                    aria-label={`第 ${index + 1} 个筛选条件的运算符`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators(type).map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {OPERATOR_LABELS[operator]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filter.field === 'property' ? (
                    <Select
                      value={filter.propertyCode}
                      disabled={mutation.isPending}
                      onValueChange={(propertyCode) =>
                        patch(index, { propertyCode })
                      }
                    >
                      <SelectTrigger
                        aria-label={`第 ${index + 1} 个筛选条件的实测属性`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATASET_PROPERTY_OPTIONS.map((property) => (
                          <SelectItem key={property.code} value={property.code}>
                            {property.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <FilterValue
                    ariaLabel={`第 ${index + 1} 个筛选条件的值`}
                    type={type}
                    value={filter.value}
                    between={filter.operator === 'between'}
                    disabled={mutation.isPending}
                    invalid={Boolean(datasetFilterIssue(filter))}
                    onChange={(value) => patch(index, { value })}
                  />
                  {datasetFilterIssue(filter) ? (
                    <p className="text-xs text-destructive" role="alert">
                      {datasetFilterIssue(filter)}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`删除第 ${index + 1} 个筛选条件`}
                  disabled={filters.length === 1 || mutation.isPending}
                  onClick={() => {
                    clearResult()
                    setFilters((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            )
          })}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={
                mutation.isPending || !canAddDatasetFilter(filters.length)
              }
              onClick={() => {
                if (!canAddDatasetFilter(filters.length)) return
                clearResult()
                setFilters((current) => [
                  ...current,
                  {
                    field: 'max_temperature_setpoint_C',
                    operator: 'between',
                    value: '',
                    propertyCode: 'coverage_percent',
                  },
                ])
              }}
            >
              <Plus /> 添加条件
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending || hasFilterIssue}
              onClick={() => {
                const queryFilters = filters.map(toDatasetFilter)
                setResult(null)
                setFrozenFilters(queryFilters)
                mutation.mutate({ append: false, queryFilters })
              }}
            >
              <Search /> 构建数据集
            </Button>
          </div>
        </CardContent>
      </Card>

      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(mutation.error, '结构化查询失败')}
          </AlertDescription>
        </Alert>
      ) : null}
      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
            <CardDescription className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {result.items.length} 条不可变修订
              </Badge>
              <Badge variant="outline">
                查询指纹{' '}
                {String(result.query_manifest['query_sha256']).slice(0, 12)}
              </Badge>
              <Badge variant="outline">
                schema {String(result.query_manifest['schema_version'])}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  triggerBlobDownload(
                    new Blob(
                      [
                        JSON.stringify(
                          {
                            ...result.query_manifest,
                            run_revision_ids: result.items.map(
                              (item) => item.run_revision_id,
                            ),
                          },
                          null,
                          2,
                        ),
                      ],
                      { type: 'application/json' },
                    ),
                    `cvd-dataset-${String(
                      result.query_manifest['query_sha256'],
                    ).slice(0, 12)}.json`,
                  )
                }
              >
                <Download /> 下载查询清单
              </Button>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>炉次</TableHead>
                  <TableHead>修订</TableHead>
                  <TableHead>目标区域</TableHead>
                  <TableHead>溯源完整</TableHead>
                  <TableHead>锁定时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((item) => (
                  <TableRow key={item.run_revision_id}>
                    <TableCell>
                      <Link
                        to="/experiments/$runId/edit"
                        params={{ runId: item.run_id }}
                        className="font-medium text-primary hover:underline"
                      >
                        {item.run_code}
                      </Link>
                    </TableCell>
                    <TableCell>v{item.revision_number}</TableCell>
                    <TableCell>{item.target_formulas.join(' / ')}</TableCell>
                    <TableCell>
                      {item.provenance_complete ? '完整' : '不完整'}
                    </TableCell>
                    <TableCell>
                      {new Date(item.locked_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {result.next_cursor ? (
              <Button
                type="button"
                className="mt-4"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => {
                  if (!frozenFilters) return
                  mutation.mutate({
                    cursor: result.next_cursor ?? undefined,
                    append: true,
                    queryFilters: frozenFilters,
                  })
                }}
              >
                加载更多
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function FilterValue({
  ariaLabel,
  type,
  value,
  between,
  disabled,
  invalid,
  onChange,
}: {
  ariaLabel: string
  type: ValueType
  value: string
  between: boolean
  disabled: boolean
  invalid: boolean
  onChange: (value: string) => void
}) {
  if (type === 'boolean' || type === 'growth') {
    const options =
      type === 'boolean'
        ? ['true', 'false']
        : ['present', 'absent', 'uncertain']
    return (
      <Select value={value} disabled={disabled} onValueChange={onChange}>
        <SelectTrigger aria-label={ariaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {type === 'boolean'
                ? option === 'true'
                  ? '是'
                  : '否'
                : {
                    present: '已生长',
                    absent: '未生长',
                    uncertain: '结论不确定',
                  }[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      maxLength={type === 'text' ? 255 : undefined}
      placeholder={between ? '下限,上限' : '值'}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
