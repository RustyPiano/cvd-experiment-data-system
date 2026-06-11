import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Download, Edit, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage, HttpError } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import type {
  ExperimentModuleKey,
  ExperimentModulePayloadRead,
  FileAssetRead,
  SetupMethodsRead,
} from '@/shared/types/api'
import { StatusTag, QualityTag } from '@/shared/ui/status-tag'
import { PageHeader } from '@/shared/ui/page-header'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { AuthenticatedImage } from '@/shared/ui/authenticated-image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  downloadExperimentExcel,
  downloadExperimentFile,
  exportExperimentJson,
  getExperiment,
  getSetupMethods,
  listExperimentAuditEvents,
  listExperimentFiles,
  listExperimentModules,
  listExperimentSamples,
} from './api'
import { ExperimentSourceBanner } from './components/experiment-source-banner'
import { ExperimentSummary } from './components/experiment-summary'
import { ExperimentStateActions } from './experiment-state-actions'

// ─── Route (imported by route file) ──────────────────────────────────────────
import { Route } from '@/routes/_authed/experiments/$experimentId/index'

// ─── Utility helpers (mirrors OLD detail page) ────────────────────────────────

function formatFileCategory(value: string) {
  if (value === 'raw') return '原始文件'
  if (value === 'processed') return '已处理'
  return value
}

function safeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function safeString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return ''
}

function safeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return []
}

function formatWithUnit(value: unknown, unit: string): string {
  const text = safeString(value)
  return text ? `${text} ${unit}` : ''
}

function joinReadableParts(parts: string[]): string {
  const visibleParts = parts.filter(Boolean)
  return visibleParts.length > 0 ? visibleParts.join(' / ') : '—'
}

function formatPrecursorPreparation(record: Record<string, unknown>) {
  const preSpinSpeed = safeString(record.pre_spin_speed_rpm)
  const preSpinTime = safeString(record.pre_spin_time_s)
  const spinSpeed = safeString(record.spin_speed_rpm)
  const spinTime = safeString(record.spin_time_s)
  const spinText = joinReadableParts([
    spinSpeed ? `${spinSpeed} rpm` : '',
    spinTime ? `${spinTime} s` : '',
  ])
  const preSpinText = joinReadableParts([
    preSpinSpeed ? `${preSpinSpeed} rpm` : '',
    preSpinTime ? `${preSpinTime} s` : '',
  ])
  return joinReadableParts([
    formatWithUnit(record.melting_temperature_C, '°C'),
    spinText !== '—' ? `旋涂 ${spinText}` : '',
    preSpinText !== '—' ? `预旋 ${preSpinText}` : '',
    formatWithUnit(record.preparation_time_min, 'min'),
  ])
}

function formatSubstrateTreatmentParams(record: Record<string, unknown>) {
  const params = safeRecord(record.treatment_params)
  return joinReadableParts([
    formatWithUnit(params.temperature_C, '°C'),
    formatWithUnit(params.duration_min, 'min'),
    formatWithUnit(params.power_W, 'W'),
    safeString(params.gas),
  ])
}

function formatGasComponents(value: unknown, segmentFlowSccm?: unknown) {
  const totalFlow =
    typeof segmentFlowSccm === 'number'
      ? segmentFlowSccm
      : Number(segmentFlowSccm)
  const components = safeArray(value)
    .map((component) => {
      const record = safeRecord(component)
      const name = safeString(record.name) || safeString(record.gas)
      const flow = record.flow_sccm ?? record.flowSccm
      const flowNum = Number(flow)
      if (!name && flow == null) return ''
      const label = name || '组分'
      if (Number.isFinite(flowNum)) {
        const pct =
          Number.isFinite(totalFlow) && totalFlow > 0
            ? `${Math.round((flowNum / totalFlow) * 10000) / 100}%`
            : null
        return pct
          ? `${label} ${flowNum} sccm (${pct})`
          : `${label} ${flowNum} sccm`
      }
      if (record.fraction != null) {
        const f = Number(record.fraction)
        if (Number.isFinite(f)) {
          const pct = Math.round(f * 10000) / 100
          return `${label}: ${pct}%`
        }
      }
      if (record.ratio_percent != null) {
        const rp = Number(record.ratio_percent)
        if (Number.isFinite(rp)) {
          return `${label}: ${Math.round(rp * 100) / 100}%`
        }
      }
      return label
    })
    .filter(Boolean)
  return components.length > 0 ? components.join('；') : '—'
}

