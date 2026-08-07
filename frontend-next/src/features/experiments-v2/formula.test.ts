import { describe, expect, it } from 'vitest'
import {
  extractElementSymbols,
  formatChemicalFormula,
  generateSolidSolutionFormula,
  normalizeChemicalFormula,
  renderFormulaDisplay,
  validateChemicalFormula,
  validateMaterialFormula,
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

describe('target formula display', () => {
  it('uses subscripts and generates solid-solution formulas from equal components', () => {
    expect(formatChemicalFormula('MoS2')).toBe('MoS₂')
    expect(
      generateSolidSolutionFormula([
        { formula: 'MoS2', fraction: 0.5 },
        { formula: 'WS2', fraction: 0.5 },
      ]),
    ).toBe('Mo0.5W0.5S2')
    expect(
      generateSolidSolutionFormula([
        { formula: 'MoS2', fraction: 0.5 },
        { formula: 'MoSe2', fraction: 0.5 },
      ]),
    ).toBe('MoSSe')
    expect(
      generateSolidSolutionFormula([
        { formula: 'MoS2', fraction: 0.4 },
        { formula: 'WS2', fraction: 0.5 },
      ]),
    ).toBeNull()
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

describe('validateMaterialFormula', () => {
  it('支持单一物料的括号与水合物，不接受体系分隔符', () => {
    expect(validateMaterialFormula('Al2(SO4)3').valid).toBe(true)
    expect(validateMaterialFormula('CuSO4·5H2O').valid).toBe(true)
    expect(validateMaterialFormula('MoS2/WS2').valid).toBe(false)
  })
})

describe('renderFormulaDisplay (前端即时预览)', () => {
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

  it('keeps the entered formula for doped systems because components are authoritative', () => {
    expect(
      renderFormulaDisplay('MoS2', '掺杂', [
        { formula: 'Nb', role: '掺杂剂' },
        { formula: 'MoS2', role: '基体' },
      ]),
    ).toBe('MoS2')
    expect(
      renderFormulaDisplay('fallback', '掺杂', [
        { formula: 'Nb', role: '其他' },
      ]),
    ).toBe('fallback')
  })
})
