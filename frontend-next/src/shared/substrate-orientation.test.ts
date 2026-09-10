import { describe, expect, it } from 'vitest'
import {
  legacySubstrateOrientation,
  normalizeCrystalPlane,
  substrateOrientationPayload,
  substratePlaneOptions,
} from './substrate-orientation'

describe('supplier crystal planes', () => {
  it('normalizes integer planes without reinterpreting direction indices', () => {
    expect(normalizeCrystalPlane('(100)', 'sio2_si')).toBe('(1 0 0)')
    expect(normalizeCrystalPlane('a 面', 'sapphire_al2o3')).toBe('(1 1 -2 0)')
    expect(normalizeCrystalPlane('(10-12)', 'sapphire_al2o3')).toBe(
      '(1 0 -1 2)',
    )
    for (const value of [
      '[100]',
      '{100}',
      '(000)',
      '(1.5 0 0)',
      '(1 0)',
      'c面偏2度',
    ])
      expect(() => normalizeCrystalPlane(value)).toThrow()
    expect(() => normalizeCrystalPlane('(1111)', 'sapphire_al2o3')).toThrow()
    expect(() => normalizeCrystalPlane('(100)', 'sapphire_al2o3')).toThrow()
    expect(normalizeCrystalPlane('polycrystalline', 'cu_foil')).toBe(
      'polycrystalline',
    )
  })

  it('distinguishes quartz glass, crystal, unknown type and supplier cuts', () => {
    expect(
      substrateOrientationPayload({
        substrate_material: 'quartz',
        quartz_type: 'fused_silica',
        substrate_polish: 'single_side_polished',
      }),
    ).toEqual({ substrate_crystal_plane: 'amorphous' })
    expect(substratePlaneOptions('quartz', 'fused_silica')).toEqual([
      'amorphous',
    ])
    for (const quartz_type of ['', 'not_provided', 'fused_silica'])
      expect(() =>
        substrateOrientationPayload({
          substrate_material: 'quartz',
          quartz_type,
          substrate_crystal_plane: '(100)',
        }),
      ).toThrow()
    expect(
      substrateOrientationPayload({
        substrate_material: 'quartz',
        quartz_type: 'single_crystal_quartz',
        substrate_crystal_plane: 'supplier_cut',
        substrate_cut_spec: ' AT-cut ',
      }),
    ).toEqual({
      substrate_crystal_plane: 'supplier_cut',
      substrate_cut_spec: 'AT-cut',
    })
    expect(() =>
      substrateOrientationPayload({ substrate_crystal_plane: 'supplier_cut' }),
    ).toThrow('substrate_cut_spec')
  })

  it('retains unparseable old specifications when editing a new version', () => {
    const source = {
      substrate_material: 'sapphire_al2o3',
      substrate_orientation_polish: {
        value: '[0001] 原文',
        option: 'single_side_polished',
      },
    }
    expect(legacySubstrateOrientation(source)).toMatchObject({
      substrate_crystal_plane: 'supplier_cut',
      substrate_cut_spec: '[0001] 原文',
      substrate_polish: 'single_side_polished',
    })
    expect(source).not.toHaveProperty('substrate_crystal_plane')
  })
})
