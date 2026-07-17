// 一等实体引用选择器（装置 setups / 物料批次 material_lots）。复用 entity-library 的
// 列表 API 与配置（单一源）。选中回传实体对象，供上层展示只读投影与取版本号。
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/use-auth'
import { entityConfigs } from '@/features/entity-library/config'
import type { EntityKind } from '@/features/entity-library/config'
import { createEntity, listEntities } from '@/features/entity-library/api'
import type { V2EntityRead } from '@/features/entity-library/api'
import { EntityForm } from '@/features/entity-library/entity-form'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function entityLabel(entity: V2EntityRead, kind: EntityKind): string {
  const config = entityConfigs[kind]
  const data = entity.latest_version?.data ?? {}
  const name = data[config.primaryKey]
  const code = data[config.codeKey]
  const version = entity.latest_version?.version
  const nameText =
    name == null || name === '' ? entity.id.slice(0, 8) : String(name)
  const codeText = code == null || code === '' ? '' : ` · ${String(code)}`
  return `${nameText}${codeText}${version != null ? ` · v${version}` : ''}`
}

export function EntityReferenceSelect({
  kind,
  value,
  onChange,
  disabled,
  triggerId,
}: {
  kind: EntityKind
  value: string
  onChange: (entityId: string, entity: V2EntityRead | null) => void
  disabled?: boolean
  triggerId?: string
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const viewerKey = session.currentUser?.id ?? 'anonymous'
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const config = entityConfigs[kind]
  const entityName = t(`entityLibrary.${config.i18nKey}.name`)
  const queryKey = ['v2-entity', kind]
  const { data, isLoading } = useQuery({
    queryKey: [...queryKey, viewerKey],
    queryFn: () => listEntities(kind, token),
    enabled: session.isAuthenticated && !!token,
  })
  const entities = data?.items ?? []
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      createEntity(kind, payload, token),
    onSuccess: async (entity) => {
      setCreateOpen(false)
      onChange(entity.id, entity)
      toast.success(t('entityLibrary.form.createSuccess'))
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('entityLibrary.form.submitError')),
      ),
  })

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={value || ''}
          onValueChange={(id) =>
            onChange(id, entities.find((entity) => entity.id === id) ?? null)
          }
          disabled={disabled || isLoading}
        >
          <SelectTrigger id={triggerId} className="min-w-0 flex-1">
            <SelectValue
              placeholder={t('experimentsV2.reference.placeholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {entities.map((entity) => (
              <SelectItem key={entity.id} value={entity.id}>
                {entityLabel(entity, kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('experimentsV2.reference.create', {
            name: entityName,
          })}
          disabled={disabled}
          onClick={() => setCreateOpen(true)}
        >
          <Plus />
        </Button>
      </div>
      {!isLoading && entities.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('experimentsV2.reference.empty')}
        </p>
      ) : null}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!createMutation.isPending) setCreateOpen(open)
        }}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('entityLibrary.form.createTitle', { name: entityName })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('entityLibrary.form.createTitle', { name: entityName })}
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 py-2">
            {createOpen ? (
              <EntityForm
                kind={kind}
                mode="create"
                nextVersion={1}
                submitting={createMutation.isPending}
                onSubmit={(payload) => createMutation.mutate(payload)}
                onCancel={() => setCreateOpen(false)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
