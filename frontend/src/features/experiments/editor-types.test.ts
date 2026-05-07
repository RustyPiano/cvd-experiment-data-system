import { describe, expect, it } from "vitest";

import type {
  ExperimentModuleKey,
  ExperimentModulePayloadRead,
  ExperimentRead,
} from "../../shared/types/api";
import { createInitialEditorValues, toFurnaceProgramPayload } from "./editor-types";

const experiment: ExperimentRead = {
  id: "exp-1",
  run_code: "CVD-2026-0001",
  owner_id: "user-1",
  derived_from_run_id: null,
  derived_from_run_code: null,
  recipe_id: null,
  experiment_type: "cvd_2zone",
  material_system: "MoS2",
  experiment_date: "2026-04-23",
  objective: "placement conversion",
  status: "draft",
  quality_label: "unknown",
  summary_result: null,
  invalid_reason: null,
  created_at: "2026-04-23T00:00:00Z",
  updated_at: "2026-04-23T00:00:00Z",
  submitted_at: null,
  locked_at: null,
};

function modulePayload(
  moduleKey: ExperimentModuleKey,
  payloadJson: Record<string, unknown>,
): ExperimentModulePayloadRead {
  return {
    id: `module-${moduleKey}`,
    experiment_run_id: experiment.id,
    module_key: moduleKey,
    schema_version: "cvd_v1",
    payload_json: payloadJson,
    note: null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
  };
}

describe("furnace placement editor payloads", () => {
  it("serializes canonical placements without legacy furnace precursors", () => {
    const payload = toFurnaceProgramPayload({
      furnaceInfo: {
        zonesCount: "2",
        model: "OTF-1200X",
        initialTemperaturesC: { zone_1: "25", zone_2: "25" },
      },
      placements: [
        {
          precursorIndex: "0",
          zoneKey: "zone_1",
          positionCm: "-15",
          note: "upstream",
        },
      ],
      steps: [],
    });

    expect(payload).toMatchObject({
      placements: [
        {
          precursor_index: 0,
          zone_key: "zone_1",
          position_cm: -15,
          note: "upstream",
        },
      ],
    });
    expect(payload).not.toHaveProperty("precursors");
  });

  it("maps legacy furnace precursors to placements by matching precursor species", () => {
    const values = createInitialEditorValues(experiment, [
      modulePayload("precursors", {
        items: [
          { species: "MoO3", method: "powder" },
          { species: "S", method: "powder" },
        ],
      }),
      modulePayload("furnace_program", {
        furnace_info: { zones_count: 2 },
        precursors: [{ material: "S", position_cm: -25, mass_mg: 200, note: "legacy sulfur" }],
        steps: [],
      }),
    ]);

    expect(values.furnaceProgram.placements).toEqual([
      {
        sourcePayload: expect.objectContaining({ material: "S" }),
        precursorIndex: "1",
        zoneKey: "",
        positionCm: "-25",
        note: "legacy sulfur",
      },
    ]);
  });

  it("drops legacy material and mass fields when saving migrated placements", () => {
    const payload = toFurnaceProgramPayload({
      furnaceInfo: {
        zonesCount: "2",
        model: "",
        initialTemperaturesC: { zone_1: "25", zone_2: "25" },
      },
      placements: [
        {
          sourcePayload: { material: "S", mass_mg: 200, position_cm: -25 },
          precursorIndex: "1",
          zoneKey: "zone_1",
          positionCm: "-25",
          note: "migrated",
        },
      ],
      steps: [],
    });

    expect(payload.placements[0]).toEqual({
      precursor_index: 1,
      zone_key: "zone_1",
      position_cm: -25,
      note: "migrated",
    });
  });
});
