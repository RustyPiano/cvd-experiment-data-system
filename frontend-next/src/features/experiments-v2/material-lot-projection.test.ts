import { describe, expect, it } from 'vitest'

import {
  materialLotProjectedItem,
  materialLotProjection,
} from './material-lot-projection'

describe('material lot projection', () => {
  it('projects independent polish and supplier cuts, clearing stale run values', () => {
    const snapshot = {
      attrs: {
        substrate_material: 'quartz',
        substrate_crystal_plane: 'supplier_cut',
        substrate_cut_spec: 'AT-cut',
        substrate_polish: 'double_side_polished',
      },
    }
    expect(materialLotProjection(snapshot)).toEqual({
      material: 'quartz',
      crystal_orientation: 'AT-cut',
      polish: 'double_side_polished',
    })
    expect(
      materialLotProjectedItem({
        lot_ref: JSON.stringify({
          snapshot: { attrs: { substrate_polish: 'single_side_polished' } },
        }),
        crystal_orientation: '(100)',
      }),
    ).toMatchObject({ crystal_orientation: '', polish: 'single_side_polished' })
  })
  it('copies only the current substrate identity fields from the frozen lot', () => {
    const snapshot = {
      chemical_formula: 'SiO2/Si',
      attrs: {
        substrate_material: 'sio2_si',
        substrate_oxide_thickness_nm: 285,
        substrate_orientation_polish: {
          value: '(100)',
          option: 'single_side_polished',
        },
        substrate_miscut_angle_deg: 0.2,
      },
    }

    expect(materialLotProjection(snapshot)).toEqual({
      material: 'sio2_si',
      chemical_formula: 'SiO2/Si',
      crystal_orientation: '(100)；single_side_polished',
      oxide_thickness_nm: '285',
    })
    expect(
      materialLotProjectedItem({
        lot_ref: JSON.stringify({ entity_id: 'lot-1', version: 1, snapshot }),
        chemical_formula: 'stale',
        crystal_orientation: 'stale',
      }),
    ).toMatchObject({
      chemical_formula: 'SiO2/Si',
      crystal_orientation: '(100)；single_side_polished',
    })
  })
})
