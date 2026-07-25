// §2 设备：装置引用选择器（从 entity-library 的 setups 取列表）。选中后展示快照只读投影
// （壁型 / 温区数 / 坐标系等），标注「随引用冻结」。设备模块字段由后端从被引用 Setup 版本
// 回填（写引用即冻结快照），前端不直接 upsert equipment 模块。
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/use-auth'
import { entities } from '@/shared/generated/field-metadata'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getModuleFields } from '../field-logic'
import type { EquipmentRef, ModuleSaveProps } from '../form-types'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { ModuleCard } from './module-card'
import {
  localizedFieldHelp,
  localizedFieldLabel,
  localizedNamedValue,
  localizedValue,
  localizedUnit,
} from '@/shared/field-i18n'
import { isStructuredInput, structuredPayload } from '@/shared/structured-field'
import { buildStructuredValueLabels } from '@/shared/structured-editor-labels'
import { isEntityFileInput } from '@/shared/entity-file-reference'
import { EntityFileDisplay } from '@/features/entity-library/entity-file-control'
import { StructuredObjectControl } from '@/shared/ui/structured-object-control'

const PROJECTION_FIELDS = (entities['setup'] ?? []).filter(
  (field) => field.key !== 'version',
)

function projectionValue(
  value: unknown,
  input: string,
  language: string,
  labels: Readonly<Record<string, string>>,
): string {
  return isStructuredInput(input)
    ? localizedNamedValue(value, language, labels)
    : localizedValue(value, language)
}

export function EquipmentSection({
  equipment,
  onSelectSetup,
  onTubeUsageHistoryChange,
  disabled,
  showErrors,
  save,
}: {
  equipment: EquipmentRef
  onSelectSetup: (entityId: string, entity: V2EntityRead | null) => void
  onTubeUsageHistoryChange: (value: string) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { i18n, t } = useTranslation()
  const { session } = useAuth()
  const setupRefField = getModuleFields('equipment').find(
    (field) => field.key === 'setup_ref',
  )
  const tubeUsageHistoryField = getModuleFields('equipment').find(
    (field) => field.key === 'tube_usage_history',
  )
  const setupMissing = Boolean(showErrors) && equipment.setupId === ''
  let tubeUsageHistoryInvalid = equipment.tubeUsageHistory.trim() === ''
  if (!tubeUsageHistoryInvalid) {
    try {
      tubeUsageHistoryInvalid =
        structuredPayload('tube_usage_history', equipment.tubeUsageHistory) ==
        null
    } catch {
      tubeUsageHistoryInvalid = true
    }
  }
  const showTubeUsageHistoryError =
    Boolean(showErrors) && tubeUsageHistoryInvalid
  const snapshot = equipment.snapshot ?? {}
  const structuredLabels = buildStructuredValueLabels(t)

  return (
    <ModuleCard
      id="module-equipment"
      index="§2"
      title={t('experimentsV2.sections.equipment.title')}
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
          selectedVersion={equipment.version}
          selectedSnapshot={equipment.snapshot}
          onChange={onSelectSetup}
          disabled={disabled}
        />
        {setupMissing ? (
          <p className="text-xs text-destructive">{t('validation.required')}</p>
        ) : null}
      </div>

      <div className="flex max-w-md flex-col gap-1.5">
        <FieldLabel
          labelZh={
            tubeUsageHistoryField
              ? localizedFieldLabel(tubeUsageHistoryField, i18n.language)
              : t('experimentsV2.sections.equipment.tubeUsageHistory')
          }
          unit={
            tubeUsageHistoryField
              ? localizedUnit(tubeUsageHistoryField.unit, i18n.language)
              : null
          }
          required
          r0={tubeUsageHistoryField?.r0 ?? false}
        />
        <StructuredObjectControl
          fieldKey="tube_usage_history"
          value={equipment.tubeUsageHistory}
          onChange={onTubeUsageHistoryChange}
          disabled={disabled}
          invalid={showTubeUsageHistoryError}
        />
        <p className="text-xs text-muted-foreground">
          {tubeUsageHistoryField
            ? localizedFieldHelp(tubeUsageHistoryField, i18n.language)
            : t('experimentsV2.sections.equipment.tubeUsageHistoryHelp')}
        </p>
        {showTubeUsageHistoryError ? (
          <p className="text-xs text-destructive">
            {t('validation.usageHistory')}
          </p>
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
            {PROJECTION_FIELDS.map((field) => {
              const raw = snapshot[field.key]
              const value = projectionValue(
                raw,
                field.input,
                i18n.language,
                structuredLabels,
              )
              return (
                <div key={field.key} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {localizedFieldLabel(field, i18n.language)}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm text-foreground">
                    {isEntityFileInput(field.input) && raw ? (
                      <EntityFileDisplay
                        value={raw}
                        token={session.accessToken || ''}
                      />
                    ) : (
                      value || '—'
                    )}
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
