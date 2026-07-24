// §2 设备：装置引用选择器（从 entity-library 的 setups 取列表）。选中后展示快照只读投影
// （壁型 / 温区数 / 坐标系等），标注「随引用冻结」。设备模块字段由后端从被引用 Setup 版本
// 回填（写引用即冻结快照），前端不直接 upsert equipment 模块。
import { useTranslation } from 'react-i18next'
import { entities } from '@/shared/generated/field-metadata'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getModuleFields } from '../field-logic'
import type { EquipmentRef, ModuleSaveProps } from '../form-types'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { ModuleCard } from './module-card'
import {
  localizedFieldLabel,
  localizedOption,
  localizedUnit,
} from '@/shared/field-i18n'

// 只读投影字段（取被引用 Setup 版本的注册字段），键 → setup 实体字段 labelZh。
const PROJECTION_KEYS = [
  'setup_code',
  'setup_name',
  'wall_type',
  'zone_count',
  'orientation',
  'coordinate_system',
  'tube_material_shape',
] as const

function setupLabel(key: string, language: string): string {
  const field = entities['setup']?.find((item) => item.key === key)
  return field ? localizedFieldLabel(field, language) : key
}

export function EquipmentSection({
  equipment,
  onSelectSetup,
  disabled,
  showErrors,
  save,
}: {
  equipment: EquipmentRef
  onSelectSetup: (entityId: string, entity: V2EntityRead | null) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { i18n, t } = useTranslation()
  const setupRefField = getModuleFields('equipment').find(
    (field) => field.key === 'setup_ref',
  )
  const missing = Boolean(showErrors) && equipment.setupId === ''
  const snapshot = equipment.snapshot ?? {}

  return (
    <ModuleCard
      id="module-equipment"
      index="§2"
      title={t('experimentsV2.sections.equipment.title')}
      subtitle={t('experimentsV2.sections.equipment.subtitle')}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
    >
      <div className="flex max-w-md flex-col gap-1.5">
        {setupRefField ? (
          <FieldLabel
            labelZh={localizedFieldLabel(setupRefField, i18n.language)}
            unit={localizedUnit(setupRefField.unit, i18n.language)}
            required
            r0={setupRefField.r0}
          />
        ) : null}
        <EntityReferenceSelect
          kind="setup"
          value={equipment.setupId}
          onChange={onSelectSetup}
          disabled={disabled}
        />
        {missing ? (
          <p className="text-xs text-destructive">{t('validation.required')}</p>
        ) : null}
      </div>

      {equipment.setupId ? (
        <div className="flex flex-col gap-2">
          <Alert>
            <AlertDescription>
              {t('experimentsV2.sections.equipment.frozenNote', {
                version: equipment.version ?? '',
              })}
            </AlertDescription>
          </Alert>
          <dl className="grid gap-x-6 gap-y-2 rounded-md border border-border p-4 sm:grid-cols-2">
            {PROJECTION_KEYS.map((key) => {
              const raw = snapshot[key]
              const value = raw == null || raw === '' ? '—' : String(raw)
              return (
                <div key={key} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {setupLabel(key, i18n.language)}
                  </dt>
                  <dd className="text-sm text-foreground">
                    {localizedOption(value, i18n.language)}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      ) : null}
    </ModuleCard>
  )
}