function getModulePayload(
  modules: ExperimentModulePayloadRead[] | undefined,
  key: ExperimentModuleKey,
): Record<string, unknown> {
  const item = modules?.find((m) => m.module_key === key)
  return safeRecord(item?.payload_json)
}

// ─── Module render helpers ────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value || '—'}</span>
    </div>
  )
}

function PrecheckTag({
  value,
  normalValue,
}: {
  value: unknown
  normalValue: boolean
}) {
  if (value === true) {
    const isOk = normalValue === true
    return (
      <Badge
        className={
          isOk
            ? 'bg-success-soft text-success-text border-transparent'
            : 'bg-destructive-soft text-destructive-text border-transparent'
        }
      >
        是
      </Badge>
    )
  }
  if (value === false) {
    const isOk = normalValue === false
    return (
      <Badge
        className={
          isOk
            ? 'bg-success-soft text-success-text border-transparent'
            : 'bg-destructive-soft text-destructive-text border-transparent'
        }
      >
        否
      </Badge>
    )
  }
  return <Badge variant="outline">未检查</Badge>
}

function renderBasicInfoParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'basic_info')
  return (
    <div className="flex flex-col gap-2">
      <InfoRow label="材料体系" value={safeString(payload.material_system)} />
      <InfoRow label="层数" value={safeString(payload.layer_count)} />
      <InfoRow label="实验日期" value={safeString(payload.experiment_date)} />
      <InfoRow label="实验目标" value={safeString(payload.objective)} />
    </div>
  )
}

function renderEnvironmentParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'environment')
  return (
    <div className="flex flex-col gap-2">
      <InfoRow
        label="室内温度"
        value={
          safeString(payload.indoor_temperature_C)
            ? `${safeString(payload.indoor_temperature_C)} °C`
            : ''
        }
      />
      <InfoRow
        label="室内湿度"
        value={
          safeString(payload.indoor_humidity_percent)
            ? `${safeString(payload.indoor_humidity_percent)} %`
            : ''
        }
      />
      <InfoRow label="样品环境" value={safeString(payload.sample_env)} />
      <InfoRow label="异常记录" value={safeString(payload.abnormal_note)} />
    </div>
  )
}

function renderPrecheckParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'precheck')
  return (
    <div className="flex flex-col gap-2">
      {(
        [
          { label: '密封完好', key: 'seal_intact', normalValue: true },
          { label: '通风橱清洁', key: 'hood_clean', normalValue: true },
          { label: '法兰堵塞', key: 'flange_blocked', normalValue: false },
          {
            label: '瓷舟污染',
            key: 'boat_contamination_level',
            normalValue: false,
          },
          {
            label: '石英管污染',
            key: 'tube_contamination_level',
            normalValue: false,
          },
        ] as { label: string; key: string; normalValue: boolean }[]
      ).map(({ label, key, normalValue }) => (
        <div key={key} className="flex gap-3 text-sm items-center">
          <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
          <PrecheckTag value={payload[key]} normalValue={normalValue} />
        </div>
      ))}
      <InfoRow label="风险说明" value={safeString(payload.risk_note)} />
    </div>
  )
}

function renderPrecursorsParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'precursors')
  const items = safeArray(payload.items).map((item) => safeRecord(item))
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">无前驱体记录</p>
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {[
              '种类',
              '品牌',
              '浓度',
              '方法',
              '质量 (mg)',
              '制备参数',
              '批号',
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((record, i) => (
            <TableRow key={i}>
              <TableCell>{safeString(record.species) || '—'}</TableCell>
              <TableCell>{safeString(record.brand) || '—'}</TableCell>
              <TableCell>{`${safeString(record.concentration) || '—'} ${safeString(record.concentration_unit) || ''}`}</TableCell>
              <TableCell>{safeString(record.method) || '—'}</TableCell>
              <TableCell>{safeString(record.mass_mg) || '—'}</TableCell>
              <TableCell>{formatPrecursorPreparation(record)}</TableCell>
              <TableCell>{safeString(record.batch_no) || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function renderSubstratesParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'substrates')
  const items = safeArray(payload.items).map((item) => safeRecord(item))
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">无基底记录</p>
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {[
              '角色',
              '类型',
              '品牌',
              '尺寸 (mm)',
              '基底批次',
              '处理方法',
              '处理参数',
              '相对温区位置',
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((record, i) => (
            <TableRow key={i}>
              <TableCell>{safeString(record.role) || '—'}</TableCell>
              <TableCell>{safeString(record.type) || '—'}</TableCell>
              <TableCell>{safeString(record.brand) || '—'}</TableCell>
              <TableCell>{safeString(record.size_mm) || '—'}</TableCell>
              <TableCell>{safeString(record.batch_no) || '—'}</TableCell>
              <TableCell>
                {safeString(record.treatment_method) || '—'}
              </TableCell>
              <TableCell>{formatSubstrateTreatmentParams(record)}</TableCell>
              <TableCell>{safeString(record.position_mm) || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function furnacePlacements(
  payload: Record<string, unknown>,
  precursorItems: Record<string, unknown>[],
): Record<string, unknown>[] {
  const placements = safeArray(payload.placements).map((item) =>
    safeRecord(item),
  )
  if (placements.length > 0) {
    return placements.map((placement) => {
      const precursorIndex =
        typeof placement.precursor_index === 'number'
          ? placement.precursor_index
          : null
      const precursor =
        precursorIndex !== null &&
        Number.isInteger(precursorIndex) &&
        precursorIndex >= 0 &&
        precursorIndex < precursorItems.length
          ? precursorItems[precursorIndex]
          : {}
      return { ...placement, species: safeString(precursor.species) }
    })
  }
  return []
}

function renderFurnaceParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'furnace_program')
  const precursorItems = safeArray(
    getModulePayload(modules, 'precursors').items,
  ).map((item) => safeRecord(item))
  const furnaceInfo = safeRecord(payload.furnace_info)
  const placements = furnacePlacements(payload, precursorItems)
  const zones = safeArray(payload.zones).map((item) => safeRecord(item))

  if (zones.length === 0 && placements.length === 0 && !furnaceInfo.model) {
    return <p className="text-sm text-muted-foreground">无炉温程序记录</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3 text-sm">
        <span className="text-muted-foreground">炉子信息</span>
        <span>{safeString(furnaceInfo.model) || '—'}</span>
        {furnaceInfo.zones_count ? (
          <span className="text-muted-foreground">
            温区数：{safeString(furnaceInfo.zones_count)}
          </span>
        ) : null}
      </div>

      {placements.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium">前驱体放置</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['前驱体', '温区', '位置 (cm)', '备注'].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {placements.map((placement, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {safeString(placement.species) || '—'}
                    </TableCell>
                    <TableCell>
                      {safeString(placement.zone_key) || '—'}
                    </TableCell>
                    <TableCell>
                      {safeString(placement.position_cm) || '—'}
                    </TableCell>
                    <TableCell>{safeString(placement.note) || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {zones.map((zone, zoneIndex) => (
        <div key={safeString(zone.zone_key) || zoneIndex}>
          <p className="mb-2 text-sm font-medium">{`温区 ${zoneIndex + 1} 温度变化`}</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {['节点', '时间 (min)', '温度 (°C)', '说明'].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeArray(zone.temperature_program)
                  .map((item) => safeRecord(item))
                  .map((node, nodeIndex) => (
                    <TableRow key={nodeIndex}>
                      <TableCell>
                        {safeString(node.node_index) || '—'}
                      </TableCell>
                      <TableCell>{safeString(node.time_min) || '—'}</TableCell>
                      <TableCell>
                        {safeString(node.temperature_C) || '—'}
                      </TableCell>
                      <TableCell>{safeString(node.note) || '—'}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )
}

function renderGasParams(modules: ExperimentModulePayloadRead[] | undefined) {
  const payload = getModulePayload(modules, 'gas_program')
  const segments = safeArray(payload.segments).map((item) => safeRecord(item))
  const preWashingGas = safeString(payload.pre_washing_gas)
  if (segments.length === 0 && !preWashingGas) {
    return <p className="text-sm text-muted-foreground">无气体程序记录</p>
  }
  return (
    <div className="flex flex-col gap-4">
      <InfoRow label="预清洗气体" value={preWashingGas} />
      {segments.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  '阶段',
                  '气体',
                  '开始 (min)',
                  '结束 (min)',
                  '流量 (sccm)',
                  '组分',
                  '备注',
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((record, i) => (
                <TableRow key={i}>
                  <TableCell>{safeString(record.stage) || '—'}</TableCell>
                  <TableCell>{safeString(record.gas) || '—'}</TableCell>
                  <TableCell>{safeString(record.start_min) || '—'}</TableCell>
                  <TableCell>{safeString(record.end_min) || '—'}</TableCell>
                  <TableCell>{safeString(record.flow_sccm) || '—'}</TableCell>
                  <TableCell>
                    {formatGasComponents(record.components, record.flow_sccm)}
                  </TableCell>
                  <TableCell>{safeString(record.note) || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}

function renderProcessObservationParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'process_observation')
  const abnormalEvents = safeArray(payload.abnormal_events)
    .map((v) => safeString(v))
    .filter(Boolean)
  return (
    <div className="flex flex-col gap-2">
      <InfoRow label="颜色变化" value={safeString(payload.color_change)} />
      <InfoRow
        label="异常事件"
        value={abnormalEvents.length > 0 ? abnormalEvents.join('、') : ''}
      />
      <InfoRow label="备注" value={safeString(payload.note)} />
    </div>
  )
}

function renderCharacterizationParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'characterization')
  const methods = safeArray(payload.methods).map((item) => safeRecord(item))
  if (methods.length === 0) {
    return <p className="text-sm text-muted-foreground">无表征方法记录</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {methods.map((method, index) => (
        <div key={index} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {safeString(method.method) || '未命名方法'}
            </span>
            <Badge
              className={
                method.enabled
                  ? 'bg-success-soft text-success-text border-transparent text-xs'
                  : 'bg-secondary text-muted-foreground border-transparent text-xs'
              }
            >
              {method.enabled ? '启用' : '未启用'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            结果：{safeString(method.result) || '—'} · 激发波长：
            {safeString(method.excitation_nm) || '—'} nm · 备注：
            {safeString(method.note) || '—'}
          </p>
        </div>
      ))}
    </div>
  )
}

function renderResultSummaryParams(
  modules: ExperimentModulePayloadRead[] | undefined,
) {
  const payload = getModulePayload(modules, 'result_summary')
  return (
    <div className="flex flex-col gap-2">
      <InfoRow label="质量标签" value={safeString(payload.quality_label)} />
      <InfoRow label="总结结论" value={safeString(payload.summary_result)} />
      <InfoRow label="下一步" value={safeString(payload.next_step)} />
    </div>
  )
}

function renderSetupMethods(
  setupMethods: SetupMethodsRead | null | undefined,
  files: FileAssetRead[],
  token: string,
  onDownloadFile: (fileId: string, filename: string) => Promise<void>,
  activeFileDownload: string | null,
) {
  if (!setupMethods) {
    return (
      <p className="text-sm text-muted-foreground">无 Setup / Methods 记录</p>
    )
  }

  const diagramFile = files.find(
    (f) => f.id === setupMethods.diagram_file_asset_id,
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">
          {setupMethods.setup_name_snapshot}
          {setupMethods.institution_snapshot
            ? ` @ ${setupMethods.institution_snapshot}`
            : ''}
        </p>
        {setupMethods.source_setup_library_id ? (
          <p className="mt-1 text-xs text-muted-foreground">
            来源库 ID: {setupMethods.source_setup_library_id}
          </p>
        ) : null}
      </div>

      {diagramFile ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">装置示意图</p>
          <AuthenticatedImage
            url={`/api/v1/files/${diagramFile.id}/download`}
            token={token}
            alt={diagramFile.original_name}
            className="max-h-72 max-w-full rounded border border-border object-contain"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={activeFileDownload === diagramFile.id}
            onClick={() => {
              void onDownloadFile(diagramFile.id, diagramFile.original_name)
            }}
          >
            <Download className="mr-1.5 size-3.5" />
            下载装置示意图 ({diagramFile.original_name})
          </Button>
        </div>
      ) : null}

      {setupMethods.apparatus_description_snapshot ? (
        <div>
          <p className="mb-1 text-sm font-medium">装置说明</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {setupMethods.apparatus_description_snapshot}
          </p>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-sm font-medium">实验方法 (Methods)</p>
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {setupMethods.methods_text_snapshot || '—'}
        </p>
      </div>

      {setupMethods.sample_placement_description_snapshot ? (
        <div>
          <p className="mb-1 text-sm font-medium">样品放置</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {setupMethods.sample_placement_description_snapshot}
          </p>
        </div>
      ) : null}

      {setupMethods.reaction_flow_description_snapshot ? (
        <div>
          <p className="mb-1 text-sm font-medium">反应流程</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {setupMethods.reaction_flow_description_snapshot}
          </p>
        </div>
      ) : null}

      {setupMethods.reference_paper_url_snapshot ||
      setupMethods.unpublished_reason_snapshot ? (
        <div>
          <p className="mb-1 text-sm font-medium">文献引用 / 未发表说明</p>
          {setupMethods.reference_paper_url_snapshot ? (
            <a
              href={setupMethods.reference_paper_url_snapshot}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {setupMethods.reference_paper_url_snapshot}
            </a>
          ) : (
            <p className="text-sm text-foreground">
              未发表说明：{setupMethods.unpublished_reason_snapshot}
            </p>
          )}
        </div>
      ) : null}

      <Separator />
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          与 Setup 一致：{setupMethods.is_same_as_source ? '是' : '否'}
        </p>
        {!setupMethods.is_same_as_source && setupMethods.deviation_note ? (
          <div>
            <p className="text-sm font-medium text-warning">
              本次偏差说明 (Deviation Note)：
            </p>
            <p className="whitespace-pre-wrap text-sm">
              {setupMethods.deviation_note}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Module section card ──────────────────────────────────────────────────────

function ModuleCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ExperimentDetailPage() {
  const { experimentId } = Route.useParams()
  const { session } = useAuth()
  const currentUser = session.currentUser
  const [downloadState, setDownloadState] = useState<'excel' | 'json' | null>(
    null,
  )
  const [activeFileDownload, setActiveFileDownload] = useState<string | null>(
    null,
  )

  const experimentQuery = useQuery({
    queryKey: [
      'experiments',
      'detail',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const modulesQuery = useQuery({
    queryKey: [
      'experiments',
      'modules',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: () => listExperimentModules(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const setupMethodsQuery = useQuery({
    queryKey: [
      'experiments',
      'setup-methods',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: async () => {
      try {
        return await getSetupMethods(session.accessToken!, experimentId)
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const filesQuery = useQuery({
    queryKey: [
      'experiments',
      'files',
      currentUser?.id ?? 'anonymous',
      experimentId,
      'preview',
    ],
    queryFn: () => listExperimentFiles(session.accessToken!, { experimentId }),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const auditQuery = useQuery({
    queryKey: [
      'experiments',
      'audit',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: () =>
      listExperimentAuditEvents(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const samplesQuery = useQuery({
    queryKey: [
      'experiments',
      'samples',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: () => listExperimentSamples(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const handleExportJson = async () => {
    setDownloadState('json')
    try {
      const payload = await exportExperimentJson(
        session.accessToken!,
        experimentId,
      )
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      triggerBlobDownload(
        blob,
        `${experimentQuery.data?.run_code ?? 'experiment'}-export.json`,
      )
    } catch (error) {
      toast.error(resolveErrorMessage(error, 'JSON 导出失败'))
    } finally {
      setDownloadState(null)
    }
  }

  const handleExportExcel = async () => {
    setDownloadState('excel')
    try {
      const payload = await downloadExperimentExcel(
        session.accessToken!,
        experimentId,
      )
      triggerBlobDownload(
        payload.blob,
        payload.filename ||
          `${experimentQuery.data?.run_code ?? 'experiment'}.xlsx`,
      )
    } catch (error) {
      toast.error(resolveErrorMessage(error, 'Excel 导出失败'))
    } finally {
      setDownloadState(null)
    }
  }

  const handleFileDownload = async (fileId: string, filename: string) => {
    setActiveFileDownload(fileId)
    try {
      const payload = await downloadExperimentFile(session.accessToken!, fileId)
      triggerBlobDownload(payload.blob, payload.filename || filename)
    } catch (error) {
      toast.error(resolveErrorMessage(error, '文件下载失败'))
    } finally {
      setActiveFileDownload(null)
    }
  }

  // ─── Loading / error states ───────────────────────────────────────────────

  if (experimentQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="实验详情" />
        <LoadingState />
      </div>
    )
  }

  if (experimentQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="实验详情"
          subtitle="无法加载实验详情，请检查网络连接或当前账号权限。"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/experiments">
                <ArrowLeft className="mr-1.5 size-4" />
                返回列表
              </Link>
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(experimentQuery.error, '实验详情加载失败')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!experimentQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>实验详情暂不可用</AlertDescription>
      </Alert>
    )
  }

  const experiment = experimentQuery.data
  const fileItems = filesQuery.data?.items ?? []
  const filePreview = fileItems.slice(0, 5)
  const fileOverflow = fileItems.length > 5 ? fileItems.length - 5 : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="实验详情"
        subtitle="查看实验状态、样品、文件、审计记录，并导出数据。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/experiments">
                <ArrowLeft className="mr-1.5 size-4" />
                返回列表
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/experiments/$experimentId/files"
                params={{ experimentId }}
              >
                <FolderOpen className="mr-1.5 size-4" />
                管理文件
              </Link>
            </Button>
            {(experiment.status === 'draft' ||
              experiment.status === 'submitted') &&
            currentUser != null &&
            (currentUser.id === experiment.owner_id ||
              currentUser.role === 'admin') ? (
              <Button size="sm" asChild>
                <Link
                  to="/experiments/$experimentId/edit"
                  params={{ experimentId: experiment.id }}
                >
                  <Edit className="mr-1.5 size-4" />
                  {experiment.status === 'submitted' ? '编辑' : '继续编辑'}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <ExperimentSourceBanner experiment={experiment} />

      <Tabs defaultValue="overview">
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
          {(
            [
              ['overview', '概览'],
              ['parameters', '参数'],
              ['samples', '样品'],
              ['files', '文件'],
              ['audit', '审计'],
            ] as const
          ).map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0.5 pb-2.5 text-[15px] font-medium text-muted-foreground shadow-none transition-colors hover:text-foreground data-active:border-b-primary data-active:bg-transparent data-active:text-foreground data-active:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── 概览 Tab ── */}
        <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
          <Card>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                  {experiment.run_code}
                </code>
                <StatusTag status={experiment.status} />
                <QualityTag label={experiment.quality_label} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                草稿与已提交实验均可编辑（提交后改动会固化为新版本）；已锁定 /
                已作废实验仅保留可执行操作。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent>
              <ExperimentSummary experiment={experiment} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">导出</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                结构化 JSON 适合留档和二次分析，Excel 适合线下共享与手工复核。
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloadState !== null}
                  onClick={() => void handleExportJson()}
                >
                  <Download className="mr-1.5 size-3.5" />
                  {downloadState === 'json' ? '导出中…' : '导出 JSON'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloadState !== null}
                  onClick={() => void handleExportExcel()}
                >
                  <Download className="mr-1.5 size-3.5" />
                  {downloadState === 'excel' ? '导出中…' : '导出 Excel'}
                </Button>
              </div>
              {session.accessToken && currentUser ? (
                <ExperimentStateActions
                  accessToken={session.accessToken}
                  currentUser={currentUser}
                  experiment={experiment}
                  onUpdated={() => undefined}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 参数 Tab ── */}
        <TabsContent value="parameters" className="mt-4 flex flex-col gap-4">
          {modulesQuery.isLoading ? (
            <LoadingState />
          ) : modulesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(modulesQuery.error, '参数加载失败')}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <ModuleCard title="基础信息">
                {renderBasicInfoParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="Setup / Methods">
                {setupMethodsQuery.isLoading ? (
                  <LoadingState />
                ) : setupMethodsQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {resolveErrorMessage(
                        setupMethodsQuery.error,
                        'Setup / Methods 加载失败',
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  renderSetupMethods(
                    setupMethodsQuery.data,
                    fileItems,
                    session.accessToken!,
                    handleFileDownload,
                    activeFileDownload,
                  )
                )}
              </ModuleCard>
              <ModuleCard title="环境">
                {renderEnvironmentParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="预检查">
                {renderPrecheckParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="前驱体">
                {renderPrecursorsParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="基底">
                {renderSubstratesParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="炉温">
                {renderFurnaceParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="气体">
                {renderGasParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="过程观察">
                {renderProcessObservationParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="表征">
                {renderCharacterizationParams(modulesQuery.data?.items)}
              </ModuleCard>
              <ModuleCard title="结果总结">
                {renderResultSummaryParams(modulesQuery.data?.items)}
              </ModuleCard>
            </>
          )}
        </TabsContent>

        {/* ── 样品 Tab ── */}
        <TabsContent value="samples" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">样品概览</CardTitle>
            </CardHeader>
            <CardContent>
              {samplesQuery.isLoading ? (
                <LoadingState />
              ) : samplesQuery.isError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {resolveErrorMessage(
                      samplesQuery.error,
                      '样品概览加载失败',
                    )}
                  </AlertDescription>
                </Alert>
              ) : (samplesQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState description="当前实验还没有样品记录。在编辑器中添加基底后将自动生成样品。" />
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {samplesQuery.data!.items.map((sample) => (
                    <div
                      key={sample.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {sample.sample_code}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {sample.role} ·{' '}
                          {sample.substrate_type || '未填写基底'}
                          {sample.size_mm ? ` · ${sample.size_mm}` : ''}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to="/samples/$sampleId"
                          params={{ sampleId: sample.id }}
                        >
                          查看样品
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 文件 Tab ── */}
        <TabsContent value="files" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">文件概览</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link
                  to="/experiments/$experimentId/files"
                  params={{ experimentId }}
                >
                  <FolderOpen className="mr-1.5 size-4" />
                  管理文件
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {filesQuery.isLoading ? (
                <LoadingState />
              ) : filesQuery.isError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {resolveErrorMessage(filesQuery.error, '文件概览加载失败')}
                  </AlertDescription>
                </Alert>
              ) : fileItems.length === 0 ? (
                <EmptyState description="当前实验还没有文件记录。进入文件管理页可上传表征原始文件或处理结果。" />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col divide-y divide-border">
                    {filePreview.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {file.original_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {file.method} ·{' '}
                            {formatFileCategory(file.file_category)}
                            {file.note ? ` · ${file.note}` : ''}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={activeFileDownload === file.id}
                          onClick={() =>
                            void handleFileDownload(file.id, file.original_name)
                          }
                        >
                          <Download className="mr-1.5 size-3.5" />
                          {activeFileDownload === file.id ? '下载中…' : '下载'}
                        </Button>
                      </div>
                    ))}
                  </div>
                  {fileOverflow > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      还有 {fileOverflow} 个文件，{' '}
                      <Link
                        to="/experiments/$experimentId/files"
                        params={{ experimentId }}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        去管理页查看
                      </Link>
                    </p>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 审计 Tab ── */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">审计轨迹</CardTitle>
            </CardHeader>
            <CardContent>
              {auditQuery.isLoading ? (
                <LoadingState />
              ) : auditQuery.isError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {resolveErrorMessage(auditQuery.error, '审计轨迹加载失败')}
                  </AlertDescription>
                </Alert>
              ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
                <EmptyState description="当前实验还没有审计事件。创建、编辑、提交和文件操作会自动记录在这里。" />
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {(auditQuery.data?.items ?? [])
                    .slice()
                    .reverse()
                    .map((item, index) => (
                      <div key={index} className="py-3">
                        <code className="text-sm font-mono">{item.action}</code>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.entity_type} · {item.reason || '无附加原因'} ·{' '}
                          {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
