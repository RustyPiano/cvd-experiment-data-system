import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { characterizationProfiles } from '@/shared/generated/field-metadata'
import {
  ConditionInput,
  characterizationConditionIssue,
  conditionMatches,
} from '@/shared/characterization-conditions'
import {
  conditionDraft,
  instrumentPresets,
  instrumentPresetsAreValid,
  presetConditions,
  reconcileConditions,
} from '@/shared/instrument-presets'

export function InstrumentPresetsEditor({
  method,
  configuration,
  disabled,
  onChange,
}: {
  method: string
  configuration?: Record<string, unknown>
  disabled: boolean
  onChange: (configuration: Record<string, unknown>) => void
}) {
  const { t, i18n } = useTranslation()
  const prefix = useId()
  const presets = instrumentPresets(configuration)
  const [drafts, setDrafts] = useState(() =>
    presets.map((preset) => conditionDraft(preset.conditions)),
  )
  const update = (next: typeof presets) =>
    onChange({ ...configuration, presets: next })
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {presets.map((preset, index) => {
        const draft = drafts[index] ?? conditionDraft(preset.conditions)
        return (
          <details key={index} open className="min-w-0 rounded-md border p-3">
            <summary className="cursor-pointer break-words font-medium">
              {preset.name || t('instrumentPresets.unnamed')}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <Label htmlFor={prefix + index}>
                {t('instrumentPresets.name')}
              </Label>
              <Input
                id={prefix + index}
                value={preset.name}
                maxLength={128}
                disabled={disabled}
                onChange={(event) =>
                  update(
                    presets.map((item, position) =>
                      position === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                {characterizationProfiles[method].condition_fields
                  .filter(
                    (field) =>
                      !field.legacy_only && conditionMatches(field.when, draft),
                  )
                  .map((field) => (
                    <ConditionInput
                      key={field.key}
                      field={field}
                      conditions={draft}
                      language={i18n.language}
                      disabled={disabled}
                      issue={characterizationConditionIssue(
                        field,
                        draft,
                        false,
                        i18n.language,
                      )}
                      onChange={(key, value) => {
                        const next = { ...draft, [key]: value }
                        if (
                          key === 'excitation_power_basis' &&
                          draft[key] !== value
                        )
                          delete next.excitation_power_value
                        const reconciled = reconcileConditions(method, next)
                        setDrafts((current) =>
                          presets.map((_, position) =>
                            position === index ? reconciled : current[position],
                          ),
                        )
                        update(
                          presets.map((item, position) =>
                            position === index
                              ? {
                                  ...item,
                                  conditions: presetConditions(
                                    method,
                                    reconciled,
                                  ),
                                }
                              : item,
                          ),
                        )
                      }}
                    />
                  ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  if (
                    (preset.name || Object.keys(preset.conditions).length) &&
                    !window.confirm(t('instrumentPresets.removeConfirm'))
                  )
                    return
                  update(presets.filter((_, position) => position !== index))
                  setDrafts((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }}
              >
                {t('instrumentPresets.remove')}
              </Button>
            </div>
          </details>
        )
      })}
      {presets.length > 0 &&
      !instrumentPresetsAreValid(method, configuration) ? (
        <p role="alert" className="text-sm text-destructive">
          {t('instrumentPresets.invalid')}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        disabled={disabled || presets.length >= 50}
        onClick={() => {
          setDrafts((current) => [...current, {}])
          update([...presets, { name: '', conditions: {} }])
        }}
      >
        {t('instrumentPresets.add')}
      </Button>
    </div>
  )
}
