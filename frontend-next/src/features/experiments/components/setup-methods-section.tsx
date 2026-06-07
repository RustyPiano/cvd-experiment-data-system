import type { ReactNode } from 'react'
import { useState } from 'react'

import { useAuth } from '@/features/auth/use-auth'
import { AuthenticatedImage } from '@/shared/ui/authenticated-image'
import type { FileAssetRead, SetupLibraryRead } from '@/shared/types/api'
import { triggerBlobDownload } from '@/shared/lib/download'
import type { SetupMethodsValues } from '../editor-types'
import { downloadExperimentFile } from '../api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

function DefinitionList({ children }: { children: ReactNode }) {
  return (
    <dl className="divide-y rounded-md border text-sm">{children}</dl>
  )
}

function DefinitionRow({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr]">
      <dt className="bg-muted/40 px-3 py-2 font-medium text-muted-foreground sm:border-r">
        {label}
      </dt>
      <dd className="px-3 py-2 text-foreground">{children}</dd>
    </div>
  )
}

function ReferenceValue({
  referenceUrl,
  unpublishedReason,
}: {
  referenceUrl: string | null | undefined
  unpublishedReason: string | null | undefined
}) {
  if (referenceUrl) {
    return (
      <a
        href={referenceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
      >
        {referenceUrl}
      </a>
    )
  }
  if (unpublishedReason) {
    return <span>未发表: {unpublishedReason}</span>
  }
  return <span>-</span>
}

export function SetupMethodsSection({
  disabled,
  files,
  onApplyLibrary,
  onChange,
  libraryOptions,
  value,
}: {
  disabled: boolean
  files: FileAssetRead[]
  onApplyLibrary: (libraryId: string) => void
  onChange: (nextValue: SetupMethodsValues) => void
  libraryOptions: SetupLibraryRead[]
  value: SetupMethodsValues
}) {
  const { session } = useAuth()
  const [prevSourceSetupLibraryId, setPrevSourceSetupLibraryId] = useState<
    string | null
  >(value.sourceSetupLibraryId)
  const [selectedLibraryId, setSelectedLibraryId] = useState<
    string | undefined
  >(value.sourceSetupLibraryId || undefined)

  if (value.sourceSetupLibraryId !== prevSourceSetupLibraryId) {
    setPrevSourceSetupLibraryId(value.sourceSetupLibraryId)
    setSelectedLibraryId(value.sourceSetupLibraryId || undefined)
  }

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [downloadingDiagram, setDownloadingDiagram] = useState(false)

  const selectedLibrary = libraryOptions.find(
    (entry) => entry.id === selectedLibraryId,
  )

  const diagramFile = value.diagramFileAssetId
    ? files.find((f) => f.id === value.diagramFileAssetId)
    : undefined

  const updateField = (patch: Partial<SetupMethodsValues>) => {
    onChange({ ...value, ...patch })
  }

  const handleSameAsSourceChange = (checked: boolean) => {
    updateField({
      isSameAsSource: checked,
      deviationNote: checked ? '' : value.deviationNote,
    })
  }

  const handleDownloadDiagram = async (file: FileAssetRead) => {
    if (!session?.accessToken) return
    setDownloadingDiagram(true)
    try {
      const payload = await downloadExperimentFile(session.accessToken, file.id)
      triggerBlobDownload(payload.blob, payload.filename || file.original_name)
    } catch (error) {
      console.error('Failed to download diagram', error)
    } finally {
      setDownloadingDiagram(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="editor-field">
        <Label asChild>
          <span>选择 Setup 库记录</span>
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            disabled={disabled || libraryOptions.length === 0}
            value={selectedLibraryId}
            onValueChange={(nextValue) => setSelectedLibraryId(nextValue)}
          >
            <SelectTrigger className="min-w-56 flex-1" aria-label="选择 Setup">
              <SelectValue placeholder="选择 Setup" />
            </SelectTrigger>
            <SelectContent>
              {libraryOptions.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {`${entry.name} (${entry.institution || '未知机构'})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={disabled || !selectedLibraryId}
            onClick={() => {
              if (selectedLibraryId) {
                onApplyLibrary(selectedLibraryId)
              }
            }}
          >
            套用 Setup
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!selectedLibraryId}
            onClick={() => setDrawerOpen(true)}
          >
            预览
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          套用后会把该 Setup 的内容与示意图<b>冻结复制</b>到本实验；之后在 Setup
          库中修改原记录不会影响这条已套用的实验。
        </p>
        <div>
          <a
            href="/setup-library"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary underline-offset-2 hover:underline"
          >
            + 新建/管理我的 Setup
          </a>
        </div>
      </div>

      {/* 只读快照预览区 */}
      {value.setupNameSnapshot ? (
        <div className="rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <span className="text-sm font-semibold text-foreground">
              {value.setupNameSnapshot}
            </span>
            {value.institutionSnapshot ? (
              <span className="text-sm text-muted-foreground">
                {value.institutionSnapshot}
              </span>
            ) : null}
          </div>
          <div className="p-4">
            <DefinitionList>
              <DefinitionRow label="实验方法/步骤">
                <span className="whitespace-pre-wrap">
                  {value.methodsTextSnapshot}
                </span>
              </DefinitionRow>
              {value.apparatusDescriptionSnapshot ? (
                <DefinitionRow label="装置说明">
                  <span className="whitespace-pre-wrap">
                    {value.apparatusDescriptionSnapshot}
                  </span>
                </DefinitionRow>
              ) : null}
              {value.samplePlacementDescriptionSnapshot ? (
                <DefinitionRow label="样品放置说明">
                  <span className="whitespace-pre-wrap">
                    {value.samplePlacementDescriptionSnapshot}
                  </span>
                </DefinitionRow>
              ) : null}
              {value.reactionFlowDescriptionSnapshot ? (
                <DefinitionRow label="反应气流说明">
                  <span className="whitespace-pre-wrap">
                    {value.reactionFlowDescriptionSnapshot}
                  </span>
                </DefinitionRow>
              ) : null}
              <DefinitionRow label="文献/参考">
                <ReferenceValue
                  referenceUrl={value.referencePaperUrlSnapshot}
                  unpublishedReason={value.unpublishedReasonSnapshot}
                />
              </DefinitionRow>
              {diagramFile ? (
                <DefinitionRow label="示意图">
                  <div className="flex flex-col gap-2">
                    <AuthenticatedImage
                      url={diagramFile.download_url}
                      token={session?.accessToken || ''}
                      alt={diagramFile.original_name}
                      className="max-h-72 max-w-full rounded border border-border object-contain"
                    />
                    <div>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto px-0"
                        disabled={downloadingDiagram}
                        onClick={() => void handleDownloadDiagram(diagramFile)}
                      >
                        {downloadingDiagram
                          ? '下载中…'
                          : `下载示意图 (${diagramFile.original_name})`}
                      </Button>
                    </div>
                  </div>
                </DefinitionRow>
              ) : null}
            </DefinitionList>
          </div>
        </div>
      ) : null}

      {/* 偏差说明录入 */}
      {value.sourceSetupLibraryId ? (
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={value.isSameAsSource}
              disabled={disabled}
              onCheckedChange={(checked) =>
                handleSameAsSourceChange(checked === true)
              }
            />
            与该 Setup 一致
          </label>

          {!value.isSameAsSource ? (
            <div className="editor-field">
              <Label htmlFor="setup-deviation-note">
                本次偏差说明 (Deviation Note)
              </Label>
              <Textarea
                id="setup-deviation-note"
                aria-label="偏差说明"
                disabled={disabled}
                rows={2}
                placeholder="请输入本次实验与所选 Setup 的偏差说明"
                value={value.deviationNote}
                onChange={(event) =>
                  updateField({ deviationNote: event.target.value })
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 预览 Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{`Setup 预览: ${selectedLibrary?.name || ''}`}</SheetTitle>
            <SheetDescription className="sr-only">
              选中 Setup 库记录的只读详情预览
            </SheetDescription>
          </SheetHeader>
          {selectedLibrary ? (
            <div className="overflow-y-auto px-4 pb-6">
              <DefinitionList>
                <DefinitionRow label="名称">
                  {selectedLibrary.name}
                </DefinitionRow>
                <DefinitionRow label="机构">
                  {selectedLibrary.institution || '-'}
                </DefinitionRow>
                <DefinitionRow label="实验方法/步骤">
                  <span className="whitespace-pre-wrap">
                    {selectedLibrary.methods_text}
                  </span>
                </DefinitionRow>
                <DefinitionRow label="设备描述">
                  <span className="whitespace-pre-wrap">
                    {selectedLibrary.apparatus_description || '-'}
                  </span>
                </DefinitionRow>
                <DefinitionRow label="样品放置描述">
                  <span className="whitespace-pre-wrap">
                    {selectedLibrary.sample_placement_description || '-'}
                  </span>
                </DefinitionRow>
                <DefinitionRow label="反应气流描述">
                  <span className="whitespace-pre-wrap">
                    {selectedLibrary.reaction_flow_description || '-'}
                  </span>
                </DefinitionRow>
                <DefinitionRow label="文献/参考">
                  <ReferenceValue
                    referenceUrl={selectedLibrary.reference_paper_url}
                    unpublishedReason={selectedLibrary.unpublished_reason}
                  />
                </DefinitionRow>
                <DefinitionRow label="示意图">
                  {selectedLibrary.has_diagram &&
                  selectedLibrary.diagram_download_url ? (
                    <AuthenticatedImage
                      url={selectedLibrary.diagram_download_url}
                      token={session?.accessToken || ''}
                      alt={selectedLibrary.name}
                      className="mt-2 max-w-full rounded border border-border object-contain"
                    />
                  ) : (
                    '-'
                  )}
                </DefinitionRow>
              </DefinitionList>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
