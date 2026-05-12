import { describe, expect, it } from "vitest";

import type {
  ExperimentModuleKey,
  ExperimentModulePayloadRead,
  ExperimentRead,
} from "../../shared/types/api";
import {
  buildFurnaceZonesFromQuickProgram,
  createInitialEditorValues,
  createQuickProgramFromZones,
  syncFurnaceProgramZonesCount,
  toBasicInfoPayload,
  toFurnaceProgramPayload,
  toSubstratesPayload,
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

describe("furnace placement editor payloads", () => {
  it("derives shared quick furnace settings from canonical zone programs", () => {
    const values = createInitialEditorValues(experiment, [
      modulePayload("furnace_program", {
        furnace_info: {
          zones_count: 2,
          model: "OTF-1200X",
          initial_temperatures_C: { zone_1: 25, zone_2: 25 },
        },
        zones: [
          {
            zone_key: "zone_1",
            temperature_program: [
              { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
              { node_index: 2, time_min: 35, temperature_C: 650, note: "升温结束" },
              { node_index: 3, time_min: 50, temperature_C: 650, note: "恒温结束" },
              { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
            ],
          },
          {
            zone_key: "zone_2",
            temperature_program: [
              { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
              { node_index: 2, time_min: 35, temperature_C: 780, note: "升温结束" },
              { node_index: 3, time_min: 50, temperature_C: 780, note: "恒温结束" },
              { node_index: 4, time_min: 100, temperature_C: 25, note: "降温结束" },
            ],
          },
        ],
      }),
    ]);

    expect(values.furnaceProgram.quickProgram).toEqual({
      zones: {
        zone_1: {
          startTemperatureC: "25",
          segments: [
            { segmentKey: "ramp", label: "升温", durationMin: "35", targetTemperatureC: "650" },
            { segmentKey: "hold", label: "保温", durationMin: "15", targetTemperatureC: "650" },
            { segmentKey: "cool", label: "降温", durationMin: "50", targetTemperatureC: "25" },
          ],
        },
        zone_2: {
          startTemperatureC: "25",
          segments: [
            { segmentKey: "ramp", label: "升温", durationMin: "35", targetTemperatureC: "780" },
            { segmentKey: "hold", label: "保温", durationMin: "15", targetTemperatureC: "780" },
            { segmentKey: "cool", label: "降温", durationMin: "50", targetTemperatureC: "25" },
          ],
        },
      },
      isCustom: false,
    });
  });

  it("builds canonical furnace zones from per-zone quick furnace settings", () => {
    const zones = buildFurnaceZonesFromQuickProgram(
      ["zone_1", "zone_2"],
      {
        zones: {
          zone_1: {
            startTemperatureC: "25",
            segments: [
              { segmentKey: "ramp", label: "升温", durationMin: "35", targetTemperatureC: "760" },
              { segmentKey: "hold", label: "保温", durationMin: "15", targetTemperatureC: "760" },
              { segmentKey: "cool", label: "降温", durationMin: "50", targetTemperatureC: "25" },
            ],
          },
          zone_2: {
            startTemperatureC: "30",
            segments: [
              { segmentKey: "ramp", label: "升温", durationMin: "40", targetTemperatureC: "780" },
              { segmentKey: "hold", label: "保温", durationMin: "20", targetTemperatureC: "780" },
              { segmentKey: "cool", label: "降温", durationMin: "60", targetTemperatureC: "30" },
            ],
          },
        },
        isCustom: false,
      },
      [
        { zoneKey: "zone_1", note: "keep note", temperatureProgram: [] },
        { zoneKey: "zone_2", note: "", temperatureProgram: [] },
      ],
    );

    expect(zones).toEqual([
      {
        zoneKey: "zone_1",
        note: "keep note",
        temperatureProgram: [
          { timeMin: "0", temperatureC: "25", note: "起始" },
          { timeMin: "35", temperatureC: "760", note: "升温结束" },
          { timeMin: "50", temperatureC: "760", note: "恒温结束" },
          { timeMin: "100", temperatureC: "25", note: "降温结束" },
        ],
      },
      {
        zoneKey: "zone_2",
        note: "",
        temperatureProgram: [
          { timeMin: "0", temperatureC: "30", note: "起始" },
          { timeMin: "40", temperatureC: "780", note: "升温结束" },
          { timeMin: "60", temperatureC: "780", note: "恒温结束" },
          { timeMin: "120", temperatureC: "30", note: "降温结束" },
        ],
      },
    ]);
  });

  it("keeps blank quick furnace intervals so validation can reject incomplete entries", () => {
    const zones = buildFurnaceZonesFromQuickProgram(["zone_1"], {
      zones: {
        zone_1: {
          startTemperatureC: "25",
          segments: [
            { segmentKey: "ramp", label: "升温", durationMin: "30", targetTemperatureC: "700" },
            { segmentKey: "hold", label: "保温", durationMin: "", targetTemperatureC: "700" },
            { segmentKey: "cool", label: "降温", durationMin: "", targetTemperatureC: "" },
          ],
        },
      },
      isCustom: false,
    });

    expect(zones[0].temperatureProgram).toEqual([
      { timeMin: "0", temperatureC: "25", note: "起始" },
      { timeMin: "30", temperatureC: "700", note: "升温结束" },
      { timeMin: "", temperatureC: "700", note: "恒温结束" },
      { timeMin: "", temperatureC: "", note: "降温结束" },
    ]);
  });

  it("keeps default quick fill segments for zones that only have a start node", () => {
    const quickProgram = createQuickProgramFromZones(
      [
        {
          zoneKey: "zone_1",
          note: "",
          temperatureProgram: [{ timeMin: "0", temperatureC: "30", note: "起始" }],
        },
      ],
      ["zone_1", "zone_2"],
    );

    expect(quickProgram.zones.zone_1).toEqual({
      startTemperatureC: "30",
      segments: [
        { segmentKey: "ramp", label: "升温", durationMin: "30", targetTemperatureC: "" },
        { segmentKey: "hold", label: "保温", durationMin: "15", targetTemperatureC: "" },
        { segmentKey: "cool", label: "降温", durationMin: "50", targetTemperatureC: "25" },
      ],
    });
    expect(quickProgram.zones.zone_2.segments).toHaveLength(3);
    expect(quickProgram.isCustom).toBe(true);
  });

  it("initializes blank furnace quick fill with default per-zone segments", () => {
    const values = createInitialEditorValues(experiment, []);

    expect(values.furnaceProgram.furnaceInfo.zonesCount).toBe("2");
    expect(values.furnaceProgram.quickProgram?.zones.zone_1.segments).toEqual([
      { segmentKey: "ramp", label: "升温", durationMin: "30", targetTemperatureC: "" },
      { segmentKey: "hold", label: "保温", durationMin: "15", targetTemperatureC: "" },
      { segmentKey: "cool", label: "降温", durationMin: "50", targetTemperatureC: "25" },
    ]);
    expect(values.furnaceProgram.quickProgram?.zones.zone_2.segments).toHaveLength(3);
  });

  it("keeps explicit non-positive durations in generated nodes so validation can reject them", () => {
    const zones = buildFurnaceZonesFromQuickProgram(["zone_1"], {
      zones: {
        zone_1: {
          startTemperatureC: "25",
          segments: [
            { segmentKey: "ramp", label: "升温", durationMin: "-5", targetTemperatureC: "700" },
            { segmentKey: "hold", label: "保温", durationMin: "0", targetTemperatureC: "700" },
            { segmentKey: "cool", label: "降温", durationMin: "", targetTemperatureC: "25" },
          ],
        },
      },
      isCustom: false,
    });

    expect(zones[0].temperatureProgram).toEqual([
      { timeMin: "0", temperatureC: "25", note: "起始" },
      { timeMin: "-5", temperatureC: "700", note: "升温结束" },
      { timeMin: "-5", temperatureC: "700", note: "恒温结束" },
      { timeMin: "", temperatureC: "25", note: "降温结束" },
    ]);
  });

  it("syncs furnace zones and placements when zones count changes", () => {
    const value = {
      furnaceInfo: {
        zonesCount: "2",
        model: "",
        initialTemperaturesC: { zone_1: "25", zone_2: "25" },
      },
      quickProgram: createQuickProgramFromZones(
        [
          {
            zoneKey: "zone_1",
            note: "",
            temperatureProgram: [
              { timeMin: "0", temperatureC: "25", note: "起始" },
              { timeMin: "30", temperatureC: "650", note: "升温结束" },
            ],
          },
          {
            zoneKey: "zone_2",
            note: "",
            temperatureProgram: [
              { timeMin: "0", temperatureC: "25", note: "起始" },
              { timeMin: "30", temperatureC: "780", note: "升温结束" },
            ],
          },
        ],
        ["zone_1", "zone_2"],
      ),
      placements: [
        { precursorIndex: "0", zoneKey: "zone_2", positionCm: "-15", note: "" },
      ],
      zones: [
        {
          zoneKey: "zone_1",
          note: "",
          temperatureProgram: [
            { timeMin: "0", temperatureC: "25", note: "起始" },
            { timeMin: "30", temperatureC: "650", note: "升温结束" },
          ],
        },
        {
          zoneKey: "zone_2",
          note: "",
          temperatureProgram: [
            { timeMin: "0", temperatureC: "25", note: "起始" },
            { timeMin: "30", temperatureC: "780", note: "升温结束" },
          ],
        },
      ],
    };

    const next = syncFurnaceProgramZonesCount(value, "1");

    expect(next.furnaceInfo.initialTemperaturesC).toEqual({ zone_1: "25" });
    expect(next.quickProgram?.zones).toEqual({
      zone_1: {
        startTemperatureC: "25",
        segments: [{ segmentKey: "ramp", label: "升温", durationMin: "30", targetTemperatureC: "650" }],
      },
    });
    expect(next.placements[0].zoneKey).toBe("");
    expect(next.zones).toHaveLength(1);
  });

  it("serializes canonical furnace zones without legacy steps", () => {
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
      zones: [
        {
          zoneKey: "zone_1",
          note: "upstream zone",
          temperatureProgram: [
            { timeMin: "0", temperatureC: "25", note: "起始" },
            { timeMin: "30", temperatureC: "750", note: "升温结束" },
          ],
        },
        {
          zoneKey: "zone_2",
          note: "",
          temperatureProgram: [
            { timeMin: "0", temperatureC: "25", note: "" },
            { timeMin: "30", temperatureC: "200", note: "" },
          ],
        },
      ],
    });

    expect(payload).toMatchObject({
      furnace_info: {
        zones_count: 2,
        model: "OTF-1200X",
        initial_temperatures_C: { zone_1: 25, zone_2: 25 },
      },
      placements: [
        {
          precursor_index: 0,
          zone_key: "zone_1",
          position_cm: -15,
          note: "upstream",
        },
      ],
      zones: [
        {
          zone_key: "zone_1",
          note: "upstream zone",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25, note: "起始" },
            { node_index: 2, time_min: 30, temperature_C: 750, note: "升温结束" },
          ],
        },
        {
          zone_key: "zone_2",
          temperature_program: [
            { node_index: 1, time_min: 0, temperature_C: 25 },
            { node_index: 2, time_min: 30, temperature_C: 200 },
          ],
        },
      ],
    });
    expect(payload).not.toHaveProperty("precursors");
    expect(payload).not.toHaveProperty("steps");
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
        furnace_info: { zones_count: 2, initial_temperatures_C: { zone_1: 25, zone_2: 25 } },
        precursors: [{ material: "S", position_cm: -25, mass_mg: 200, note: "legacy sulfur" }],
        steps: [
          {
            step_index: 1,
            step_name: "升温",
            duration_min: 30,
            is_hold: false,
            temperatures_C: { zone_1: 650, zone_2: 780 },
            note: "legacy ramp",
          },
        ],
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
    expect(values.furnaceProgram.zones[0]).toEqual({
      zoneKey: "zone_1",
      note: "",
      temperatureProgram: [
        { timeMin: "0", temperatureC: "25", note: "" },
        { timeMin: "30", temperatureC: "650", note: "legacy ramp" },
      ],
    });
    expect(values.furnaceProgram.zones[1].temperatureProgram[1]).toMatchObject({
      timeMin: "30",
      temperatureC: "780",
    });
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
      zones: [
        {
          zoneKey: "zone_1",
          note: "",
          temperatureProgram: [
            { timeMin: "0", temperatureC: "25", note: "" },
            { timeMin: "30", temperatureC: "750", note: "" },
          ],
        },
      ],
    });

    expect(payload.placements[0]).toEqual({
      precursor_index: 1,
      zone_key: "zone_1",
      position_cm: -25,
      note: "migrated",
    });
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
