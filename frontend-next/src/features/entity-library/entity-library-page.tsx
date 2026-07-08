// 一等实体库列表页（三种实体共用，按 kind 参数化）。
// 列表展示实体与当前版本号；支持新建（表单由 field-metadata 驱动，required 带红星）。
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EntityKind } from './config'
import { entityConfigs, entityRoutes } from './config'
import { createEntity, listEntities } from './api'
import type { V2EntityRead } from './api'
import { EntityForm } from './entity-form'

function displayValue(entity: V2EntityRead, key: string): string {
  const raw = entity.latest_version?.data?.[key]
  return raw == null || raw === '' ? '' : String(raw)
}

export function EntityLibraryPage({ kind }: { kind: EntityKind }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const config = entityConfigs[kind]
  const entityName = t(`entityLibrary.${config.i18nKey}.name`)

  const [createOpen, setCreateOpen] = useState(false)

  const queryKey = ['v2-entity', kind]
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [...queryKey, token],
    queryFn: () => listEntities(kind, token),
    enabled: session.isAuthenticated && !!token,
  })

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      createEntity(kind, payload, token),
    onSuccess: async () => {
      toast.success(t('entityLibrary.form.createSuccess'))
      setCreateOpen(false)
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (mutationError) => {
      toast.error(
        resolveErrorMessage(mutationError, t('entityLibrary.form.submitError')),
      )
    },
  })

  const entities = data?.items ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={entityName}
        subtitle={t(`entityLibrary.${config.i18nKey}.subtitle`)}
        actions={
          <Button
            aria-label={`${t('entityLibrary.actions.create')}${entityName}`}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            {t('entityLibrary.actions.create')}
          </Button>
        }
      />

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(error, t('entityLibrary.list.loadError'))}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : entities.length === 0 ? (
            <EmptyState description={t('entityLibrary.list.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('entityLibrary.columns.name')}</TableHead>
                    <TableHead>{t('entityLibrary.columns.code')}</TableHead>
                    <TableHead>{t('entityLibrary.columns.version')}</TableHead>
                    <TableHead>
                      {t('entityLibrary.columns.updatedAt')}
                    </TableHead>
                    <TableHead>{t('entityLibrary.columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entities.map((entity) => {
                    const name = displayValue(entity, config.primaryKey)
                    const code = displayValue(entity, config.codeKey)
                    const version = entity.latest_version?.version
                    return (
                      <TableRow key={entity.id}>
                        <TableCell className="font-medium">
                          {name || entity.id.slice(0, 8)}
                        </TableCell>
                        <TableCell>{code || '-'}</TableCell>
                        <TableCell>
                          {version != null ? (
                            <Badge className="bg-primary-soft text-primary">
                              {t('entityLibrary.detail.versionLabel', {
                                version,
                              })}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {dayjs(entity.updated_at).format('YYYY-MM-DD HH:mm')}
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" asChild>
                            <Link
                              to={entityRoutes[kind].detail}
                              params={{ entityId: entity.id }}
                            >
                              {t('entityLibrary.actions.viewDetail')}
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  )
}
