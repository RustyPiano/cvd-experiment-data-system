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
  SHG_TIME_FIELDS,
  conditionDraft,
  instrumentPresets,
  instrumentPresetsAreValid,
  presetConditions,
  presetFields,
  reconcileConditions,
  shgPresetContext,
} from '@/shared/instrument-presets'
import type { OMEntry } from '@/shared/om-configuration'

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
  if (method === 'low_frequency_raman') method = 'Raman'
  const { t, i18n } = useTranslation()
  const prefix = useId()
  const presets = instrumentPresets(configuration)
  // Offer SHG preset settings only for registered detection paths.
  const detections = (
    configuration?.shg as { detections?: OMEntry[] } | undefined
  )?.detections
  const kinds = new Set(
    detections?.map((entry) => String(entry.conditions.detection_kind)),
  )
  const shgFieldRegistered = (key: string) =>
    !detections?.length ||
    ({
      integration_time_s: ['spectrometer', 'point_detector'],
      pixel_dwell_time_us: ['point_detector'],
      exposure_time_ms: ['camera'],
      spectral_range_nm: ['spectrometer'],
      slit_width_um: ['spectrometer'],
    }[key]?.some((kind) => kinds.has(kind)) ??
      true)
  const [drafts, setDrafts] = useState(() =>
    presets.map((preset) => conditionDraft(preset.conditions)),
  )
  const update = (next: typeof presets) =>
    onChange({
      ...configuration,
      presets: presetFields(method)
        ? next.map((preset) => ({
            ...preset,
            conditions: Object.fromEntries(
              Object.entries(preset.conditions).filter(([key]) =>
                presetFields(method)!.includes(key),
              ),
            ),
          }))
        : next,
    })
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {presets.map((preset, index) => {
        const values = drafts[index] ?? conditionDraft(preset.conditions)
        const draft: Record<string, string> = {
          ...(method === 'optical_microscopy'
            ? { observation_mode: 'digital', image_color_mode: 'color' }
            : method === 'SHG'
              ? shgPresetContext(values)
              : {}),
          ...values,
        }
        // An SHG preset records one detection-specific time; offer all until one is set.
        const shgTimes = SHG_TIME_FIELDS.filter((key) => values[key]?.trim())
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
                      !field.legacy_only &&
                      (method === 'SHG' && SHG_TIME_FIELDS.includes(field.key)
                        ? !shgTimes.length || shgTimes.includes(field.key)
                        : conditionMatches(field.when, draft)) &&
                      (method !== 'SHG' || shgFieldRegistered(field.key)) &&
                      (!presetFields(method) ||
                        presetFields(method)!.includes(field.key)),
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
                          key === 'power_setting_unit' &&
                          draft[key] !== value
                        )
                          delete next.power_setting
                        if (
                          key === 'excitation_power_basis' &&
                          draft[key] !== value
                        )
                          delete next.excitation_power_value
                        const reconciled =
                          method === 'SHG'
                            ? Object.fromEntries(
                                Object.entries(
                                  reconcileConditions(method, {
                                    ...shgPresetContext(next),
                                    ...next,
                                  }),
                                ).filter(
                                  ([name]) =>
                                    ![
                                      'detection_kind',
                                      'acquisition_kind',
                                    ].includes(name),
                                ),
                              )
                            : reconcileConditions(method, next)
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
