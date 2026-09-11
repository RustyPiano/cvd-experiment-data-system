import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { characterizationProfiles } from '@/shared/generated/field-metadata'
import {
  ConditionInput,
  characterizationConditionIssue,
  conditionMatches,
} from '@/shared/characterization-conditions'
import {
  conditionDraft,
  presetConditions,
  reconcileConditions,
} from '@/shared/instrument-presets'
import {
  omCatalogValid,
  omFixedConditions,
  opticalSpec,
} from '@/shared/om-configuration'
import type { OMCatalog, OMEntry, OMSelection } from '@/shared/om-configuration'

export function OMSelect({
  label,
  value,
  options,
  disabled,
  onChange,
  labels,
}: {
  label: string
  value: string
  options: string[]
  disabled?: boolean
  onChange: (value: string) => void
  labels?: Record<string, string>
}) {
  const id = useId()
  const { t } = useTranslation()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || '__empty'}
        disabled={disabled}
        onValueChange={(next) => onChange(next === '__empty' ? '' : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="__empty">{t('om.select')}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {labels?.[option] ?? option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function OMEntryEditor({
  method,
  section,
  entry,
  catalog,
  disabled,
  onChange,
  onRemove,
}: {
  method: string
  section: string
  entry: OMEntry
  catalog: OMCatalog
  disabled: boolean
  onChange: (entry: OMEntry) => void
  onRemove: () => void
}) {
  const { t, i18n } = useTranslation()
  const definition = opticalSpec(method)
  const spec = definition.sections[section]
  const id = useId()
  const [draft, setDraft] = useState(() => conditionDraft(entry.conditions))
  const [nativeText, setNativeText] = useState(() =>
    (entry.native_extensions ?? []).join(', '),
  )
  const context = {
    ...(method === 'optical_microscopy' ? { observation_mode: 'digital' } : {}),
    ...draft,
  }
  const fields = spec.fields.flatMap((key) =>
    characterizationProfiles[method].condition_fields.filter(
      (field) => field.key === key,
    ),
  )
  return (
    <details open className="min-w-0 rounded-md border p-3">
      <summary className="cursor-pointer break-words">
        {entry.name || t('om.unnamed')}
      </summary>
      <FieldGroup className="mt-3 gap-3">
        <Field>
          <FieldLabel htmlFor={id}>{t('om.name')}</FieldLabel>
          <Input
            id={id}
            value={entry.name}
            maxLength={128}
            disabled={disabled}
            onChange={(e) => onChange({ ...entry, name: e.target.value })}
          />
        </Field>
        {(spec.references ?? []).map((key) => (
          <OMSelect
            key={key}
            label={
              i18n.language.startsWith('en')
                ? definition.sections[key].label_en
                : definition.sections[key].label_zh
            }
            value={entry.references?.[key] ?? ''}
            options={(catalog[key] ?? [])
              .map((item) => item.name)
              .filter(Boolean)}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...entry,
                references: { ...entry.references, [key]: value },
              })
            }
          />
        ))}
        <FieldGroup className="grid gap-3 sm:grid-cols-2">
          {fields
            .filter((field) => conditionMatches(field.when, context))
            .map((field) => (
              <ConditionInput
                key={field.key}
                field={field}
                conditions={context}
                language={i18n.language}
                required={
                  spec.required.includes(field.key) ||
                  Boolean(
                    field.required_when &&
                    conditionMatches(field.required_when, context),
                  )
                }
                disabled={disabled}
                issue={characterizationConditionIssue(
                  field,
                  context,
                  spec.required.includes(field.key) ||
                    Boolean(
                      field.required_when &&
                      conditionMatches(field.required_when, context),
                    ),
                  i18n.language,
                )}
                onChange={(key, value) => {
                  const next = reconcileConditions(method, {
                    ...context,
                    [key]: value,
                  })
                  setDraft(next)
                  const typed = presetConditions(method, next)
                  onChange({
                    ...entry,
                    conditions: Object.fromEntries(
                      Object.entries(typed).filter(([k]) =>
                        spec.fields.includes(k),
                      ),
                    ),
                  })
                }}
              />
            ))}
        </FieldGroup>
        {section === 'cameras' ? (
          <Field>
            <FieldLabel htmlFor={id + '-native'}>
              {t('om.nativeExtensions')}
            </FieldLabel>
            <Input
              id={id + '-native'}
              value={nativeText}
              disabled={disabled}
              onChange={(event) => {
                setNativeText(event.target.value)
                onChange({
                  ...entry,
                  native_extensions: event.target.value
                    .split(',')
                    .map((value) => value.trim().toLowerCase())
                    .filter(Boolean),
                })
              }}
              placeholder=".czi, .nd2"
            />
          </Field>
        ) : null}
        {section === 'cameras'
          ? [
              'exposure_mode',
              ...(entry.conditions.image_color_mode === 'color' &&
              entry.adjustable?.includes('white_balance_mode')
                ? ['white_balance_mode']
                : []),
            ].map((key) => {
              const field = characterizationProfiles[
                method
              ].condition_fields.find((item) => item.key === key)!
              return (
                <fieldset key={key} className="flex flex-wrap gap-3">
                  <legend className="mb-2 text-sm font-medium">
                    {t('om.supportedModes', {
                      name: i18n.language.startsWith('en')
                        ? field.label_en
                        : field.label_zh,
                    })}
                  </legend>
                  {field.options?.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        disabled={disabled}
                        checked={
                          entry.mode_options?.[key]?.includes(option.value) ??
                          false
                        }
                        onCheckedChange={(checked) =>
                          onChange({
                            ...entry,
                            mode_options: {
                              ...entry.mode_options,
                              [key]: checked
                                ? [
                                    ...(entry.mode_options?.[key] ?? []),
                                    option.value,
                                  ]
                                : (entry.mode_options?.[key] ?? []).filter(
                                    (value) => value !== option.value,
                                  ),
                            },
                          })
                        }
                      />
                      {i18n.language.startsWith('en')
                        ? option.label_en
                        : option.label_zh}
                    </label>
                  ))}
                </fieldset>
              )
            })
          : null}
        {spec.adjustable.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">
              {t('om.adjustable')}
            </legend>
            {spec.adjustable.map((key) => {
              const field = characterizationProfiles[
                method
              ].condition_fields.find((item) => item.key === key)!
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={entry.adjustable?.includes(key) ?? false}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...entry,
                        adjustable: checked
                          ? [...(entry.adjustable ?? []), key]
                          : (entry.adjustable ?? []).filter(
                              (item) => item !== key,
                            ),
                      })
                    }
                  />
                  {i18n.language.startsWith('en')
                    ? field.label_en
                    : field.label_zh}
                </label>
              )
            })}
          </fieldset>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            if (window.confirm(t('om.removeConfirm'))) onRemove()
          }}
        >
          {t('om.remove')}
        </Button>
      </FieldGroup>
    </details>
  )
}

