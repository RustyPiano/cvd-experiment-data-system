import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Loader2, Upload } from 'lucide-react'

import { commitImport, listImportProfiles, previewImport } from './api'
import type { ImportCommitResultItem, ParsedExperimentDraft } from './api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { PageHeader } from '@/shared/ui/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

const MAX_FILE_SIZE = 50 * 1024 * 1024

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

function runLevelString(draft: ParsedExperimentDraft, key: string): string {
  const value = draft.run_level[key]
  return typeof value === 'string' ? value : ''
}

function precursorSummary(draft: ParsedExperimentDraft): string {
  const items = asArray(draft.module_payloads.precursors?.items)
  if (!items.length) return '—'
  return items
    .map((item) => {
      const species = (item.species as string) || '?'
      const mass = item.mass_mg
      return mass != null ? `${species} (${mass}mg)` : species
    })
    .join('、')
}

function substrateSummary(draft: ParsedExperimentDraft): string {
  const items = asArray(draft.module_payloads.substrates?.items)
  return (items[0]?.type as string) || '—'
}

function furnaceSummary(draft: ParsedExperimentDraft): string {
  const zones = asArray(draft.module_payloads.furnace_program?.zones)
  if (!zones.length) return '—'
  return zones
    .map((zone) => {
      const nodes = asArray(zone.temperature_program)
      return `${zone.zone_key as string}: ${nodes.length} 个温度节点`
    })
    .join(' / ')
}

function gasSummary(draft: ParsedExperimentDraft): string {
  const segments = asArray(draft.module_payloads.gas_program?.segments)
  if (!segments.length) return '—'
  return segments
    .map((seg) => `${seg.gas as string} ${seg.flow_sccm ?? '?'} sccm`)
    .join('、')
}

