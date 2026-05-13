import { describe, expect, it } from "vitest";

import type {
  ExperimentModuleKey,
  ExperimentModulePayloadRead,
  ExperimentRead,
} from "../../shared/types/api";
import {
  createInitialEditorValues,
  createEmptyPrecursorItem,
  payloadToFurnaceProgramValues,
  segmentsToTemperatureNodes,
  syncFurnaceProgramZonesCount,
  temperatureNodesToSegments,
  toBasicInfoPayload,
  toFurnaceProgramPayload,
  toPrecursorsPayload,
  toSubstratesPayload,
  validateSectionValues,
} from "./editor-types";

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

describe("basic info editor payloads", () => {
  it("serializes layer count into the basic info module payload", () => {
    expect(
      toBasicInfoPayload(
        {
          experimentType: "cvd_2zone",
          materialSystem: "MoS2",
          experimentDate: "2026-05-12",
          objective: "baseline",
          layerCount: "多层",
        },
        "user-1",
      ),
    ).toMatchObject({
      operator_id: "user-1",
      layer_count: "多层",
    });
  });
});

describe("temperatureNodesToSegments", () => {
  it("converts 4-node program to 3 segments with correct durations and temperatures", () => {
    const nodes = [
      { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
      { node_index: 2, time_min: 35, temperature_C: 650, note: "升温结束" },
      { node_index: 3, time_min: 50, temperature_C: 650, note: "恒温结束" },
      { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
    ];

    const result = temperatureNodesToSegments(nodes);

    expect(result.startTemperatureC).toBe("25");
    expect(result.segments).toEqual([
      { label: "升温", durationMin: "35", targetTemperatureC: "650", note: "升温结束" },
      { label: "保温", durationMin: "15", targetTemperatureC: "650", note: "恒温结束" },
      { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
    ]);
  });

  it("returns defaults when passed empty array", () => {
    const result = temperatureNodesToSegments([]);
    expect(result.startTemperatureC).toBe("25");
    expect(result.segments).toHaveLength(3);
  });

  it("returns defaults when only one node is present", () => {
    const result = temperatureNodesToSegments([
      { node_index: 1, time_min: 0, temperature_C: 30, note: "" },
    ]);
    expect(result.startTemperatureC).toBe("30");
    expect(result.segments).toHaveLength(3); // default segments
  });

  it("handles null time_min or temperature_C gracefully", () => {
    const nodes = [
      { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
      { node_index: 2, time_min: null, temperature_C: null, note: "blank step" },
    ];
    const result = temperatureNodesToSegments(nodes);
    expect(result.segments[0].durationMin).toBe(""); // null difference → empty
    expect(result.segments[0].targetTemperatureC).toBe(""); // null → empty
    expect(result.segments[0].note).toBe("blank step");
  });

  it("infers labels from notes first, then temperature changes, then position", () => {
    const result = temperatureNodesToSegments([
      { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
      { node_index: 2, time_min: 10, temperature_C: 25, note: "升温结束" },
      { node_index: 3, time_min: 20, temperature_C: 20, note: "恒温结束" },
      { node_index: 4, time_min: 30, temperature_C: 80, note: "" },
      { node_index: 5, time_min: 40, temperature_C: null, note: "" },
    ]);

    expect(result.segments.map((segment) => segment.label)).toEqual([
      "升温",
      "保温",
      "升温",
      "区间 4",
    ]);
  });
});

describe("segmentsToTemperatureNodes", () => {
  it("converts 3 segments to 4 nodes with correct cumulative times", () => {
    const nodes = segmentsToTemperatureNodes("25", [
      { label: "升温", durationMin: "35", targetTemperatureC: "650", note: "升温结束" },
      { label: "保温", durationMin: "15", targetTemperatureC: "650", note: "恒温结束" },
      { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
    ]);

    expect(nodes).toEqual([
      { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
      { node_index: 2, time_min: 35, temperature_C: 650, note: "升温结束" },
      { node_index: 3, time_min: 50, temperature_C: 650, note: "恒温结束" },
      { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
    ]);
  });

  it("produces null time_min for subsequent nodes when an intermediate duration is empty", () => {
    const nodes = segmentsToTemperatureNodes("25", [
      { label: "升温", durationMin: "30", targetTemperatureC: "700", note: "升温结束" },
      { label: "保温", durationMin: "", targetTemperatureC: "700", note: "恒温结束" },
      { label: "降温", durationMin: "", targetTemperatureC: "25", note: "降温结束" },
    ]);

    expect(nodes[0]).toMatchObject({ node_index: 1, time_min: 0, temperature_C: 25 });
    expect(nodes[1]).toMatchObject({ node_index: 2, time_min: 30, temperature_C: 700 });
    expect(nodes[2]).toMatchObject({ node_index: 3, time_min: null, temperature_C: 700 });
    expect(nodes[3]).toMatchObject({ node_index: 4, time_min: null, temperature_C: 25 });
  });

  it("produces null temperature_C when targetTemperatureC is empty", () => {
    const nodes = segmentsToTemperatureNodes("25", [
      { label: "升温", durationMin: "30", targetTemperatureC: "", note: "" },
    ]);
    expect(nodes[1].temperature_C).toBeNull();
  });
});

describe("furnace program payload round-trip", () => {
  it("derives zone segments from canonical temperature_program nodes on load", () => {
    const values = createInitialEditorValues(experiment, [
      modulePayload("furnace_program", {
        furnace_info: { zones_count: 2, model: "OTF-1200X" },
        zones: [
          {
            zone_key: "zone_1",
            temperature_program: [
              { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
              { node_index: 2, time_min: 35, temperature_C: 650, note: "升温结束" },
              { node_index: 3, time_min: 50, temperature_C: 650, note: "恒温结束" },
              { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
            ],
          },
          {
            zone_key: "zone_2",
            temperature_program: [
              { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
              { node_index: 2, time_min: 35, temperature_C: 780, note: "升温结束" },
              { node_index: 3, time_min: 50, temperature_C: 780, note: "恒温结束" },
              { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
            ],
          },
        ],
        placements: [],
      }),
    ]);

    expect(values.furnaceProgram.furnaceInfo).toEqual({ zonesCount: "2", model: "OTF-1200X" });
    expect(values.furnaceProgram.zones[0].zoneKey).toBe("zone_1");
    expect(values.furnaceProgram.zones[0].startTemperatureC).toBe("25");
    expect(values.furnaceProgram.zones[0].segments).toEqual([
      { label: "升温", durationMin: "35", targetTemperatureC: "650", note: "升温结束" },
      { label: "保温", durationMin: "15", targetTemperatureC: "650", note: "恒温结束" },
      { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
    ]);
    expect(values.furnaceProgram.zones[1].segments[0].targetTemperatureC).toBe("780");
  });

  it("initializes blank experiment with 2 default zones each with 3 default segments", () => {
    const values = createInitialEditorValues(experiment, []);

    expect(values.furnaceProgram.furnaceInfo.zonesCount).toBe("2");
    expect(values.furnaceProgram.zones).toHaveLength(2);
    expect(values.furnaceProgram.zones[0].zoneKey).toBe("zone_1");
    expect(values.furnaceProgram.zones[0].segments).toHaveLength(3);
    expect(values.furnaceProgram.zones[1].segments).toHaveLength(3);
  });

  it("serializes segments back to canonical temperature_program on save", () => {
    const payload = toFurnaceProgramPayload({
      furnaceInfo: { zonesCount: "2", model: "OTF-1200X" },
      placements: [
        {
          precursorIndex: "0",
          zoneKey: "zone_1",
          positionCm: "-15",
          note: "upstream",
        },
      ],
      zones: [
        {
          zoneKey: "zone_1",
          startTemperatureC: "25",
          note: "upstream zone",
          segments: [
            { label: "升温", durationMin: "30", targetTemperatureC: "750", note: "升温结束" },
          ],
        },
        {
          zoneKey: "zone_2",
          startTemperatureC: "25",
          note: "",
          segments: [
            { label: "升温", durationMin: "30", targetTemperatureC: "200", note: "" },
          ],
        },
      ],
    });

    expect(payload.furnace_info).toEqual({
      zones_count: 2,
      model: "OTF-1200X",
      initial_temperatures_C: { zone_1: 25, zone_2: 25 },
    });
    expect(payload.placements[0]).toEqual({
      precursor_index: 0,
      zone_key: "zone_1",
      position_cm: -15,
      note: "upstream",
    });
    expect(payload.zones[0]).toMatchObject({
      zone_key: "zone_1",
      note: "upstream zone",
      temperature_program: [
        { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
        { node_index: 2, time_min: 30, temperature_C: 750, note: "升温结束" },
      ],
    });
    expect(payload).not.toHaveProperty("precursors");
    expect(payload).not.toHaveProperty("steps");
  });

  it("serializes blank or invalid placement numbers as null instead of NaN", () => {
    const payload = toFurnaceProgramPayload({
      furnaceInfo: { zonesCount: "1", model: "" },
      placements: [{ precursorIndex: "", zoneKey: "zone_1", positionCm: "", note: "draft" }],
      zones: [{ zoneKey: "zone_1", startTemperatureC: "", note: "", segments: [] }],
    });

    expect(payload.placements[0]).toEqual({
      precursor_index: null,
      zone_key: "zone_1",
      position_cm: null,
      note: "draft",
    });
    expect(payload.furnace_info.initial_temperatures_C).toEqual({ zone_1: null });
  });

  it("syncs furnace zones and clears out-of-range placement zone when zonesCount changes", () => {
    const value = {
      furnaceInfo: { zonesCount: "2", model: "" },
      placements: [
        { precursorIndex: "0", zoneKey: "zone_2", positionCm: "-15", note: "" },
      ],
      zones: [
        {
          zoneKey: "zone_1",
          startTemperatureC: "25",
          note: "",
          segments: [
            { label: "升温", durationMin: "30", targetTemperatureC: "650", note: "升温结束" },
          ],
        },
        {
          zoneKey: "zone_2",
          startTemperatureC: "25",
          note: "",
          segments: [
            { label: "升温", durationMin: "30", targetTemperatureC: "780", note: "升温结束" },
          ],
        },
      ],
    };

    const next = syncFurnaceProgramZonesCount(value, "1");

    expect(next.furnaceInfo.zonesCount).toBe("1");
    expect(next.zones).toHaveLength(1);
    expect(next.zones[0].zoneKey).toBe("zone_1");
    expect(next.zones[0].segments[0].targetTemperatureC).toBe("650");
    expect(next.placements[0].zoneKey).toBe(""); // cleared because zone_2 gone
  });

  it("does not truncate invalid zonesCount values", () => {
    const values = createInitialEditorValues(experiment, []);
    values.furnaceProgram.furnaceInfo.zonesCount = "2abc";

    const errors = validateSectionValues("furnace_program", values);
    const synced = syncFurnaceProgramZonesCount(values.furnaceProgram, "1.5");
    const payload = toFurnaceProgramPayload({
      ...values.furnaceProgram,
      furnaceInfo: { ...values.furnaceProgram.furnaceInfo, zonesCount: "2abc" },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "furnaceInfo.zonesCount",
          message: "温区数量必须是正整数",
        }),
      ]),
    );
    expect(synced.furnaceInfo.zonesCount).toBe("1.5");
    expect(synced.zones).toHaveLength(2);
    expect(payload.furnace_info.zones_count).toBeNull();
  });

  it("reads canonical placements correctly from payload", () => {
    const values = createInitialEditorValues(experiment, [
      modulePayload("furnace_program", {
        furnace_info: { zones_count: 2 },
        placements: [
          { precursor_index: 1, zone_key: "zone_1", position_cm: -25, note: "upstream" },
        ],
        zones: [],
      }),
    ]);

    expect(values.furnaceProgram.placements).toEqual([
      { precursorIndex: "1", zoneKey: "zone_1", positionCm: "-25", note: "upstream" },
    ]);
  });

  it("payloadToFurnaceProgramValues reads canonical zones and placements without legacy fallback", () => {
    const fp = payloadToFurnaceProgramValues({
      furnace_info: { zones_count: 1, model: "Tube A" },
      placements: [
        { precursor_index: 0, zone_key: "zone_1", position_cm: -10, note: "note" },
      ],
      zones: [
        {
          zone_key: "zone_1",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "" },
            { node_index: 2, time_min: 20, temperature_C: 700, note: "step" },
          ],
          note: "zone note",
        },
      ],
    });

    expect(fp.furnaceInfo).toEqual({ zonesCount: "1", model: "Tube A" });
    expect(fp.placements).toEqual([
      { precursorIndex: "0", zoneKey: "zone_1", positionCm: "-10", note: "note" },
    ]);
    expect(fp.zones[0]).toMatchObject({
      zoneKey: "zone_1",
      startTemperatureC: "25",
      note: "zone note",
      segments: [
        { label: "升温", durationMin: "20", targetTemperatureC: "700", note: "step" },
      ],
    });
  });

  it("fills missing declared zones from zones_count", () => {
    const fp = payloadToFurnaceProgramValues({
      furnace_info: { zones_count: 2, model: "Tube A" },
      placements: [],
      zones: [
        {
          zone_key: "zone_1",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 30, note: "" },
            { node_index: 2, time_min: 20, temperature_C: 700, note: "升温结束" },
          ],
        },
      ],
    });

    expect(fp.zones).toHaveLength(2);
    expect(fp.zones[0].startTemperatureC).toBe("30");
    expect(fp.zones[1]).toMatchObject({
      zoneKey: "zone_2",
      startTemperatureC: "25",
    });
    expect(fp.zones[1].segments).toHaveLength(3);
  });

  it("allows blank furnace draft fields but rejects filled non-positive durations", () => {
    const values = createInitialEditorValues(experiment, []);
    values.furnaceProgram.zones[0].startTemperatureC = "";
    values.furnaceProgram.zones[0].segments = [
      { label: "升温", durationMin: "", targetTemperatureC: "", note: "" },
      { label: "保温", durationMin: "0", targetTemperatureC: "700", note: "" },
      { label: "降温", durationMin: "-5", targetTemperatureC: "25", note: "" },
    ];

    const errors = validateSectionValues("furnace_program", values);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "zones.0.segments.1.durationMin" }),
        expect.objectContaining({ fieldPath: "zones.0.segments.2.durationMin" }),
      ]),
    );
    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "zones.0.startTemperatureC" }),
        expect.objectContaining({ fieldPath: "zones.0.segments.0.durationMin" }),
        expect.objectContaining({ fieldPath: "zones.0.segments.0.targetTemperatureC" }),
      ]),
    );
  });
});

