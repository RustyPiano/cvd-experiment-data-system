// 一等实体的动态表单（纯展示；数据获取/提交由页面注入 onSubmit）。
// 字段清单、显隐、必填、选项均由 field-metadata 驱动；UI 文案全部走 i18n（D12）。
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import type { Control, Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod/v4'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import type { FieldMetadata } from '@/shared/generated/field-metadata'
import { RequiredMark } from '@/shared/ui/required-mark'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EntityKind } from './config'
import {
  buildDefaultValues,
  buildSubmitPayload,
  getEntityFields,
  isEffectivelyRequired,
  isFieldVisible,
  parseEnumOptions,
} from './field-logic'
import type { EntityFormValues } from './field-logic'

// 长文本字段用多行输入并跨两列（示意图/配置/坐标系描述）。
const TEXTAREA_KEYS = new Set([
  'setup_diagram',
  'mfc_config',
  'fixed_config',
  'coordinate_system',
])

export type EntityFormMode = 'create' | 'newVersion'

type EntityFormProps = {
  kind: EntityKind
  mode: EntityFormMode
  /** newVersion 模式下的目标版本号（= 当前版本 + 1），用于「改动即新版本」提示。 */
  nextVersion: number
  /** newVersion 模式下的旧版本数据快照，用于预填。 */
  defaultData?: Record<string, unknown> | null
  submitting: boolean
  onSubmit: (payload: Record<string, string>) => void
  onCancel: () => void
}

export function EntityForm({
  kind,
  mode,
  nextVersion,
  defaultData,
  submitting,
  onSubmit,
  onCancel,
}: EntityFormProps) {
  const { t } = useTranslation()
  const fields = useMemo(() => getEntityFields(kind), [kind])

  // 校验模式随当前取值动态重建：可见且有效必填的字段才强制非空（隐藏字段不校验）。
  // 动态 z.object 的输出类型会被推断为 Record<string, unknown>，故把 zodResolver
  // 产物断言回本表单的 Resolver<EntityFormValues>（键集恒为字符串字段，运行期一致）。
  const resolver: Resolver<EntityFormValues> = (values, context, options) => {
    const shape: Record<string, z.ZodType> = {}
    for (const field of fields) {
      const required =
        isFieldVisible(kind, field, values) &&
        isEffectivelyRequired(kind, field, values)
      shape[field.key] = required
        ? z.string().trim().min(1, t('validation.required'))
        : z.string()
    }
    const zodBackedResolver = zodResolver(
      z.object(shape),
    ) as unknown as Resolver<EntityFormValues>
    return zodBackedResolver(values, context, options)
  }

  const form = useForm<EntityFormValues>({
    defaultValues: buildDefaultValues(kind, defaultData),
    resolver,
  })

  const values = form.watch()

  const handleSubmit = form.handleSubmit((submitted) => {
    onSubmit(buildSubmitPayload(kind, submitted))
  })

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        autoComplete="off"
      >
        {mode === 'newVersion' ? (
          <Alert>
            <AlertDescription data-testid="new-version-banner">
              {t('entityLibrary.form.newVersionBanner', {
                version: nextVersion,
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t('entityLibrary.form.requiredHint')}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) =>
            isFieldVisible(kind, field, values) ? (
              <EntityFieldControl
                key={field.key}
                kind={kind}
                field={field}
                values={values}
                control={form.control}
                disabled={submitting}
              />
            ) : null,
          )}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onCancel}
          >
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('actions.save')}
          </Button>
        </div>
      </form>
    </Form>
  )
}

function EntityFieldControl({
  kind,
  field,
  values,
  control,
  disabled,
}: {
  kind: EntityKind
  field: FieldMetadata
  values: EntityFormValues
  control: Control<EntityFormValues>
  disabled: boolean
}) {
  const { t } = useTranslation()
  const required = isEffectivelyRequired(kind, field, values)
  const enumOptions = parseEnumOptions(field.options)
  const useTextarea = TEXTAREA_KEYS.has(field.key)
  const placeholder = enumOptions
    ? t('entityLibrary.form.selectPlaceholder')
    : (field.options ?? t('entityLibrary.form.inputPlaceholder'))

  return (
    <FormField
      control={control}
      name={field.key}
      render={({ field: rhf }) => (
        <FormItem className={useTextarea ? 'sm:col-span-2' : undefined}>
          <FormLabel>
            <span>{field.labelZh}</span>
            {field.unit ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                （{field.unit}）
              </span>
            ) : null}
            {required ? <RequiredMark /> : null}
          </FormLabel>
          {enumOptions ? (
            <Select
              value={rhf.value || undefined}
              onValueChange={rhf.onChange}
              disabled={disabled}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {enumOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <FormControl>
              {useTextarea ? (
                <Textarea
                  {...rhf}
                  rows={3}
                  placeholder={placeholder}
                  disabled={disabled}
                />
              ) : (
                <Input
                  {...rhf}
                  autoComplete="off"
                  placeholder={placeholder}
                  disabled={disabled}
                />
              )}
            </FormControl>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
