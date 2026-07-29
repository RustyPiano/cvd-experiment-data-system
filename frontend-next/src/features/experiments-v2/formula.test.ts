import { describe, expect, it } from 'vitest'
import {
  extractElementSymbols,
  normalizeChemicalFormula,
  validateChemicalFormula,
} from './formula'

describe('extractElementSymbols', () => {
  it('tokenizes element symbols, ignoring digits and subscripts', () => {
    expect(extractElementSymbols('MoS2')).toEqual(['Mo', 'S'])
    expect(extractElementSymbols('MoS₂')).toEqual(['Mo', 'S'])
    expect(extractElementSymbols('Al₂O₃')).toEqual(['Al', 'O'])
    expect(extractElementSymbols('SiO₂/Si')).toEqual(['Si', 'O', 'Si'])
  })
})

describe('normalizeChemicalFormula', () => {
  it('normalizes Unicode subscripts, hydrate-dot variants, and whitespace', () => {
    expect(normalizeChemicalFormula(' Mo S₂ ')).toBe('MoS2')
    expect(normalizeChemicalFormula('SiO₂ / Si')).toBe('SiO2/Si')
    expect(normalizeChemicalFormula('Na₂WO₄∙2H₂O')).toBe('Na2WO4·2H2O')
  })
})

describe('validateChemicalFormula (元素校验)', () => {
  it('accepts valid formulas and reports parsed elements (deduped)', () => {
    expect(validateChemicalFormula('MoS2')).toMatchObject({
      valid: true,
      empty: false,
      elements: ['Mo', 'S'],
    })
    expect(validateChemicalFormula('WSe2').valid).toBe(true)
    expect(validateChemicalFormula('MoS₂').valid).toBe(true)
    expect(validateChemicalFormula(' Mo S₂ ').valid).toBe(true)
    expect(validateChemicalFormula('SiO₂/Si').elements).toEqual(['Si', 'O'])
  })

  it('treats an empty string as valid (required-ness handled elsewhere)', () => {
    expect(validateChemicalFormula('')).toMatchObject({
      valid: true,
      empty: true,
    })
    expect(validateChemicalFormula('   ')).toMatchObject({
      valid: true,
      empty: true,
    })
  })

  it('flags unknown (non-periodic-table) symbols', () => {
    const xz = validateChemicalFormula('Xz2')
    expect(xz.valid).toBe(false)
    expect(xz.unknownSymbols).toContain('Xz')

    const moq = validateChemicalFormula('MoQ2')
    expect(moq.valid).toBe(false)
    expect(moq.unknownSymbols).toContain('Q')
    expect(moq.elements).toContain('Mo')
  })

  it('accepts common parenthesized composition groups', () => {
    expect(validateChemicalFormula('Mo(S)2')).toMatchObject({
      valid: true,
      syntaxValid: true,
      elements: ['Mo', 'S'],
    })
    expect(validateChemicalFormula('Ca(OH)2').valid).toBe(true)
    expect(validateChemicalFormula('(NH4)6Mo7O24·4H2O').valid).toBe(true)
    expect(validateChemicalFormula('Na2WO4⋅2H2O').valid).toBe(true)
    expect(validateChemicalFormula('Mo((S))2').valid).toBe(false)
  })
})
