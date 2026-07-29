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
import type {
  EntityVersionPayload,
  V2EntityRead,
} from '@/features/entity-library/api'
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { snapshotValue } from './reference-snapshot'

function entityLabel(
  entityId: string,
  kind: EntityKind,
  data: Record<string, unknown>,
  version: number | null | undefined,
  productLabel = false,
): string {
  const config = entityConfigs[kind]
  const name =
    snapshotValue(data, config.primaryKey) ??
    snapshotValue(data, `${config.primaryKey}_snapshot`)
  const code =
    snapshotValue(data, config.codeKey) ??
    snapshotValue(data, `${config.codeKey}_snapshot`)
  const nameText =
    name == null || name === '' ? entityId.slice(0, 8) : String(name)
  const codeText = code == null || code === '' ? '' : ` · ${String(code)}`
  if (productLabel) {
    const maker = snapshotValue(data, 'manufacturer_brand')
    const vendor = snapshotValue(data, 'vendor')
    const model = snapshotValue(data, 'model')
    const supplier = snapshotValue(data, 'supplier')
    return [
      nameText,
      [maker || vendor, model].filter(Boolean).join(' '),
      supplier,
      code,
    ]
      .filter(Boolean)
      .map(String)
      .join(' · ')
  }
  return `${nameText}${codeText}${version != null ? ` · v${version}` : ''}`
}

export function EntityReferenceSelect({
  kind,
  value,
  onChange,
  disabled,
  triggerId,
  filter,
  selectedVersion,
  selectedSnapshot,
  allowedLotCategories,
  productLabel = false,
}: {
  kind: EntityKind
  value: string
  onChange: (entityId: string, entity: V2EntityRead | null) => void
  disabled?: boolean
  triggerId?: string
  filter?: (entity: V2EntityRead) => boolean
  selectedVersion?: number | null
  selectedSnapshot?: Record<string, unknown> | null
  allowedLotCategories?: readonly string[]
  productLabel?: boolean
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const viewerKey = session.currentUser?.id ?? 'anonymous'
  const canMaintain = session.currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [createDirty, setCreateDirty] = useState(false)
  const config = entityConfigs[kind]
  const entityName = t(`entityLibrary.${config.i18nKey}.name`)
  const queryKey = ['v2-entity', kind]
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKey, viewerKey],
    queryFn: () => listEntities(kind, token),
    enabled: session.isAuthenticated && !!token,
  })
  const allEntities = data?.items ?? []
  const filteredEntities = allEntities.filter((entity) => {
    if (filter && !filter(entity)) return false
    if (kind !== 'material_lot' || !allowedLotCategories?.length) return true
    return allowedLotCategories.includes(
      String(snapshotValue(entity.latest_version?.data ?? {}, 'lot_category')),
    )
  })
  const selectedEntity = allEntities.find((entity) => entity.id === value)
  const latestVersion = selectedEntity?.latest_version?.version
  const newerVersionAvailable =
    latestVersion != null &&
    selectedVersion != null &&
    latestVersion > selectedVersion &&
    !productLabel &&
    (!filter || (selectedEntity != null && filter(selectedEntity)))
  const entities =
    selectedEntity &&
    selectedSnapshot &&
    !filteredEntities.some((entity) => entity.id === selectedEntity.id)
      ? [selectedEntity, ...filteredEntities]
      : filteredEntities
  const createMutation = useMutation({
    mutationFn: (payload: EntityVersionPayload) =>
      createEntity(kind, payload, token),
    onSuccess: async (entity) => {
      setCreateDirty(false)
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
  const requestCreateOpen = (open: boolean) => {
    if (createMutation.isPending) return
    if (
      !open &&
      createDirty &&
      !window.confirm(t('entityLibrary.form.discardChanges'))
    ) {
      return
    }
    setCreateDirty(false)
    setCreateOpen(open)
  }

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
              placeholder={t(
                kind === 'setup'
                  ? 'experimentsV2.reference.setupPlaceholder'
                  : 'experimentsV2.reference.placeholder',
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {value &&
              selectedSnapshot &&
              !entities.some((entity) => entity.id === value) ? (
                <SelectItem value={value}>
                  {entityLabel(
                    value,
                    kind,
                    selectedSnapshot,
                    selectedVersion,
                    productLabel,
                  )}
                </SelectItem>
              ) : null}
              {entities.map((entity) => (
                <SelectItem key={entity.id} value={entity.id}>
                  {entityLabel(
                    entity.id,
                    kind,
                    entity.id === value && selectedSnapshot
                      ? selectedSnapshot
                      : (entity.latest_version?.data ?? {}),
                    entity.id === value && selectedSnapshot
                      ? selectedVersion
                      : entity.latest_version?.version,
                    productLabel,
                  )}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {canMaintain ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('experimentsV2.reference.create', {
              name: entityName,
            })}
            disabled={disabled}
            onClick={() => requestCreateOpen(true)}
          >
            <Plus />
          </Button>
        ) : null}
      </div>
      {newerVersionAvailable && selectedEntity ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          disabled={disabled}
          onClick={() => onChange(selectedEntity.id, selectedEntity)}
        >
          {t('experimentsV2.reference.useLatest', {
            version: latestVersion,
          })}
        </Button>
      ) : null}
      {isError ? (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <span>{t('experimentsV2.reference.loadError')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
          >
            {t('experimentsV2.reference.retry')}
          </Button>
        </div>
      ) : !isLoading && entities.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(
            kind === 'setup'
              ? canMaintain
                ? 'experimentsV2.reference.emptySetupAdmin'
                : 'experimentsV2.reference.emptySetupMember'
              : 'experimentsV2.reference.empty',
          )}
        </p>
      ) : null}
      <Dialog open={canMaintain && createOpen} onOpenChange={requestCreateOpen}>
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
                token={token}
                allowedLotCategories={allowedLotCategories}
                submitting={createMutation.isPending}
                onSubmit={(payload) => createMutation.mutate(payload)}
                onCancel={() => requestCreateOpen(false)}
                onDirtyChange={setCreateDirty}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
