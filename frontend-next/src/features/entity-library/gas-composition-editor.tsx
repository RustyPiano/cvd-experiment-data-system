import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
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
import { gasSpecies } from '@/shared/generated/field-metadata'
import { localizedParenthetical } from '@/shared/field-i18n'
import { RequiredMark } from '@/shared/ui/required-mark'

export type GasCompositionComponent = {
  species: string
  other_name?: string
  volume_percent: number | null
}

export function gasCompositionIssue(
  components: GasCompositionComponent[],
): string | null {
  if (components.length === 0) return 'required'
  const identities = new Set<string>()
  let total = 0
  for (const component of components) {
    const otherName = component.other_name?.trim() ?? ''
    if (
      !(component.species in gasSpecies) &&
      !(component.species === 'other' && otherName)
    ) {
      return 'component'
    }
    const identity =
      component.species === 'other'
        ? `other:${otherName.toLocaleLowerCase()}`
        : component.species
    if (identities.has(identity)) return 'duplicate'
    identities.add(identity)
    if (
      !Number.isFinite(component.volume_percent) ||
      (component.volume_percent ?? 0) <= 0 ||
      (component.volume_percent ?? 0) > 100
    ) {
      return 'percentage'
    }
    total += component.volume_percent ?? 0
  }
  return Math.abs(total - 100) <= 0.010000001 ? null : 'total'
}

export function gasCompositionSummary(
  components: GasCompositionComponent[],
  otherLabel = 'other',
): string {
  return components
    .filter(
      (component) =>
        component.species && Number.isFinite(component.volume_percent),
    )
    .map(
      (component) =>
        `${component.volume_percent} vol% ${
          component.species === 'other'
            ? component.other_name?.trim() || otherLabel
            : component.species
        }`,
    )
    .join(' / ')
}

export function GasCompositionEditor({
  value,
  onChange,
  disabled,
  showErrors,
}: {
  value: GasCompositionComponent[]
  onChange: (value: GasCompositionComponent[]) => void
  disabled?: boolean
  showErrors?: boolean
}) {
  const { i18n, t } = useTranslation()
  const baseId = useId()
  const components =
    value.length > 0 ? value : [{ species: '', volume_percent: 100 }]
  const issue = gasCompositionIssue(components)
  const total = components.reduce(
    (sum, component) => sum + (component.volume_percent ?? 0),
    0,
  )
  const update = (index: number, patch: Partial<GasCompositionComponent>) =>
    onChange(
      components.map((component, itemIndex) =>
        itemIndex === index ? { ...component, ...patch } : component,
      ),
    )

  return (
    <div className="flex flex-col gap-3">
      {components.map((component, index) => (
        <fieldset
          key={index}
          className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,12rem)_auto]"
        >
          <legend className="px-1 text-sm font-medium">
            {t('entityLibrary.gasComposition.component', {
              position: index + 1,
            })}
          </legend>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${index}-species`}>
              {t('entityLibrary.gasComposition.gas')} <RequiredMark />
            </Label>
            <Select
              value={component.species}
              disabled={disabled}
              onValueChange={(species) =>
                update(index, {
                  species,
                  other_name:
                    species === 'other'
                      ? (component.other_name ?? '')
                      : undefined,
                })
              }
            >
              <SelectTrigger
                id={`${baseId}-${index}-species`}
                className="w-full"
                aria-invalid={(showErrors && !component.species) || undefined}
              >
                <SelectValue
                  placeholder={t('entityLibrary.gasComposition.selectGas')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(gasSpecies).map(([species, definition]) => (
                    <SelectItem key={species} value={species}>
                      {i18n.language.startsWith('en')
                        ? definition.label_en
                        : definition.label_zh}
                      {localizedParenthetical(species, i18n.language)}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">
                    {t('entityLibrary.gasComposition.other')}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {component.species === 'other' ? (
              <Input
                value={component.other_name ?? ''}
                disabled={disabled}
                placeholder={t(
                  'entityLibrary.gasComposition.gasNamePlaceholder',
                )}
                aria-invalid={
                  (showErrors && !component.other_name?.trim()) || undefined
                }
                onChange={(event) =>
                  update(index, { other_name: event.target.value })
                }
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${index}-percent`}>
              {t('entityLibrary.gasComposition.volumeFraction')}{' '}
              <RequiredMark />
            </Label>
            <Input
              id={`${baseId}-${index}-percent`}
              type="number"
              min="0"
              max="100"
              step="any"
              value={component.volume_percent ?? ''}
              disabled={disabled}
              aria-invalid={
                (showErrors &&
                  (!Number.isFinite(component.volume_percent) ||
                    (component.volume_percent ?? 0) <= 0 ||
                    (component.volume_percent ?? 0) > 100)) ||
                undefined
              }
              onChange={(event) =>
                update(index, {
                  volume_percent:
                    event.target.value === ''
                      ? null
                      : Number(event.target.value),
                })
              }
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="self-end"
            aria-label={t('entityLibrary.gasComposition.deleteComponent', {
              position: index + 1,
            })}
            disabled={disabled || components.length === 1}
            onClick={() =>
              onChange(components.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            <Trash2 />
          </Button>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            onChange([...components, { species: '', volume_percent: null }])
          }
        >
          <Plus data-icon="inline-start" />
          {t('entityLibrary.gasComposition.addComponent')}
        </Button>
        <p
          className={
            showErrors && issue
              ? 'text-sm text-destructive'
              : 'text-sm text-muted-foreground'
          }
        >
          {t('entityLibrary.gasComposition.total', {
            total: Number.isFinite(total) ? total : 0,
          })}
          {showErrors && issue === 'total'
            ? t('entityLibrary.gasComposition.totalRequired')
            : ''}
        </p>
      </div>
    </div>
  )
}
