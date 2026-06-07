import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'

import type { ModuleEditorSectionKey } from '../editor-types'
import { buildExperimentModuleDiffs } from '../diff-utils'
import { DiffSection } from './diff-section'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ExperimentDiffModal({
  currentModules,
  errorMessage,
  loading,
  onClose,
  open,
  sourceModules,
  sourceRunCode,
}: {
  currentModules: Record<ModuleEditorSectionKey, Record<string, unknown>>
  errorMessage?: string | null
  loading?: boolean
  onClose: () => void
  open: boolean
  sourceModules: Partial<
    Record<ModuleEditorSectionKey, Record<string, unknown>>
  >
  sourceRunCode?: string | null
}) {
  const [collapseSame, setCollapseSame] = useState(true)
  const moduleDiffs = useMemo(
    () =>
      buildExperimentModuleDiffs({
        sourceModules,
        currentModules,
      }),
    [currentModules, sourceModules],
  )
  const visibleModuleDiffs = collapseSame
    ? moduleDiffs.filter((moduleDiff) => moduleDiff.status !== 'same')
    : moduleDiffs

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>实验差异</DialogTitle>
          <DialogDescription>
            对比来源实验
            {sourceRunCode ? ` ${sourceRunCode}` : ''}与当前编辑内容。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pt-2">
          <div className="flex items-center gap-2">
            <Switch
              id="diff-collapse-same"
              checked={collapseSame}
              onCheckedChange={setCollapseSame}
            />
            <Label htmlFor="diff-collapse-same" className="font-normal">
              {collapseSame ? '已折叠相同项' : '显示全部'}
            </Label>
          </div>

          {loading ? (
            <Alert className="border-primary/30 bg-primary-soft [&>svg]:text-primary">
              <Info />
              <AlertDescription className="text-foreground">
                正在加载来源模块…
              </AlertDescription>
            </Alert>
          ) : null}
          {errorMessage ? (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          {!loading && !errorMessage && visibleModuleDiffs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              没有差异
            </p>
          ) : null}
          {!loading && !errorMessage
            ? visibleModuleDiffs.map((moduleDiff) => (
                <DiffSection
                  collapseSame={collapseSame}
                  key={moduleDiff.moduleKey}
                  moduleDiff={moduleDiff}
                />
              ))
            : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
