import type { FieldValidation } from '@/shared/generated/field-metadata'

export type NumericValidationIssue =
  | { kind: 'finite' }
  | { kind: 'integer' }
  | { kind: 'ge' | 'gt' | 'le' | 'lt'; limit: number }

export interface NumericInputAttributes {
  min: number | undefined
  max: number | undefined
  step: number | 'any'
}

/**
 * Validate a non-empty numeric form value against generated field metadata.
 * Empty/required handling remains the form owner's responsibility.
 */
export function numericValidationIssue(
  value: string | number,
  validation: FieldValidation | null | undefined,
): NumericValidationIssue | null {
  const text = String(value).trim()
  const number = text === '' ? Number.NaN : Number(text)
  if (!Number.isFinite(number)) return { kind: 'finite' }
  if (validation?.type === 'integer' && !Number.isInteger(number)) {
    return { kind: 'integer' }
  }
  if (typeof validation?.ge === 'number' && number < validation.ge) {
    return { kind: 'ge', limit: validation.ge }
  }
  if (typeof validation?.gt === 'number' && number <= validation.gt) {
    return { kind: 'gt', limit: validation.gt }
  }
  if (typeof validation?.le === 'number' && number > validation.le) {
    return { kind: 'le', limit: validation.le }
  }
  if (typeof validation?.lt === 'number' && number >= validation.lt) {
    return { kind: 'lt', limit: validation.lt }
  }
  return null
}

/**
 * Native attributes are hints and keyboard affordances. Exclusive boundaries
 * still use the exact metadata check above because HTML has no exclusive min/max.
 */
export function numericInputAttributes(
  validation: FieldValidation | null | undefined,
): NumericInputAttributes {
  return {
    min:
      typeof validation?.ge === 'number'
        ? validation.ge
        : typeof validation?.gt === 'number'
          ? validation.gt
          : undefined,
    max:
      typeof validation?.le === 'number'
        ? validation.le
        : typeof validation?.lt === 'number'
          ? validation.lt
          : undefined,
    step: validation?.type === 'integer' ? 1 : 'any',
  }
}

export function assertValidNumber(
  value: string | number,
  fieldKey: string,
  validation: FieldValidation | null | undefined,
): number {
  const issue = numericValidationIssue(value, validation)
  if (issue) {
    throw new RangeError(
      `${fieldKey} violates ${issue.kind} numeric constraint`,
    )
  }
  return Number(value)
}
