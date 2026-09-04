import { describe, expect, it } from 'vitest'

import {
  buildSubstratesPayload,
  substratePlacementRelationsFromPayload,
  substratesFromPayload,
} from './field-logic'

describe('active substrate payload', () => {
  it('round-trips the current fields and preserves the stable piece id', () => {
    const payload = {
      items: [
        {
          source_id: '83c24150-af12-4686-82e8-ed4528031ee4',
          material: 'sio2_si',
          lot_ref: { entity_id: 'lot-1', version: 2, snapshot: {} },
          piece_label: 'S1',
          chemical_formula: 'SiO2/Si',
          crystal_orientation: '(100)',
          oxide_thickness_nm: 285,
          size_placement: {
            length_mm: 10,
            width_mm: 10,
            thickness_mm: null,
            placement: 'face_up',
            tilt_angle_deg: null,
            tilt_azimuth_deg: null,
            upright_growth_face_direction: null,
            placement_other: null,
          },
          pretreatment_steps: [],
          exposure_interval_min: null,
          exposure_environment: null,
          zone_thermocouple_distance_mm: {
            zone_index: 1,
            distance_mm: -20,
          },
          note: null,
        },
      ],
      placement_relations: [],
    }

    expect(
      buildSubstratesPayload(
        substratesFromPayload(payload),
        substratePlacementRelationsFromPayload(payload),
      ),
    ).toEqual(payload)
  })
})
