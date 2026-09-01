// 一等实体详情页：当前版本全字段只读展示 + 版本历史（版本号/时间）+「改动即新版本」编辑。
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, History, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EntityKind } from './config'
import { entityConfigs, entityRoutes } from './config'
import { appendEntityVersion, getEntity, listEntityVersions } from './api'
import type { EntityFileAssetRead, EntityVersionPayload } from './api'
import {
  buildDefaultValues,
  getEntityFields,
  isFieldVisible,
} from './field-logic'
import { EntityForm } from './entity-form'
import {
  localizedFieldLabel,
  localizedNamedValue,
  localizedSetupFieldLabel,
  localizedUnitLabel,
  localizedValue,
} from '@/shared/field-i18n'
import { cleanupPendingEntityFiles } from './entity-file-cleanup'
import { isEntityFileInput } from '@/shared/entity-file-reference'
import { EntityFileDisplay } from './entity-file-control'
import { isStructuredInput } from '@/shared/structured-field'
import { buildStructuredValueLabels } from '@/shared/structured-editor-labels'
import { gasCompositionSummary } from './gas-composition-editor'
import type { GasCompositionComponent } from './gas-composition-editor'
import { gasSpecies } from '@/shared/generated/field-metadata'
import { gasCylinderMatchesSpecies } from '@/features/experiments-v2/components/reference-snapshot'

