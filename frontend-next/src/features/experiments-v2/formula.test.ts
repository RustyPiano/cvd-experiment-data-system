import { describe, expect, it } from 'vitest'
import {
  extractElementSymbols,
  normalizeChemicalFormula,
  renderFormulaDisplay,
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
  it('normalizes Unicode subscripts and whitespace to the stored ASCII form', () => {
    expect(normalizeChemicalFormula(' Mo S₂ ')).toBe('MoS2')
    expect(normalizeChemicalFormula('SiO₂ / Si')).toBe('SiO2/Si')
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

  it('rejects unsupported grouping syntax instead of accepting its elements', () => {
    expect(validateChemicalFormula('Mo(S)2')).toMatchObject({
      valid: false,
      syntaxValid: false,
      elements: ['Mo', 'S'],
    })
  })
})

describe('renderFormulaDisplay (复刻后端 formula_display 规则)', () => {
  it('returns the raw formula for 本征 / no components', () => {
    expect(renderFormulaDisplay('MoS2', '本征', [])).toBe('MoS2')
    expect(renderFormulaDisplay('MoS2', '掺杂', [])).toBe('MoS2')
  })

  it('joins by layer order for 垂直异质结', () => {
    expect(
      renderFormulaDisplay('x', '垂直异质结', [
        { formula: 'WSe2', layer_order: '2' },
        { formula: 'MoS2', layer_order: '1' },
      ]),
    ).toBe('MoS2/WSe2')
  })

  it('joins with a dash for 横向异质结', () => {
    expect(
      renderFormulaDisplay('x', '横向异质结', [
        { formula: 'WSe2' },
        { formula: 'MoS2' },
      ]),
    ).toBe('WSe2-MoS2')
  })

  it('renders dopant:matrix for 掺杂 and falls back without a pair', () => {
    expect(
      renderFormulaDisplay('x', '掺杂', [
        { formula: 'Nb', role: '掺杂剂' },
        { formula: 'MoS2', role: '基体' },
      ]),
    ).toBe('Nb:MoS2')
    expect(
      renderFormulaDisplay('fallback', '掺杂', [
        { formula: 'Nb', role: '其他' },
      ]),
    ).toBe('fallback')
  })
})
