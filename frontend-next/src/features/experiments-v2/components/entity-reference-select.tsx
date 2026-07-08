// 一等实体引用选择器（装置 setups / 物料批次 material_lots）。复用 entity-library 的
// 列表 API 与配置（单一源）。选中回传实体对象，供上层展示只读投影与取版本号。
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/use-auth'
import { entityConfigs, entityRoutes } from '@/features/entity-library/config'
import type { EntityKind } from '@/features/entity-library/config'
import { listEntities } from '@/features/entity-library/api'
import type { V2EntityRead } from '@/features/entity-library/api'
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
}: {
  kind: EntityKind
  value: string
  onChange: (entityId: string, entity: V2EntityRead | null) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const { data, isLoading } = useQuery({
    queryKey: ['v2-entity', kind, token],
    queryFn: () => listEntities(kind, token),
    enabled: session.isAuthenticated && !!token,
  })
  const entities = data?.items ?? []

  if (!isLoading && entities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('experimentsV2.reference.empty')}{' '}
        <Link
          to={entityRoutes[kind].list}
          className="text-primary underline underline-offset-2"
        >
          {t('experimentsV2.reference.goToLibrary')}
        </Link>
      </p>
    )
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(id) =>
        onChange(id, entities.find((entity) => entity.id === id) ?? null)
      }
      disabled={disabled || isLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t('experimentsV2.reference.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {entities.map((entity) => (
          <SelectItem key={entity.id} value={entity.id}>
            {entityLabel(entity, kind)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
