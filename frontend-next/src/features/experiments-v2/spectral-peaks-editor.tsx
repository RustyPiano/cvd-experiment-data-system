import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isEnglish } from '@/shared/field-i18n'
import type { MeasurementBundleCreate } from './api'

type SpectralValue = NonNullable<
  Extract<
    NonNullable<MeasurementBundleCreate['properties']>[number],
    { property_code: 'spectral_peaks' }
  >['structured_value']
>

export type PeakDraft = {
  id: number
  position: string
  fwhm: string
  height: string
  area: string
  d_spacing_nm: string
}
export type PeakSeriesDraft = {
  status: '' | 'recorded' | 'not_detected'
  positionUnit: string
  intensityUnit: string
  sourceFileIndex: number | null
  sourceLocator?: string
  extractionMethod?: string
  baselineMethod?: string
  peaks: PeakDraft[]
}

export function emptyPeakSeries(
  positionUnit = '',
  intensityUnit = 'a.u.',
): PeakSeriesDraft {
  return {
    status: '',
    positionUnit,
    intensityUnit,
    sourceFileIndex: null,
    peaks: [],
  }
}

export function peakSeriesIssue(
  value: PeakSeriesDraft,
  rawIndexes: number[],
  method: string,
): string | null {
  if (!value.status) return null
  if (
    ['Raman', 'PL'].includes(method) &&
    value.peaks.some((peak) => peak.height.trim() || peak.area.trim()) &&
    !value.intensityUnit
  )
    return 'intensityRequired'
  if (
    ['Raman', 'PL'].includes(method) &&
    value.peaks.some(
      (peak) => peak.fwhm.trim() || peak.height.trim() || peak.area.trim(),
    ) &&
    (!value.extractionMethod?.trim() || !value.baselineMethod?.trim())
  )
    return 'extractionRequired'
  if (
    (method !== 'XRD' || value.positionUnit !== '° 2θ') &&
    value.peaks.some((peak) => peak.d_spacing_nm.trim())
  )
    return 'invalidPeak'
  if (
    !(
      rawIndexes.length === 1 ||
      rawIndexes.includes(value.sourceFileIndex ?? -1)
    )
  )
    return 'sourceRequired'
  if (value.status === 'recorded' && !value.peaks.length) return 'peakRequired'
  if (
    value.peaks.some((peak) => {
      if (!peak.position.trim() || !Number.isFinite(Number(peak.position)))
        return true
      if (
        ['nm', 'eV'].includes(value.positionUnit) &&
        Number(peak.position) <= 0
      )
        return true
      if (
        value.positionUnit === '° 2θ' &&
        (Number(peak.position) < 0 || Number(peak.position) > 180)
      )
        return true
      return (['fwhm', 'height', 'area', 'd_spacing_nm'] as const).some(
        (key) =>
          peak[key].trim() &&
          (!Number.isFinite(Number(peak[key])) ||
            (['fwhm', 'd_spacing_nm'].includes(key)
              ? Number(peak[key]) <= 0
              : Number(peak[key]) < 0)),
      )
    })
  )
    return 'invalidPeak'
  return null
}

export function peakSeriesValue(
  value: PeakSeriesDraft,
  rawIndexes: number[],
  uploadedFileIds: string[],
): SpectralValue {
  const sourceIndex =
    rawIndexes.length === 1 ? rawIndexes[0] : value.sourceFileIndex
  return {
    status: value.status as SpectralValue['status'],
    position_unit: value.positionUnit as SpectralValue['position_unit'],
    ...(value.intensityUnit
      ? {
          intensity_unit:
            value.intensityUnit as SpectralValue['intensity_unit'],
        }
      : {}),
    ...(value.sourceLocator?.trim()
      ? { source_locator: value.sourceLocator.trim() }
      : {}),
    ...(value.extractionMethod?.trim()
      ? { extraction_method: value.extractionMethod.trim() }
      : {}),
    ...(value.baselineMethod?.trim()
      ? { baseline_method: value.baselineMethod.trim() }
      : {}),
    ...(sourceIndex !== null && rawIndexes.includes(sourceIndex)
      ? { source_file_id: uploadedFileIds[sourceIndex] }
      : {}),
    peaks: value.peaks.map((peak) => ({
      id: peak.id,
      position: Number(peak.position),
      ...Object.fromEntries(
        (['fwhm', 'height', 'area', 'd_spacing_nm'] as const)
          .filter((key) => peak[key].trim())
          .map((key) => [key, Number(peak[key])]),
      ),
    })),
  }
}