export function ImportWizardPage() {
  const { session } = useAuth()
  const accessToken = session.accessToken
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [profileKey, setProfileKey] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [drafts, setDrafts] = useState<ParsedExperimentDraft[] | null>(null)
  const [globalWarnings, setGlobalWarnings] = useState<string[]>([])
  const [includedRows, setIncludedRows] = useState<Set<number>>(new Set())
  const [created, setCreated] = useState<ImportCommitResultItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const profilesQuery = useQuery({
    queryKey: ['import-profiles'],
    queryFn: () => listImportProfiles(accessToken!),
    enabled: Boolean(accessToken),
  })
  const profiles = profilesQuery.data?.profiles ?? []
  const activeProfileKey = profileKey || profiles[0]?.key || ''

  const previewMutation = useMutation({
    mutationFn: () => previewImport(accessToken!, file!, activeProfileKey),
    onSuccess: (data) => {
      setDrafts(data.drafts)
      setGlobalWarnings(data.global_warnings)
      setIncludedRows(new Set(data.drafts.map((draft) => draft.source_row)))
      setError(null)
    },
    onError: (err) => setError(resolveErrorMessage(err, '解析失败')),
  })

  const commitMutation = useMutation({
    mutationFn: () =>
      commitImport(accessToken!, {
        profile_key: activeProfileKey,
        drafts: (drafts ?? []).filter((draft) =>
          includedRows.has(draft.source_row),
        ),
      }),
    onSuccess: (data) => {
      setCreated(data.created)
      setError(null)
    },
    onError: (err) => setError(resolveErrorMessage(err, '导入失败')),
  })

  const updateRunLevel = (sourceRow: number, key: string, value: string) => {
    setDrafts((current) =>
      (current ?? []).map((draft) =>
        draft.source_row === sourceRow
          ? { ...draft, run_level: { ...draft.run_level, [key]: value } }
          : draft,
      ),
    )
  }

  const selectFile = (nextFile: File | null) => {
    if (nextFile && nextFile.size > MAX_FILE_SIZE) {
      setError(`${nextFile.name} 超过 50MB 上限`)
      setFile(null)
      return
    }
    setError(null)
    setFile(nextFile)
  }

  const resetToUpload = () => {
    setDrafts(null)
    setCreated(null)
    setGlobalWarnings([])
    setIncludedRows(new Set())
    setFile(null)
    setError(null)
  }

  const toggleRow = (sourceRow: number) => {
    setIncludedRows((current) => {
      const next = new Set(current)
      if (next.has(sourceRow)) next.delete(sourceRow)
      else next.add(sourceRow)
      return next
    })
  }

  const includedCount = useMemo(
    () =>
      (drafts ?? []).filter((draft) => includedRows.has(draft.source_row))
        .length,
    [drafts, includedRows],
  )

  // Step 3: done -------------------------------------------------------------
  if (created) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="导入完成"
          subtitle={`已创建 ${created.length} 条草稿实验，可进入编辑器继续完善。`}
          actions={
            <Button asChild variant="outline">
              <Link to="/experiments">返回列表</Link>
            </Button>
          }
        />
        <Card className="flex flex-col gap-2 p-4">
          {created.map((item) => (
            <div
              key={item.experiment_id}
              className="flex items-center justify-between gap-2 rounded-md border p-3"
            >
              <span className="font-mono text-sm">{item.run_code}</span>
              <Button asChild size="sm">
                <Link
                  to="/experiments/$experimentId/edit"
                  params={{ experimentId: item.experiment_id }}
                >
                  打开编辑器
                </Link>
              </Button>
            </div>
          ))}
        </Card>
      </div>
    )
  }

  // Step 2: preview/confirm --------------------------------------------------
  if (drafts) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="确认导入数据"
          subtitle="核对解析结果与提示，可调整顶层字段；导入后可在编辑器中继续完善各模块。"
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetToUpload}>
                重新选择文件
              </Button>
              <Button
                disabled={includedCount === 0 || commitMutation.isPending}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                确认导入（{includedCount}）
              </Button>
            </div>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {globalWarnings.length > 0 ? (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertDescription>
              <ul className="list-disc pl-4">
                {globalWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-4">
          {drafts.map((draft) => {
            const included = includedRows.has(draft.source_row)
            return (
              <Card
                key={draft.source_row}
                className={`flex flex-col gap-4 p-4 ${included ? '' : 'opacity-60'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`include-${draft.source_row}`}
                      checked={included}
                      onCheckedChange={() => toggleRow(draft.source_row)}
                    />
                    <Label htmlFor={`include-${draft.source_row}`}>
                      第 {draft.source_row} 行
                    </Label>
                  </div>
                  {draft.warnings.length > 0 ? (
                    <Badge variant="outline" className="text-warning">
                      {draft.warnings.length} 条提示
                    </Badge>
                  ) : null}
                </div>

                <div className="editor-grid">
                  <div className="editor-field">
                    <Label>实验类型</Label>
                    <Input
                      value={runLevelString(draft, 'experiment_type')}
                      onChange={(event) =>
                        updateRunLevel(
                          draft.source_row,
                          'experiment_type',
                          event.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="editor-field">
                    <Label>材料体系</Label>
                    <Input
                      value={runLevelString(draft, 'material_system')}
                      placeholder="例如 MoS2"
                      onChange={(event) =>
                        updateRunLevel(
                          draft.source_row,
                          'material_system',
                          event.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="editor-field editor-field-wide">
                    <Label>实验目标</Label>
                    <Textarea
                      rows={1}
                      value={runLevelString(draft, 'objective')}
                      onChange={(event) =>
                        updateRunLevel(
                          draft.source_row,
                          'objective',
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="inline text-muted-foreground">前驱体：</dt>
                    <dd className="inline">{precursorSummary(draft)}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">基底：</dt>
                    <dd className="inline">{substrateSummary(draft)}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">炉温：</dt>
                    <dd className="inline">{furnaceSummary(draft)}</dd>
                  </div>
                  <div>
                    <dt className="inline text-muted-foreground">气体：</dt>
                    <dd className="inline">{gasSummary(draft)}</dd>
                  </div>
                </dl>

                {draft.warnings.length > 0 ? (
                  <ul className="list-disc rounded-md bg-warning-soft/40 p-3 pl-7 text-sm text-foreground">
                    {draft.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // Step 1: upload -----------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="导入 Excel 数据"
        subtitle="上传自动化 CVD 机台导出的工艺参数包，解析后确认即可生成草稿实验。"
        actions={
          <Button asChild variant="outline">
            <Link to="/experiments">返回列表</Link>
          </Button>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-2">
          <Label>导入格式</Label>
          {profilesQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在加载可用导入格式…
            </p>
          ) : profilesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  {resolveErrorMessage(profilesQuery.error, '加载导入格式失败')}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void profilesQuery.refetch()}
                >
                  重试
                </Button>
              </AlertDescription>
            </Alert>
          ) : profiles.length === 0 ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                当前没有可用的导入格式。请联系管理员确认后端导入配置后再试。
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={activeProfileKey}
                onChange={(event) => setProfileKey(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.key} value={profile.key}>
                    {profile.display_name}
                  </option>
                ))}
              </select>
              {profiles.find((profile) => profile.key === activeProfileKey)
                ?.description ? (
                <p className="text-sm text-muted-foreground">
                  {
                    profiles.find((profile) => profile.key === activeProfileKey)
                      ?.description
                  }
                </p>
              ) : null}
              <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <summary className="cursor-pointer font-medium text-foreground">
                  需要哪些列？
                </summary>
                <div className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
                  <p>
                    宽表，每行一条实验。表头需至少包含{' '}
                    <code className="rounded bg-muted px-1">Order</code> 或{' '}
                    <code className="rounded bg-muted px-1">A</code> 列，常用列：
                  </p>
                  <ul className="list-disc pl-5">
                    <li>
                      前驱体：<code className="rounded bg-muted px-1">A</code> /{' '}
                      <code className="rounded bg-muted px-1">B</code>（种类、质量等）
                    </li>
                    <li>
                      基底：<code className="rounded bg-muted px-1">Substrate</code>
                    </li>
                    <li>炉温台阶（升温/保温/降温的温度与时间列）</li>
                    <li>
                      四路气体：
                      <code className="rounded bg-muted px-1">Ar</code>{' '}
                      <code className="rounded bg-muted px-1">H2</code>{' '}
                      <code className="rounded bg-muted px-1">O2</code>{' '}
                      <code className="rounded bg-muted px-1">CO2</code>（流量）
                    </li>
                  </ul>
                  <p>
                    列名不匹配不会报错，只会在解析预览中以「提示」形式标出，可在确认页逐行核对修正。
                  </p>
                </div>
              </details>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>选择文件</Label>
          <div
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-6 text-sm hover:bg-accent/30"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              {file ? file.name : '点击选择 .xlsx 文件'}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              selectFile(event.target.files?.[0] ?? null)
              event.target.value = ''
            }}
          />
        </div>

        <div>
          <Button
            disabled={!file || !activeProfileKey || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            解析预览
          </Button>
        </div>
      </Card>
    </div>
  )
}
