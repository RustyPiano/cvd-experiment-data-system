import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus, Search, Trash2 } from 'lucide-react'

import { useAuth } from '@/features/auth/use-auth'
import { queryDataset } from '@/features/experiments-v2/api'
import type { DatasetFilter } from '@/features/experiments-v2/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
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
type FilterDraft = {
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
  max_temperature_C: 'number',
  ramp_rate_C_min: 'number',
  growth_duration_s: 'number',
  pressure_min_Pa: 'number',
  pressure_max_Pa: 'number',
  gas_species: 'text',
  has_process_event: 'boolean',
  growth_presence: 'growth',
  property: 'number',
  provenance_complete: 'boolean',
}
const PROPERTY_CODES = [
  'coverage_percent',
  'domain_size_um',
  'layer_count',
  'nucleation_density_cm2',
  'raman_a1g_peak_position',
  'raman_e2g_peak_position',
  'raman_peak_separation',
  'pl_a_exciton_peak_energy',
  'afm_rms_roughness',
  'afm_step_height',
]

const operators = (type: ValueType) =>
  type === 'boolean' || type === 'growth'
    ? ['eq', 'ne']
    : type === 'number'
      ? ['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'between']
      : ['eq', 'ne', 'contains']

function toFilter(item: FilterDraft): DatasetFilter {
  const type = FIELD_TYPES[item.field]
  const value =
    type === 'number'
      ? item.operator === 'between'
        ? item.value.split(',').map(Number)
        : Number(item.value)
      : type === 'boolean'
        ? item.value === 'true'
        : item.value
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
  const mutation = useMutation({
    mutationFn: () =>
      queryDataset(filters.map(toFilter), session.accessToken || ''),
  })
  const patch = (index: number, value: Partial<FilterDraft>) =>
    setFilters((current) =>
      current.map((item, position) =>
        position === index ? { ...item, ...value } : item,
      ),
    )

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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(FIELD_TYPES).map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filter.operator}
                  onValueChange={(operator) => patch(index, { operator })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators(type).map((operator) => (
                      <SelectItem key={operator} value={operator}>
                        {operator}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid gap-2 sm:grid-cols-2">
                  {filter.field === 'property' ? (
                    <Select
                      value={filter.propertyCode}
                      onValueChange={(propertyCode) =>
                        patch(index, { propertyCode })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_CODES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <FilterValue
                    type={type}
                    value={filter.value}
                    between={filter.operator === 'between'}
                    onChange={(value) => patch(index, { value })}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={filters.length === 1}
                  onClick={() =>
                    setFilters((current) =>
                      current.filter((_, position) => position !== index),
                    )
                  }
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
              onClick={() =>
                setFilters((current) => [
                  ...current,
                  {
                    field: 'max_temperature_C',
                    operator: 'between',
                    value: '',
                    propertyCode: 'coverage_percent',
                  },
                ])
              }
            >
              <Plus /> 添加条件
            </Button>
            <Button
              type="button"
              disabled={
                mutation.isPending ||
                filters.some((filter) => !filter.value.trim())
              }
              onClick={() => mutation.mutate()}
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
      {mutation.data ? (
        <Card>
          <CardHeader>
            <CardTitle>查询结果</CardTitle>
            <CardDescription className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                {mutation.data.items.length} 条不可变修订
              </Badge>
              <Badge variant="outline">
                查询指纹{' '}
                {String(mutation.data.query_manifest['query_sha256']).slice(
                  0,
                  12,
                )}
              </Badge>
              <Badge variant="outline">
                schema {String(mutation.data.query_manifest['schema_version'])}
              </Badge>
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
                {mutation.data.items.map((item) => (
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
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function FilterValue({
  type,
  value,
  between,
  onChange,
}: {
  type: ValueType
  value: string
  between: boolean
  onChange: (value: string) => void
}) {
  if (type === 'boolean' || type === 'growth') {
    const options =
      type === 'boolean'
        ? ['true', 'false']
        : ['present', 'absent', 'uncertain']
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  return (
    <Input
      value={value}
      placeholder={between ? '下限,上限' : '值'}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