describe("substrate editor payloads", () => {
  it("serializes substrate batch numbers", () => {
    const payload = toSubstratesPayload({
      items: [
        {
          role: "top",
          type: "硅片单抛N<100>",
          brand: "华赫硅材料",
          sizeMm: "5x10",
          batchNo: "SUB-2026-05-A",
          treatmentMethod: "",
          positionMm: "",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
      ],
    });

    expect(payload.items[0]).toMatchObject({
      role: "top",
      batch_no: "SUB-2026-05-A",
    });
  });

  it("omits hidden legacy roles and role-only source-backed substrate rows", () => {
    const payload = toSubstratesPayload({
      items: [
        {
          sourcePayload: { role: "top", surface_finish: "polished" },
          role: "top",
          type: "",
          brand: "",
          sizeMm: "",
          batchNo: "",
          treatmentMethod: "",
          positionMm: "",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
        {
          role: "control",
          type: "Legacy hidden substrate",
          brand: "",
          sizeMm: "",
          batchNo: "",
          treatmentMethod: "",
          positionMm: "",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
        {
          role: "bottom",
          type: "蓝宝石双抛C<0001>",
          brand: "",
          sizeMm: "",
          batchNo: "",
          treatmentMethod: "",
          positionMm: "",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
      ],
    });

    expect(payload.items).toEqual([
      {
        role: "bottom",
        type: "蓝宝石双抛C<0001>",
      },
    ]);
  });
});

describe("precursor editor payloads", () => {
  it("does not validate stale fields hidden by the selected precursor method", () => {
    const values = createInitialEditorValues(experiment, []);
    values.precursors.items = [
      {
        ...createEmptyPrecursorItem(),
        method: "solution",
        concentration: "0.5",
        spinSpeedRpm: "3000",
        spinTimeS: "30",
        preSpinSpeedRpm: "500",
        preSpinTimeS: "5",
        massMg: "abc",
        preparationTimeMin: "abc",
        meltingTemperatureC: "abc",
      },
    ];

    const errors = validateSectionValues("precursors", values);

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldPath: "items.0.massMg" }),
        expect.objectContaining({ fieldPath: "items.0.preparationTimeMin" }),
        expect.objectContaining({ fieldPath: "items.0.meltingTemperatureC" }),
      ]),
    );
  });

  it("normalizes method-inapplicable precursor fields out of payloads", () => {
    const payload = toPrecursorsPayload({
      items: [
        {
          ...createEmptyPrecursorItem(),
          species: "MoO3",
          method: "melting",
          concentration: "abc",
          concentrationUnit: "mol/L",
          spinSpeedRpm: "abc",
          spinTimeS: "abc",
          preSpinSpeedRpm: "abc",
          preSpinTimeS: "abc",
          meltingTemperatureC: "795",
          massMg: "12.5",
        },
      ],
    });

    expect(payload.items[0]).toEqual({
      species: "MoO3",
      method: "melting",
      melting_temperature_C: 795,
      mass_mg: 12.5,
    });
  });
});