export function SpectralPeaksEditor({
  value,
  onChange,
  units,
  method,
  rawFiles,
  rawIndexes,
  disabled,
}: {
  value: PeakSeriesDraft
  onChange: (value: PeakSeriesDraft) => void
  units: string[]
  method: string
  rawFiles: File[]
  rawIndexes: number[]
  disabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const [widthUnit, setWidthUnit] = useState('eV')
  const tr = (key: string) =>
    t(`characterizations.workspace.peaks.${key}`, { defaultValue: key })
  const fields = [
    'position',
    'fwhm',
    'height',
    'area',
    ...(method === 'XRD' && value.positionUnit === '° 2θ'
      ? ['d_spacing_nm']
      : []),
  ] as (keyof Omit<PeakDraft, 'id'>)[]
  const issue = peakSeriesIssue(value, rawIndexes, method)
  const unitFor = (key: string) =>
    key === 'fwhm' && method === 'PL' && value.positionUnit === 'eV'
      ? widthUnit
      : key === 'd_spacing_nm'
        ? 'nm'
        : key === 'height'
          ? value.intensityUnit
          : key === 'area'
            ? value.intensityUnit
              ? `${value.intensityUnit} · ${value.positionUnit}`
              : ''
            : value.positionUnit
  return (
    <fieldset className="flex min-w-0 flex-col gap-4" disabled={disabled}>
      <legend className="mb-3 text-sm font-medium">{tr('title')}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-2 sm:col-span-2">
          <Checkbox
            id="peak-not-detected"
            checked={value.status === 'not_detected'}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (
                checked &&
                value.peaks.length &&
                !window.confirm(tr('clearPeaks'))
              )
                return
              onChange({
                ...value,
                status: checked ? 'not_detected' : '',
                peaks: [],
              })
            }}
          />
          <Label htmlFor="peak-not-detected">{tr('not_detected')}</Label>
        </div>
        {units.length > 1 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="peak-unit">{tr('positionUnit')}</Label>
            <Select
              value={value.positionUnit}
              onValueChange={(unit) => {
                if (value.peaks.length && !window.confirm(tr('changeUnit')))
                  return
                onChange({
                  ...value,
                  positionUnit: unit,
                  peaks: [],
                  status: value.peaks.length ? '' : value.status,
                })
              }}
              disabled={disabled}
            >
              <SelectTrigger id="peak-unit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {units.map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {value.status ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="peak-source-locator">
                {t('characterizations.metadata.sourceLocator')}
              </Label>
              <Input
                id="peak-source-locator"
                maxLength={256}
                value={value.sourceLocator ?? ''}
                onChange={(event) =>
                  onChange({ ...value, sourceLocator: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="peak-extraction-method">
                {t('characterizations.metadata.peakExtraction')}
              </Label>
              <Input
                id="peak-extraction-method"
                maxLength={256}
                value={value.extractionMethod ?? ''}
                onChange={(event) =>
                  onChange({ ...value, extractionMethod: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="peak-baseline-method">
                {t('characterizations.metadata.baseline')}
              </Label>
              <Input
                id="peak-baseline-method"
                maxLength={256}
                value={value.baselineMethod ?? ''}
                onChange={(event) =>
                  onChange({ ...value, baselineMethod: event.target.value })
                }
              />
            </div>
          </>
        ) : null}
        {rawIndexes.length > 1 && value.status ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="peak-source">{tr('source')}</Label>
            <Select
              value={
                value.sourceFileIndex === null
                  ? ''
                  : String(value.sourceFileIndex)
              }
              onValueChange={(index) =>
                onChange({ ...value, sourceFileIndex: Number(index) })
              }
              disabled={disabled}
            >
              <SelectTrigger
                id="peak-source"
                className="w-full"
                aria-invalid={issue === 'sourceRequired' || undefined}
              >
                <SelectValue
                  placeholder={t(
                    'characterizations.workspace.placeholders.select',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {rawIndexes.map((index) => (
                    <SelectItem key={index} value={String(index)}>
                      {rawFiles[index].name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      {method === 'PL' && value.positionUnit === 'eV' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="pl-width-unit">{t('pl.widthUnit')}</Label>
          <Select
            value={widthUnit}
            disabled={disabled}
            onValueChange={setWidthUnit}
          >
            <SelectTrigger id="pl-width-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="eV">eV</SelectItem>
                <SelectItem value="meV">meV</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {value.peaks.map((peak, index) => (
        <fieldset
          key={peak.id}
          className="flex min-w-0 flex-col gap-3 rounded-lg border p-3"
        >
          <legend className="px-1 text-sm font-medium">
            {tr('peak')} {index + 1}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fields.map((key) => {
              const id = `peak-${peak.id}-${key}`
              return (
                <div key={key} className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor={id}>
                    {tr(key)}
                    {unitFor(key)
                      ? isEnglish(i18n.language)
                        ? ` (${unitFor(key)})`
                        : `（${unitFor(key)}）`
                      : ''}
                  </Label>
                  <Input
                    id={id}
                    type="number"
                    step="any"
                    value={
                      key === 'fwhm' &&
                      method === 'PL' &&
                      value.positionUnit === 'eV' &&
                      widthUnit === 'meV' &&
                      peak[key]
                        ? String(Number(peak[key]) * 1000)
                        : peak[key]
                    }
                    min={
                      key === 'position' &&
                      !['nm', 'eV', '° 2θ'].includes(value.positionUnit)
                        ? undefined
                        : 0
                    }
                    max={
                      key === 'position' && value.positionUnit === '° 2θ'
                        ? 180
                        : undefined
                    }
                    required={key === 'position'}
                    disabled={disabled}
                    aria-label={`${tr('peak')} ${index + 1} ${tr(key)} (${unitFor(key)})`}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        peaks: value.peaks.map((item) =>
                          item.id === peak.id
                            ? {
                                ...item,
                                [key]:
                                  key === 'fwhm' &&
                                  method === 'PL' &&
                                  value.positionUnit === 'eV' &&
                                  widthUnit === 'meV' &&
                                  event.target.value
                                    ? String(Number(event.target.value) / 1000)
                                    : event.target.value,
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </div>
              )
            })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-end"
            disabled={disabled}
            aria-label={`${tr('remove')} ${index + 1}`}
            onClick={() =>
              onChange({
                ...value,
                peaks: value.peaks.filter((item) => item.id !== peak.id),
                status: value.peaks.length > 1 ? 'recorded' : '',
              })
            }
          >
            {tr('remove')}
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled || value.peaks.length >= 200}
        onClick={() =>
          onChange({
            ...value,
            status: 'recorded',
            peaks: [
              ...value.peaks,
              {
                id: Math.max(0, ...value.peaks.map((peak) => peak.id)) + 1,
                position: '',
                fwhm: '',
                height: '',
                area: '',
                d_spacing_nm: '',
              },
            ],
          })
        }
      >
        {tr('add')}
      </Button>
      {value.status === 'recorded' &&
      (!['Raman', 'PL'].includes(method) ||
        value.peaks.some((peak) => peak.height || peak.area)) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="peak-intensity-unit">{tr('intensityUnit')}</Label>
            <Select
              value={value.intensityUnit}
              disabled={disabled}
              onValueChange={(unit) => {
                if (
                  value.peaks.some((peak) => peak.height || peak.area) &&
                  !window.confirm(tr('changeIntensityUnit'))
                )
                  return
                onChange({
                  ...value,
                  intensityUnit: unit,
                  peaks: value.peaks.map((peak) => ({
                    ...peak,
                    height: '',
                    area: '',
                  })),
                })
              }}
            >
              <SelectTrigger id="peak-intensity-unit" className="w-full">
                <SelectValue
                  placeholder={t(
                    'characterizations.workspace.placeholders.select',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {['a.u.', 'counts', 'counts/s'].map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      {issue ? (
        <p role="alert" className="text-sm text-destructive">
          {issue === 'intensityRequired'
            ? t('raman.intensityRequired')
            : issue === 'extractionRequired'
              ? t('raman.extractionRequired')
              : tr(issue)}
        </p>
      ) : null}
    </fieldset>
  )
}