export function OMCatalogEditor({
  method = 'optical_microscopy',
  catalog,
  disabled,
  onChange,
}: {
  catalog: OMCatalog
  disabled: boolean
  onChange: (value: OMCatalog) => void
  method?: string
}) {
  const { t, i18n } = useTranslation()
  const definition = opticalSpec(method)
  const [entryKeys, setEntryKeys] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      Object.entries(catalog).map(([key, entries]) => [
        key,
        entries.map(() => crypto.randomUUID()),
      ]),
    ),
  )
  return (
    <FieldGroup className="gap-4">
      {Object.entries(definition.sections).map(([section, spec]) => (
        <fieldset key={section} className="flex min-w-0 flex-col gap-3">
          <legend className="mb-2 font-medium">
            {i18n.language.startsWith('en') ? spec.label_en : spec.label_zh}
          </legend>
          {(catalog[section] ?? []).map((entry, index) => (
            <OMEntryEditor
              key={entryKeys[section]?.[index] ?? index}
              method={method}
              section={section}
              entry={entry}
              catalog={catalog}
              disabled={disabled}
              onChange={(value) =>
                onChange({
                  ...catalog,
                  [section]: catalog[section].map((item, position) =>
                    position === index ? value : item,
                  ),
                })
              }
              onRemove={() => {
                setEntryKeys((current) => ({
                  ...current,
                  [section]: (current[section] ?? []).filter(
                    (_, position) => position !== index,
                  ),
                }))
                onChange({
                  ...catalog,
                  [section]: catalog[section].filter(
                    (_, position) => position !== index,
                  ),
                })
              }}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={
              disabled ||
              (catalog[section]?.length ?? 0) >= definition.max_entries
            }
            onClick={() => {
              setEntryKeys((current) => ({
                ...current,
                [section]: [...(current[section] ?? []), crypto.randomUUID()],
              }))
              onChange({
                ...catalog,
                [section]: [
                  ...(catalog[section] ?? []),
                  {
                    name: '',
                    conditions: {},
                    adjustable: [],
                    ...(section === 'cameras'
                      ? { mode_options: { exposure_mode: [] } }
                      : {}),
                    ...(spec.references ? { references: {} } : {}),
                  },
                ],
              })
            }}
          >
            {t('om.add', {
              name: i18n.language.startsWith('en')
                ? spec.label_en
                : spec.label_zh,
            })}
          </Button>
        </fieldset>
      ))}
      {!omCatalogValid(catalog, method) ? (
        <p role="alert" className="text-sm text-destructive">
          {t(method === 'Raman' ? 'raman.invalidCatalog' : 'om.invalid')}
        </p>
      ) : null}
    </FieldGroup>
  )
}

export function OMConfigurationSelect({
  method = 'optical_microscopy',
  catalog,
  selection,
  digital,
  disabled,
  onChange,
}: {
  catalog: OMCatalog
  selection: OMSelection
  method?: string
  digital: boolean
  disabled: boolean
  onChange: (selection: OMSelection) => void
}) {
  const { t, i18n } = useTranslation()
  const definition = opticalSpec(method)
  const { values, adjustable } = omFixedConditions(catalog, selection, method)
  return (
    <FieldGroup className="gap-3">
      <FieldGroup className="grid gap-3 sm:grid-cols-2">
        {Object.entries(definition.sections)
          .filter(
            ([section]) => digital || !['cameras', 'scales'].includes(section),
          )
          .map(([section, spec]) => {
            const options = (catalog[section] ?? [])
              .filter((entry) =>
                Object.entries(entry.references ?? {}).every(
                  ([key, name]) => selection[key] === name,
                ),
              )
              .map((entry) => entry.name)
            if (section === 'scales' && !options.length) return null
            return (
              <OMSelect
                key={section}
                label={
                  i18n.language.startsWith('en') ? spec.label_en : spec.label_zh
                }
                value={selection[section] ?? ''}
                options={options}
                labels={
                  section === 'objectives'
                    ? Object.fromEntries(
                        (catalog.objectives ?? []).map((entry) => [
                          entry.name,
                          entry.conditions.objective_na
                            ? entry.name +
                              ' · NA ' +
                              entry.conditions.objective_na
                            : entry.name,
                        ]),
                      )
                    : undefined
                }
                disabled={disabled}
                onChange={(name) => {
                  const next = { ...selection }
                  if (section !== 'scales') delete next.scales
                  if (section === 'lasers') delete next.spectrometers
                  if (name) next[section] = name
                  else delete next[section]
                  onChange(next)
                }}
              />
            )
          })}
      </FieldGroup>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">
          {t('om.configurationParameters')}
        </summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(values)
            .filter(([key]) => !adjustable.has(key))
            .map(([key, value]) => {
              const field = characterizationProfiles[
                method
              ].condition_fields.find((item) => item.key === key)
              if (!field) return null
              const option = field.options?.find((item) => item.value === value)
              return (
                <div key={key}>
                  <dt className="text-muted-foreground">
                    {i18n.language.startsWith('en')
                      ? field.label_en
                      : field.label_zh}
                  </dt>
                  <dd>
                    {option
                      ? i18n.language.startsWith('en')
                        ? option.label_en
                        : option.label_zh
                      : value}
                    {field.unit ? ' ' + field.unit : ''}
                  </dd>
                </div>
              )
            })}
        </dl>
      </details>
    </FieldGroup>
  )
}