export function EntityDetailPage({
  kind,
  entityId,
}: {
  kind: EntityKind
  entityId: string
}) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const viewerKey = session.currentUser?.id ?? 'anonymous'
  const canMaintain = session.currentUser?.role === 'admin'
  const config = entityConfigs[kind]
  const entityName = t(`entityLibrary.${config.i18nKey}.name`)
  const fields = getEntityFields(kind)

  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [editPendingFiles, setEditPendingFiles] = useState<
    EntityFileAssetRead[]
  >([])
  const [discardingEdit, setDiscardingEdit] = useState(false)
  const [editUploading, setEditUploading] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)

  const entityKey = ['v2-entity', kind, entityId]

  const entityQuery = useQuery({
    queryKey: [...entityKey, viewerKey],
    queryFn: () => getEntity(kind, entityId, token),
    enabled: session.isAuthenticated && !!token,
  })

  const versionsQuery = useQuery({
    queryKey: [...entityKey, 'versions', viewerKey],
    queryFn: () => listEntityVersions(kind, entityId, token),
    enabled: session.isAuthenticated && !!token,
  })

  const entity = entityQuery.data
  const latest = entity?.latest_version ?? null
  const latestVersion = latest?.version ?? 0

  const versions = [...(versionsQuery.data?.items ?? [])].sort(
    (a, b) => b.version - a.version,
  )

  // 默认展示当前（最新）版本；用户可在版本历史里切换查看历史快照（只读）。
  const activeVersion =
    selectedVersion == null
      ? latest
      : (versions.find((v) => v.version === selectedVersion) ?? latest)
  const isHistorical =
    activeVersion != null && activeVersion.version !== latestVersion

  const appendMutation = useMutation({
    mutationFn: (payload: EntityVersionPayload) =>
      appendEntityVersion(kind, entityId, payload, token),
    onSuccess: async (created) => {
      toast.success(
        t('entityLibrary.form.newVersionSuccess', { version: created.version }),
      )
      setEditDirty(false)
      setEditPendingFiles([])
      setEditUploading(false)
      setEditOpen(false)
      setSelectedVersion(null)
      // Prefix match: ['v2-entity', kind] also invalidates ['v2-entity', kind, entityId].
      await queryClient.invalidateQueries({ queryKey: ['v2-entity', kind] })
    },
    onError: (mutationError) => {
      toast.error(
        resolveErrorMessage(mutationError, t('entityLibrary.form.submitError')),
      )
    },
  })
  const requestEditOpen = async (open: boolean) => {
    if (appendMutation.isPending || discardingEdit || editUploading) return
    if (
      !open &&
      editDirty &&
      !window.confirm(t('entityLibrary.form.discardChanges'))
    ) {
      return
    }
    if (!open && editPendingFiles.length > 0) {
      setDiscardingEdit(true)
      const failed = await cleanupPendingEntityFiles(token, editPendingFiles)
      setDiscardingEdit(false)
      setEditPendingFiles(failed)
      if (failed.length > 0) {
        toast.error(t('entityLibrary.form.discardFileCleanupError'))
        return
      }
    }
    setEditDirty(false)
    setEditPendingFiles([])
    setEditUploading(false)
    setEditOpen(open)
  }

  if (entityQuery.isLoading) {
    return <LoadingState />
  }

  if (entityQuery.isError || !entity) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {entityQuery.isError
            ? resolveErrorMessage(
                entityQuery.error,
                t('entityLibrary.detail.loadError'),
              )
            : t('entityLibrary.detail.notFound')}
        </AlertDescription>
      </Alert>
    )
  }

  const activeData = activeVersion?.data ?? {}
  const displayName =
    localizedValue(activeData[config.primaryKey], i18n.language) ||
    entity.id.slice(0, 8)
  const structuredLabels = buildStructuredValueLabels(t)
  const visibilityValues = buildDefaultValues(kind, activeData)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${entityName} · ${displayName}`}
        subtitle={t(`entityLibrary.${config.i18nKey}.subtitle`)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to={entityRoutes[kind].list}>
                <ArrowLeft className="size-4" />
                {t('entityLibrary.actions.backToList')}
              </Link>
            </Button>
            {canMaintain ? (
              <Button onClick={() => void requestEditOpen(true)}>
                <Pencil className="size-4" />
                {t('entityLibrary.actions.editAsNewVersion')}
              </Button>
            ) : null}
          </div>
        }
      />

      {isHistorical ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {t('entityLibrary.detail.viewingHistorical', {
                version: activeVersion?.version,
              })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedVersion(null)}
            >
              {t('entityLibrary.detail.backToCurrent')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              {t(
                isHistorical
                  ? 'entityLibrary.detail.viewingVersion'
                  : 'entityLibrary.detail.currentVersion',
              )}
            </CardTitle>
            {activeVersion ? (
              <Badge className="bg-primary-soft text-primary">
                {t('entityLibrary.detail.versionLabel', {
                  version: activeVersion.version,
                })}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y border-t text-sm">
              {fields
                .filter((field) =>
                  isFieldVisible(kind, field, visibilityValues),
                )
                .map((field) => {
                  const raw = activeData[field.key]
                  const legacyGasSpecies =
                    field.key === 'gas_components' && !Array.isArray(raw)
                      ? Object.keys(gasSpecies).find((species) =>
                          gasCylinderMatchesSpecies(activeData, species),
                        )
                      : undefined
                  const value =
                    field.key === 'gas_components' && Array.isArray(raw)
                      ? gasCompositionSummary(raw as GasCompositionComponent[])
                      : legacyGasSpecies
                        ? `${gasCompositionSummary([{ species: legacyGasSpecies, volume_percent: 100 }])} ${t('entityLibrary.gasComposition.legacyDerived')}`
                        : isStructuredInput(field.input)
                          ? localizedNamedValue(
                              raw,
                              i18n.language,
                              structuredLabels,
                            )
                          : localizedValue(raw, i18n.language)
                  const label =
                    kind === 'setup'
                      ? localizedSetupFieldLabel(
                          field,
                          i18n.language,
                          activeData['setup_origin'],
                          {
                            manufacturerBrand: t(
                              'entityLibrary.form.originalManufacturerBrand',
                            ),
                            model: t(
                              'entityLibrary.form.originalEquipmentModel',
                            ),
                          },
                        )
                      : localizedFieldLabel(field, i18n.language)
                  const unit = localizedUnitLabel(field.unit, i18n.language)
                  return (
                    <div
                      key={field.key}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4"
                    >
                      <dt className="shrink-0 text-muted-foreground sm:w-48">
                        {label}
                        {unit ? (
                          <span className="ml-1 text-xs">{unit}</span>
                        ) : null}
                      </dt>
                      <dd className="min-w-0 flex-1 whitespace-pre-wrap text-foreground">
                        {isEntityFileInput(field.input) && raw ? (
                          <EntityFileDisplay value={raw} token={token} />
                        ) : (
                          value || t('entityLibrary.detail.emptyValue')
                        )}
                      </dd>
                    </div>
                  )
                })}
            </dl>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              {t('entityLibrary.detail.versionHistory')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {versionsQuery.isLoading ? (
              <LoadingState />
            ) : (
              <ul className="flex flex-col gap-1">
                {versions.map((version) => {
                  const active = version.version === activeVersion?.version
                  return (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedVersion(version.version)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                          active
                            ? 'bg-primary-soft text-primary'
                            : 'hover:bg-muted',
                        )}
                      >
                        <span className="font-medium">
                          {t('entityLibrary.detail.versionLabel', {
                            version: version.version,
                          })}
                          {version.version === latestVersion ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t('entityLibrary.detail.currentVersion')}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dayjs(version.created_at).format('YYYY-MM-DD HH:mm')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={canMaintain && editOpen}
        onOpenChange={(open) => void requestEditOpen(open)}
      >
        <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('entityLibrary.form.newVersionTitle', { name: entityName })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t('entityLibrary.form.newVersionBanner', {
                version: latestVersion + 1,
              })}
            </DialogDescription>
          </DialogHeader>
          {isHistorical ? (
            <Alert className="mt-4">
              <AlertDescription>
                {t('entityLibrary.form.historicalVersionPrefill')}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="-mx-6 max-h-[65vh] overflow-y-auto px-6 pt-4 pb-2">
            {editOpen ? (
              <EntityForm
                kind={kind}
                mode="newVersion"
                nextVersion={latestVersion + 1}
                defaultData={latest?.data ?? null}
                submitting={
                  appendMutation.isPending || discardingEdit || editUploading
                }
                token={token}
                onSubmit={(payload) => appendMutation.mutate(payload)}
                onCancel={() => void requestEditOpen(false)}
                onDirtyChange={setEditDirty}
                onPendingFilesChange={setEditPendingFiles}
                onUploadPendingChange={setEditUploading}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
