import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { resolveErrorMessage } from '@/shared/api/http-error'
import type { ExperimentRead } from '@/shared/types/api'
import type { SessionUser } from '@/features/auth/auth-store'
import {
  cloneExperiment,
  invalidateExperiment,
  lockExperiment,
  returnExperimentToDraft,
  saveExperimentAsRecipe,
} from './api'

type ActionKind =
  | 'return-to-draft'
  | 'lock'
  | 'invalidate'
  | 'clone'
  | 'save-recipe'
  | null

function updateExperimentCache(
  queryClient: ReturnType<typeof useQueryClient>,
  currentUserId: string,
  experiment: ExperimentRead,
) {
  queryClient.setQueryData(
    ['experiments', 'detail', currentUserId, experiment.id],
    experiment,
  )
  queryClient.setQueryData(
    ['experiments', 'editor', currentUserId, experiment.id],
    experiment,
  )
}

export function ExperimentStateActions({
  accessToken,
  currentUser,
  experiment,
  onUpdated,
}: {
  accessToken: string
  currentUser: SessionUser
  experiment: ExperimentRead
  onUpdated: (nextExperiment: ExperimentRead) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeAction, setActiveAction] = useState<ActionKind>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [invalidateReason, setInvalidateReason] = useState('')
  const [invalidateValidation, setInvalidateValidation] = useState<
    string | null
  >(null)
  const [invalidateOpen, setInvalidateOpen] = useState(false)
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [recipeName, setRecipeName] = useState('')
  const [recipeDescription, setRecipeDescription] = useState('')
  const [recipeError, setRecipeError] = useState<string | null>(null)
  const [recipeValidation, setRecipeValidation] = useState<string | null>(null)
  const [lockOpen, setLockOpen] = useState(false)

  // ─── Action availability rules (mirrors OLD experiment-state-actions.tsx) ───
  const canMutate = currentUser.role !== 'viewer'
  const isOwnerOrAdmin =
    canMutate &&
    (currentUser.role === 'admin' || currentUser.id === experiment.owner_id)
  const isOwner = currentUser.id === experiment.owner_id
  const isBusy = activeAction !== null

  const canReturnToDraft = isOwnerOrAdmin && experiment.status === 'submitted'
  const canLock = isOwnerOrAdmin && experiment.status === 'submitted'
  const canInvalidate =
    isOwnerOrAdmin &&
    experiment.status !== 'invalid' &&
    experiment.status !== 'locked'
  const canClone =
    currentUser.role !== 'viewer' &&
    (experiment.status === 'locked' ||
      (experiment.status === 'submitted' && isOwner))
  const canSaveAsRecipe =
    currentUser.role !== 'viewer' &&
    (experiment.status === 'submitted' || experiment.status === 'locked')

  if (
    !canReturnToDraft &&
    !canLock &&
    !canInvalidate &&
    !canClone &&
    !canSaveAsRecipe
  ) {
    return null
  }

  const syncExperiment = async (nextExperiment: ExperimentRead) => {
    updateExperimentCache(queryClient, currentUser.id, nextExperiment)
    await queryClient.invalidateQueries({
      queryKey: ['experiments', 'list', currentUser.id],
    })
    onUpdated(nextExperiment)
  }

  const runTransition = async (
    nextAction: Exclude<ActionKind, null>,
    task: () => Promise<ExperimentRead>,
    fallbackMessage: string,
  ) => {
    setActiveAction(nextAction)
    setActionError(null)
    try {
      const nextExperiment = await task()
      await syncExperiment(nextExperiment)
    } catch (error) {
      setActionError(resolveErrorMessage(error, fallbackMessage))
    } finally {
      setActiveAction(null)
    }
  }

  const closeRecipeModal = () => {
    setRecipeOpen(false)
    setRecipeName('')
    setRecipeDescription('')
    setRecipeError(null)
    setRecipeValidation(null)
  }

  const submitRecipe = async () => {
    const normalizedName = recipeName.trim()
    const normalizedDescription = recipeDescription.trim()
    if (!normalizedName) {
      setRecipeValidation('请填写 Recipe 名称')
      return
    }
    setActiveAction('save-recipe')
    setRecipeError(null)
    setRecipeValidation(null)
    try {
      await saveExperimentAsRecipe(accessToken, experiment.id, {
        name: normalizedName,
        ...(normalizedDescription
          ? { description: normalizedDescription }
          : {}),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recipes'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'recipes'] }),
        queryClient.invalidateQueries({
          queryKey: ['experiments', 'audit', currentUser.id, experiment.id],
        }),
      ])
      toast.success('Recipe 已保存')
      closeRecipeModal()
    } catch (error) {
      setRecipeError(resolveErrorMessage(error, '保存 Recipe 失败'))
    } finally {
      setActiveAction(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canReturnToDraft ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              void runTransition(
                'return-to-draft',
                () => returnExperimentToDraft(accessToken, experiment.id),
                '退回草稿失败',
              )
            }}
          >
            {activeAction === 'return-to-draft' ? '退回中…' : '退回草稿'}
          </Button>
        ) : null}

        {canLock ? (
          <Button size="sm" disabled={isBusy} onClick={() => setLockOpen(true)}>
            锁定实验
          </Button>
        ) : null}

        {canClone ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              void (async () => {
                setActiveAction('clone')
                setActionError(null)
                try {
                  const clonedExperiment = await cloneExperiment(
                    accessToken,
                    experiment.id,
                  )
                  updateExperimentCache(
                    queryClient,
                    currentUser.id,
                    clonedExperiment,
                  )
                  await queryClient.invalidateQueries({
                    queryKey: ['experiments', 'list', currentUser.id],
                  })
                  await navigate({
                    to: '/experiments/$experimentId/edit',
                    params: { experimentId: clonedExperiment.id },
                  })
                } catch (error) {
                  setActionError(resolveErrorMessage(error, '派生草稿失败'))
                } finally {
                  setActiveAction(null)
                }
              })()
            }}
          >
            {activeAction === 'clone' ? '派生中…' : '派生草稿'}
          </Button>
        ) : null}

        {canSaveAsRecipe ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              setActionError(null)
              setRecipeError(null)
              setRecipeValidation(null)
              setRecipeOpen(true)
            }}
          >
            保存为 Recipe
          </Button>
        ) : null}

        {canInvalidate ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={isBusy}
            onClick={() => {
              setActionError(null)
              setInvalidateValidation(null)
              setInvalidateOpen(true)
            }}
          >
            作废实验
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Lock confirm */}
      <AlertDialog
        open={lockOpen}
        onOpenChange={(open) => {
          if (!isBusy) setLockOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>锁定实验 {experiment.run_code}</AlertDialogTitle>
            <AlertDialogDescription>
              锁定后不可修改，只能派生新实验。此操作会写入审计日志。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={activeAction === 'lock'}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={activeAction === 'lock'}
              onClick={() => {
                void runTransition(
                  'lock',
                  () => lockExperiment(accessToken, experiment.id),
                  '锁定实验失败',
                ).then(() => setLockOpen(false))
              }}
            >
              {activeAction === 'lock' ? '锁定中…' : '确认锁定'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invalidate dialog */}
      <Dialog
        open={invalidateOpen}
        onOpenChange={(open) => {
          if (!open && activeAction !== 'invalidate') {
            setInvalidateOpen(false)
            setInvalidateReason('')
            setInvalidateValidation(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作废实验</DialogTitle>
            <DialogDescription>请说明作废原因（必填）。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invalidate-reason-detail">作废原因</Label>
              <Textarea
                id="invalidate-reason-detail"
                autoComplete="off"
                placeholder="说明污染、设备异常或其他作废原因"
                rows={3}
                value={invalidateReason}
                disabled={activeAction === 'invalidate'}
                onChange={(e) => {
                  setInvalidateReason(e.target.value)
                  if (invalidateValidation) setInvalidateValidation(null)
                }}
              />
              {invalidateValidation ? (
                <p className="text-sm text-destructive">
                  {invalidateValidation}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={activeAction === 'invalidate'}
              onClick={() => {
                setInvalidateOpen(false)
                setInvalidateReason('')
                setInvalidateValidation(null)
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={activeAction === 'invalidate'}
              onClick={() => {
                const normalized = invalidateReason.trim()
                if (!normalized) {
                  setInvalidateValidation('请填写作废原因')
                  return
                }
                void runTransition(
                  'invalidate',
                  async () => {
                    const nextExperiment = await invalidateExperiment(
                      accessToken,
                      experiment.id,
                      {
                        reason: normalized,
                      },
                    )
                    setInvalidateOpen(false)
                    setInvalidateReason('')
                    setInvalidateValidation(null)
                    return nextExperiment
                  },
                  '作废实验失败',
                )
              }}
            >
              {activeAction === 'invalidate' ? '作废中…' : '确认作废'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Recipe dialog */}
      <Dialog
        open={recipeOpen}
        onOpenChange={(open) => {
          if (!open && activeAction !== 'save-recipe') {
            closeRecipeModal()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存为 Recipe</DialogTitle>
            <DialogDescription>
              将本实验参数保存为可复用的 Recipe 模板。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-name">Recipe 名称</Label>
              <Input
                id="recipe-name"
                autoComplete="off"
                placeholder="例如 MoS2 标准生长流程"
                value={recipeName}
                disabled={activeAction === 'save-recipe'}
                onChange={(e) => {
                  setRecipeName(e.target.value)
                  if (recipeValidation) setRecipeValidation(null)
                }}
              />
              {recipeValidation ? (
                <p className="text-sm text-destructive">{recipeValidation}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-description">描述（可选）</Label>
              <Textarea
                id="recipe-description"
                autoComplete="off"
                placeholder="可选：说明适用材料、窗口参数或注意事项"
                rows={3}
                value={recipeDescription}
                disabled={activeAction === 'save-recipe'}
                onChange={(e) => setRecipeDescription(e.target.value)}
              />
            </div>
            {recipeError ? (
              <Alert variant="destructive">
                <AlertDescription>{recipeError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={activeAction === 'save-recipe'}
              onClick={closeRecipeModal}
            >
              取消
            </Button>
            <Button
              disabled={activeAction === 'save-recipe'}
              onClick={() => void submitRecipe()}
            >
              {activeAction === 'save-recipe' ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
