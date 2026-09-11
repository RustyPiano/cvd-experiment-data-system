import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type MeasurementFileDraft = {
  intensityUnit?: string
  role: 'raw' | 'processed' | 'supporting'
  sourceIndices: number[]
  description: string
  softwareName: string
  softwareVersion: string
}

export const emptyFileMetadata = (): MeasurementFileDraft => ({
  role: 'raw',
  sourceIndices: [],
  description: '',
  softwareName: '',
  softwareVersion: '',
})

export function MeasurementFileEditor({
  method,
  files,
  metadata,
  onChange,
  onRemove,
  disabled,
}: {
  method?: string
  files: File[]
  metadata: MeasurementFileDraft[]
  onChange: (index: number, update: Partial<MeasurementFileDraft>) => void
  onRemove: (index: number) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <ul
      className="flex flex-col gap-3"
      aria-label={t('characterizations.metadata.selectedFiles')}
    >
      {files.map((file, index) => {
        const item = metadata[index] ?? emptyFileMetadata()
        return (
          <li key={`${index}-${file.name}`}>
            <fieldset
              className="min-w-0 rounded-md border p-3"
              disabled={disabled}
            >
              <legend className="max-w-full break-all px-1 text-sm">
                {file.name}
              </legend>
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel htmlFor={`measurement-file-role-${index}`}>
                    {t('characterizations.metadata.fileCategory')}
                  </FieldLabel>
                  <Select
                    value={item.role}
                    disabled={disabled}
                    onValueChange={(role) =>
                      onChange(index, {
                        role: role as MeasurementFileDraft['role'],
                      })
                    }
                  >
                    <SelectTrigger id={`measurement-file-role-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="raw">
                          {t('characterizations.metadata.rawFile')}
                        </SelectItem>
                        <SelectItem value="processed">
                          {t('characterizations.metadata.processedFile')}
                        </SelectItem>
                        <SelectItem value="supporting">
                          {t('characterizations.metadata.supportingFile')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {method === 'Raman' && item.role !== 'supporting' ? (
                  <Field>
                    <FieldLabel htmlFor={`file-intensity-${index}`}>
                      {t('raman.fileIntensity')}
                    </FieldLabel>
                    <Select
                      value={item.intensityUnit || '__empty'}
                      disabled={disabled}
                      onValueChange={(value) =>
                        onChange(index, {
                          intensityUnit: value === '__empty' ? '' : value,
                        })
                      }
                    >
                      <SelectTrigger
                        id={`file-intensity-${index}`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="__empty">
                            {t('raman.notRecorded')}
                          </SelectItem>
                          {['counts', 'counts/s', 'a.u.'].map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                {item.role !== 'raw' ? (
                  <>
                    {item.role === 'processed' ? (
                      <Field>
                        <FieldLabel>
                          {t('characterizations.metadata.rawSourcesRequired')}
                        </FieldLabel>
                        {files.map((source, sourceIndex) =>
                          sourceIndex !== index &&
                          (metadata[sourceIndex]?.role ?? 'raw') === 'raw' ? (
                            <Field key={sourceIndex} orientation="horizontal">
                              <Checkbox
                                id={`file-${index}-source-${sourceIndex}`}
                                checked={item.sourceIndices.includes(
                                  sourceIndex,
                                )}
                                onCheckedChange={(checked) =>
                                  onChange(index, {
                                    sourceIndices: checked
                                      ? [...item.sourceIndices, sourceIndex]
                                      : item.sourceIndices.filter(
                                          (value) => value !== sourceIndex,
                                        ),
                                  })
                                }
                              />
                              <FieldLabel
                                htmlFor={`file-${index}-source-${sourceIndex}`}
                                className="min-w-0 break-all"
                              >
                                {source.name}
                              </FieldLabel>
                            </Field>
                          ) : null,
                        )}
                      </Field>
                    ) : null}
                    <Field>
                      <FieldLabel htmlFor={`file-description-${index}`}>
                        {t('characterizations.metadata.descriptionRequired')}
                      </FieldLabel>
                      <Textarea
                        id={`file-description-${index}`}
                        value={item.description}
                        maxLength={2000}
                        required
                        onChange={(event) =>
                          onChange(index, { description: event.target.value })
                        }
                      />
                    </Field>
                    {item.role === 'processed' ? (
                      <FieldGroup className="grid gap-3 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor={`file-software-${index}`}>
                            {t('characterizations.metadata.software')}
                          </FieldLabel>
                          <Input
                            id={`file-software-${index}`}
                            value={item.softwareName}
                            maxLength={128}
                            onChange={(event) =>
                              onChange(index, {
                                softwareName: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`file-version-${index}`}>
                            {t('characterizations.metadata.softwareVersion')}
                          </FieldLabel>
                          <Input
                            id={`file-version-${index}`}
                            value={item.softwareVersion}
                            maxLength={128}
                            onChange={(event) =>
                              onChange(index, {
                                softwareVersion: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </FieldGroup>
                    ) : null}
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRemove(index)}
                  aria-label={`${t('characterizations.metadata.removeFile')} ${file.name}`}
                >
                  {t('characterizations.metadata.removeFile')}
                </Button>
              </FieldGroup>
            </fieldset>
          </li>
        )
      })}
    </ul>
  )
}
