import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileImage, Loader2, Plus, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { AuthenticatedImage } from '@/shared/ui/authenticated-image'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import type {
  SetupLibraryCreateRequest,
  SetupLibraryRead,
} from '@/shared/types/api'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  createSetupLibraryEntry,
  deactivateSetupLibraryEntry,
  listSetupLibrary,
  updateSetupLibraryEntry,
  uploadSetupLibraryDiagram,
} from './api'

type Visibility = 'private' | 'group'
type ReferenceType = 'published' | 'unpublished'

type FormState = {
  name: string
  institution: string
  visibility: Visibility
  methods_text: string
  apparatus_description: string
  sample_placement_description: string
  reaction_flow_description: string
  referenceType: ReferenceType
  reference_paper_url: string
  unpublished_reason: string
}

const emptyForm: FormState = {
  name: '',
  institution: '',
  visibility: 'private',
  methods_text: '',
  apparatus_description: '',
  sample_placement_description: '',
  reaction_flow_description: '',
  referenceType: 'unpublished',
  reference_paper_url: '',
  unpublished_reason: '',
}

const PAGE_SIZE = 10

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function SetupLibraryPage() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const token = session.accessToken || ''
  // viewer role retired: all authenticated users may author setup entries.
  const isViewer = false

  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<SetupLibraryRead | null>(
    null,
  )
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewingEntry, setViewingEntry] = useState<SetupLibraryRead | null>(
    null,
  )

  const [entryToDeactivate, setEntryToDeactivate] =
    useState<SetupLibraryRead | null>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['setup-library', token],
    queryFn: () => listSetupLibrary(token),
    enabled: session.isAuthenticated && !!token,
  })

  const setupEntries = data?.items ?? []

  const totalPages = Math.max(1, Math.ceil(setupEntries.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedEntries = setupEntries.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  const deactivateMutation = useMutation({
    mutationFn: (entryId: string) =>
      deactivateSetupLibraryEntry(token, entryId),
    onSuccess: async () => {
      toast.success('停用成功')
      await queryClient.invalidateQueries({ queryKey: ['setup-library'] })
    },
    onError: () => {
      toast.error('停用失败')
    },
  })

  const updateField = <TKey extends keyof FormState>(
    key: TKey,
    value: FormState[TKey],
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const clearSelectedFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleOpenCreate = () => {
    setEditingEntry(null)
    setForm(emptyForm)
    setFormError(null)
    clearSelectedFile()
    setModalOpen(true)
  }

  const handleOpenEdit = (entry: SetupLibraryRead) => {
    setEditingEntry(entry)
    const isPublished = !!entry.reference_paper_url
    setForm({
      name: entry.name,
      institution: entry.institution ?? '',
      visibility: entry.visibility,
      methods_text: entry.methods_text,
      apparatus_description: entry.apparatus_description,
      sample_placement_description: entry.sample_placement_description,
      reaction_flow_description: entry.reaction_flow_description,
      referenceType: isPublished ? 'published' : 'unpublished',
      reference_paper_url: entry.reference_paper_url ?? '',
      unpublished_reason: entry.unpublished_reason ?? '',
    })
    setFormError(null)
    clearSelectedFile()
    setModalOpen(true)
  }

  const handleViewDetails = (entry: SetupLibraryRead) => {
    setViewingEntry(entry)
    setDrawerOpen(true)
  }

  const handleFormSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('请输入 Setup 名称')
      return
    }
    if (!form.methods_text.trim()) {
      setFormError('请输入实验方法/步骤')
      return
    }
    if (
      form.referenceType === 'published' &&
      form.reference_paper_url.trim() &&
      !isValidUrl(form.reference_paper_url.trim())
    ) {
      setFormError('请输入有效的 URL')
      return
    }

    setFormError(null)
    setSaving(true)

    const updatePayload: SetupLibraryCreateRequest = {
      name: form.name,
      institution: form.institution || null,
      visibility: form.visibility,
      methods_text: form.methods_text,
      apparatus_description: form.apparatus_description || '',
      sample_placement_description: form.sample_placement_description || '',
      reaction_flow_description: form.reaction_flow_description || '',
      reference_paper_url:
        form.referenceType === 'published'
          ? form.reference_paper_url || null
          : null,
      unpublished_reason:
        form.referenceType === 'unpublished'
          ? form.unpublished_reason || null
          : null,
    }

    try {
      let savedEntry: SetupLibraryRead
      if (editingEntry) {
        savedEntry = await updateSetupLibraryEntry(
          token,
          editingEntry.id,
          updatePayload,
        )
      } else {
        savedEntry = await createSetupLibraryEntry(token, updatePayload)
      }

      if (selectedFile) {
        await uploadSetupLibraryDiagram(token, savedEntry.id, selectedFile)
      }

      toast.success('保存成功')
      setModalOpen(false)
      clearSelectedFile()
      await queryClient.invalidateQueries({ queryKey: ['setup-library'] })
    } catch (submitError) {
      toast.error(resolveErrorMessage(submitError, '保存失败'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Setup 库"
        subtitle="记录和管理实验室的 CVD 装置与实验 Setup，用于在实验中快速引用。"
        actions={
          isViewer ? undefined : (
            <Button aria-label="新建 Setup 记录" onClick={handleOpenCreate}>
              <Plus className="size-4" />
              新建 Setup
            </Button>
          )
        }
      />

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(error, '加载失败')}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : setupEntries.length === 0 ? (
            <EmptyState description="暂无 Setup 库记录。快去新建一个吧！" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>机构</TableHead>
                      <TableHead>创建者</TableHead>
                      <TableHead>更新时间</TableHead>
                      <TableHead>示意图</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{entry.name}</span>
                            {entry.visibility === 'private' ? (
                              <Badge className="bg-primary-soft text-primary">
                                私有
                              </Badge>
                            ) : (
                              <Badge className="bg-accent text-accent-foreground">
                                群组
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{entry.institution || '-'}</TableCell>
                        <TableCell>{entry.owner_name || '-'}</TableCell>
                        <TableCell>
                          {dayjs(entry.updated_at).format('YYYY-MM-DD HH:mm')}
                        </TableCell>
                        <TableCell>
                          {entry.has_diagram ? (
                            <Button
                              variant="link"
                              className="h-auto px-0"
                              aria-label="查看示意图详情"
                              onClick={() => handleViewDetails(entry)}
                            >
                              <FileImage className="size-4" />有
                            </Button>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(entry)}
                            >
                              查看详情
                            </Button>
                            {entry.can_edit ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenEdit(entry)}
                                >
                                  编辑
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setEntryToDeactivate(entry)}
                                >
                                  停用
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {setupEntries.length > PAGE_SIZE ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    共 {setupEntries.length} 条 · 第 {safePage}/{totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Setup 详情：{viewingEntry?.name || ''}</SheetTitle>
            <SheetDescription className="sr-only">
              查看 Setup 库记录的详细信息
            </SheetDescription>
          </SheetHeader>
          {viewingEntry ? (
            <dl className="flex flex-col divide-y border-t px-4 pb-6 text-sm">
              <DetailRow label="名称">{viewingEntry.name}</DetailRow>
              <DetailRow label="可见性">
                {viewingEntry.visibility === 'private'
                  ? '私有 (Private)'
                  : '群组 (Group)'}
              </DetailRow>
              <DetailRow label="机构">
                {viewingEntry.institution || '-'}
              </DetailRow>
              <DetailRow label="创建者">
                {viewingEntry.owner_name || '-'}
              </DetailRow>
              <DetailRow label="更新时间">
                {dayjs(viewingEntry.updated_at).format('YYYY-MM-DD HH:mm')}
              </DetailRow>
              <DetailRow label="实验方法/步骤">
                <span className="whitespace-pre-wrap">
                  {viewingEntry.methods_text}
                </span>
              </DetailRow>
              <DetailRow label="设备描述">
                <span className="whitespace-pre-wrap">
                  {viewingEntry.apparatus_description || '-'}
                </span>
              </DetailRow>
              <DetailRow label="样品放置描述">
                <span className="whitespace-pre-wrap">
                  {viewingEntry.sample_placement_description || '-'}
                </span>
              </DetailRow>
              <DetailRow label="反应气流描述">
                <span className="whitespace-pre-wrap">
                  {viewingEntry.reaction_flow_description || '-'}
                </span>
              </DetailRow>
              <DetailRow label="文献/参考">
                {viewingEntry.reference_paper_url ? (
                  <a
                    href={viewingEntry.reference_paper_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {viewingEntry.reference_paper_url}
                  </a>
                ) : viewingEntry.unpublished_reason ? (
                  <span>未发表：{viewingEntry.unpublished_reason}</span>
                ) : (
                  '-'
                )}
              </DetailRow>
              <DetailRow label="示意图">
                {viewingEntry.has_diagram &&
                viewingEntry.diagram_download_url ? (
                  <AuthenticatedImage
                    url={viewingEntry.diagram_download_url}
                    token={token}
                    alt={viewingEntry.name}
                    className="mt-2 max-w-full rounded-md border"
                  />
                ) : (
                  '-'
                )}
              </DetailRow>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Create / Edit Form Dialog */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!saving) setModalOpen(open)
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? '编辑 Setup' : '新建 Setup'}</DialogTitle>
            <DialogDescription className="sr-only">
              填写 Setup 库记录信息
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 max-h-[60vh] overflow-y-auto px-6 py-2">
            <div className="flex flex-col gap-4">
              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="editor-field">
                <Label htmlFor="setup-name">
                  名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="setup-name"
                  autoComplete="off"
                  placeholder="请输入 Setup 名称"
                  value={form.name}
                  disabled={saving}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="setup-institution">机构</Label>
                <Input
                  id="setup-institution"
                  autoComplete="off"
                  placeholder="请输入机构名称（可选）"
                  value={form.institution}
                  disabled={saving}
                  onChange={(event) =>
                    updateField('institution', event.target.value)
                  }
                />
              </div>

              <div className="editor-field">
                <Label>可见性</Label>
                <RadioGroup
                  className="flex gap-6"
                  value={form.visibility}
                  disabled={saving}
                  onValueChange={(value) =>
                    updateField('visibility', value as Visibility)
                  }
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="private" />
                    私有 (Private)
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="group" />
                    群组 (Group)
                  </Label>
                </RadioGroup>
              </div>

              <div className="editor-field">
                <Label htmlFor="setup-methods">
                  实验方法/步骤 <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="setup-methods"
                  autoComplete="off"
                  rows={4}
                  placeholder="请输入实验方法或具体操作步骤"
                  value={form.methods_text}
                  disabled={saving}
                  onChange={(event) =>
                    updateField('methods_text', event.target.value)
                  }
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="setup-apparatus">设备描述</Label>
                <Textarea
                  id="setup-apparatus"
                  autoComplete="off"
                  rows={3}
                  placeholder="请输入设备配置或硬件环境描述（可选）"
                  value={form.apparatus_description}
                  disabled={saving}
                  onChange={(event) =>
                    updateField('apparatus_description', event.target.value)
                  }
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="setup-placement">样品放置描述</Label>
                <Textarea
                  id="setup-placement"
                  autoComplete="off"
                  rows={3}
                  placeholder="请输入基底/源在炉腔内的具体放置位置描述（可选）"
                  value={form.sample_placement_description}
                  disabled={saving}
                  onChange={(event) =>
                    updateField(
                      'sample_placement_description',
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="editor-field">
                <Label htmlFor="setup-flow">反应气流描述</Label>
                <Textarea
                  id="setup-flow"
                  autoComplete="off"
                  rows={3}
                  placeholder="请输入各阶段气流载气及配比描述（可选）"
                  value={form.reaction_flow_description}
                  disabled={saving}
                  onChange={(event) =>
                    updateField('reaction_flow_description', event.target.value)
                  }
                />
              </div>

              <div className="editor-field">
                <Label>参考文献类型</Label>
                <RadioGroup
                  className="flex gap-6"
                  value={form.referenceType}
                  disabled={saving}
                  onValueChange={(value) =>
                    updateField('referenceType', value as ReferenceType)
                  }
                >
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="published" />
                    已发表文献
                  </Label>
                  <Label className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value="unpublished" />
                    未发表/内部开发
                  </Label>
                </RadioGroup>
              </div>

              {form.referenceType === 'published' ? (
                <div className="editor-field">
                  <Label htmlFor="setup-url">文献链接 (URL)</Label>
                  <Input
                    id="setup-url"
                    autoComplete="off"
                    placeholder="https://doi.org/…"
                    value={form.reference_paper_url}
                    disabled={saving}
                    onChange={(event) =>
                      updateField('reference_paper_url', event.target.value)
                    }
                  />
                </div>
              ) : null}

              {form.referenceType === 'unpublished' ? (
                <div className="editor-field">
                  <Label htmlFor="setup-reason">未发表说明</Label>
                  <Textarea
                    id="setup-reason"
                    autoComplete="off"
                    rows={2}
                    placeholder="例如：课题组自行摸索的工艺"
                    value={form.unpublished_reason}
                    disabled={saving}
                    onChange={(event) =>
                      updateField('unpublished_reason', event.target.value)
                    }
                  />
                </div>
              ) : null}

              <div className="editor-field">
                <Label>示意图上传</Label>
                {editingEntry?.has_diagram ? (
                  <p className="text-xs text-muted-foreground">
                    <Badge className="mr-2 bg-success-soft text-success">
                      已有示意图：
                      {editingEntry.diagram_original_name || 'diagram'}
                    </Badge>
                    上传新文件将覆盖旧文件。
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    const file = event.dataTransfer.files[0]
                    if (file) setSelectedFile(file)
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors',
                    isDragging
                      ? 'border-primary bg-primary-soft'
                      : 'border-input hover:border-primary/50 hover:bg-muted/40',
                  )}
                >
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    点击或将示意图拖拽到此区域上传
                  </span>
                  <span className="text-xs text-muted-foreground">
                    支持单个图片文件，覆盖已有示意图。
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) setSelectedFile(file)
                  }}
                />
                {selectedFile ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{selectedFile.name}</span>
                    <button
                      type="button"
                      aria-label={`移除 ${selectedFile.name}`}
                      onClick={clearSelectedFile}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setModalOpen(false)}
            >
              取消
            </Button>
            <Button disabled={saving} onClick={() => void handleFormSubmit()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog
        open={entryToDeactivate !== null}
        onOpenChange={(open) => {
          if (!open) setEntryToDeactivate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>停用确认</AlertDialogTitle>
            <AlertDialogDescription>
              确定停用该 Setup 库记录 “{entryToDeactivate?.name}” 吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (entryToDeactivate) {
                  deactivateMutation.mutate(entryToDeactivate.id)
                  setEntryToDeactivate(null)
                }
              }}
            >
              停用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
      <dt className="shrink-0 text-muted-foreground sm:w-28">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{children}</dd>
    </div>
  )
}
