import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type {
  FieldCondition,
  FieldMetadata,
} from '@/shared/generated/field-metadata'
import { isConditionSatisfied } from '@/features/experiments-v2/field-logic'
import { isFieldVisible, matchesCondition } from './field-logic'

interface ConditionCase {
  name: string
  condition: FieldCondition
  driver: unknown
  expected?: boolean
  frontend?: { expected: false; logs: 'console.error' }
  unresolvable?: boolean
}

const fixture = JSON.parse(
  readFileSync(
    join(process.cwd(), '..', 'docs', 'standard', 'condition-cases.json'),
    'utf8',
  ),
) as { cases: ConditionCase[] }

describe('shared condition cases', () => {
  for (const testCase of fixture.cases) {
    it(testCase.name, () => {
      if (testCase.unresolvable) {
        const field = {
          key: 'synthetic',
          labelZh: 'Synthetic',
          labelEn: 'Synthetic',
          input: '文本',
          unit: null,
          options: null,
          requirement: {
            raw: '条件必填',
            level: 'conditional_required',
            condition: testCase.condition,
          },
          r0: false,
          group: null,
        } satisfies FieldMetadata
        expect(
          isConditionSatisfied(testCase.condition, {}, 'target_product'),
        ).toBe(false)
        expect(isFieldVisible('material_lot', field, {})).toBe(false)
        return
      }

      if (testCase.frontend) {
        expect(testCase.frontend).toEqual({
          expected: false,
          logs: 'console.error',
        })
        const error = vi
          .spyOn(console, 'error')
          .mockImplementation(() => undefined)
        expect(matchesCondition(testCase.condition, testCase.driver)).toBe(
          testCase.frontend.expected,
        )
        expect(error).toHaveBeenCalledOnce()
        error.mockRestore()
        return
      }

      expect(matchesCondition(testCase.condition, testCase.driver)).toBe(
        testCase.expected,
      )
    })
  }
})
