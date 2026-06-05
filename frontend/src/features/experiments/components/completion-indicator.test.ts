import { describe, expect, it } from "vitest";

import type { ExperimentValidationIssue } from "../../../shared/types/api";
import { computeModuleCompletion } from "./completion-indicator";

describe("computeModuleCompletion", () => {
  it("computes two-field modules in 50 percent increments", () => {
    expect(
      computeModuleCompletion("basic_info", {
        experiment_date: "2026-04-28",
        material_system: "",
      }),
    ).toEqual({ state: "partial", percent: 50 });

    expect(
      computeModuleCompletion("environment", {
        indoorTemperatureC: "24",
        indoor_humidity_percent: 45,
      }),
    ).toEqual({ state: "complete", percent: 100 });
  });

  it("computes collection modules from row presence and required fields", () => {
    expect(
      computeModuleCompletion("precursors", {
        items: [{ species: "MoO3", method: "" }],
      }),
    ).toEqual({ state: "partial", percent: 50 });

    expect(
      computeModuleCompletion("furnace_program", {
        furnace_info: { zones_count: 1 },
        precursors: [],
        zones: [
          {
            zone_key: "zone_1",
            temperature_program: [
              { time_min: 0, temperature_C: 25 },
              { time_min: 10, temperature_C: 720 },
            ],
          },
        ],
      }),
    ).toEqual({ state: "complete", percent: 100 });
  });

  it("requires setup methods fields, diagram, and confirmation", () => {
    expect(
      computeModuleCompletion("setup_methods", {
        setup_name_snapshot: "Manual setup",
        apparatus_description_snapshot: "Tube furnace",
        methods_text_snapshot: "Methods",
        sample_placement_description_snapshot: "Downstream",
        reaction_flow_description_snapshot: "Purge ramp hold",
        diagram_file_asset_id: "file-1",
        confirmed_at: null,
      }),
    ).toEqual({ state: "partial", percent: 86 });

    expect(
      computeModuleCompletion("setup_methods", {
        setup_name_snapshot: "Manual setup",
        apparatus_description_snapshot: "Tube furnace",
        methods_text_snapshot: "Methods",
        sample_placement_description_snapshot: "Downstream",
        reaction_flow_description_snapshot: "Purge ramp hold",
        diagram_file_asset_id: "file-1",
        confirmed_at: "2026-06-05T00:00:00Z",
        confirmed_by_id: null,
      }),
    ).toEqual({ state: "partial", percent: 86 });

    expect(
      computeModuleCompletion("setup_methods", {
        setup_name_snapshot: "Manual setup",
        apparatus_description_snapshot: "Tube furnace",
        methods_text_snapshot: "Methods",
        sample_placement_description_snapshot: "Downstream",
        reaction_flow_description_snapshot: "Purge ramp hold",
        diagram_file_asset_id: "file-1",
        confirmed_at: "2026-06-05T00:00:00Z",
        confirmed_by_id: "user-1",
      }),
    ).toEqual({ state: "complete", percent: 100 });
  });

  it("keeps collection modules partial when any included row is incomplete", () => {
    expect(
      computeModuleCompletion("precursors", {
        items: [
          { species: "MoO3", method: "spin_coating" },
          { species: "S", method: "" },
        ],
      }),
    ).toEqual({ state: "partial", percent: 50 });

    expect(
      computeModuleCompletion("substrates", {
        items: [
          { type: "SiO2/Si", role: "top" },
          { type: "sapphire", role: "" },
        ],
      }),
    ).toEqual({ state: "partial", percent: 50 });

    expect(
      computeModuleCompletion("gas_program", {
        segments: [{ flow_sccm: 30 }, { flow_sccm: 0 }],
      }),
    ).toEqual({ state: "partial", percent: 50 });
  });

  it("marks collection modules complete only when every included row is valid", () => {
    expect(
      computeModuleCompletion("precursors", {
        items: [
          { species: "MoO3", method: "spin_coating" },
          { species: "S", method: "evaporation" },
        ],
      }),
    ).toEqual({ state: "complete", percent: 100 });

    expect(
      computeModuleCompletion("substrates", {
        items: [
          { type: "SiO2/Si", role: "top" },
          { type: "sapphire", role: "bottom" },
        ],
      }),
    ).toEqual({ state: "complete", percent: 100 });

    expect(
      computeModuleCompletion("gas_program", {
        segments: [{ flow_sccm: 30 }, { flow_sccm: "15" }],
      }),
    ).toEqual({ state: "complete", percent: 100 });
  });

  it("requires every furnace zone to have at least two temperature points", () => {
    expect(
      computeModuleCompletion("furnace_program", {
        furnace_info: { zones_count: 2 },
        precursors: [],
        zones: [
          {
            zone_key: "zone_1",
            temperature_program: [
              { time_min: 0, temperature_C: 25 },
              { time_min: 10, temperature_C: 720 },
            ],
          },
          {
            zone_key: "zone_2",
            temperature_program: [{ time_min: 0, temperature_C: 25 }],
          },
        ],
      }),
    ).toEqual({ state: "partial", percent: 50 });
  });

  it("requires gas segment flow to be greater than zero", () => {
    expect(
      computeModuleCompletion("gas_program", {
        segments: [{ flow_sccm: 0 }],
      }),
    ).toEqual({ state: "partial", percent: 50 });

    expect(
      computeModuleCompletion("gas_program", {
        segments: [{ flow_sccm: -5 }],
      }),
    ).toEqual({ state: "partial", percent: 50 });

    expect(
      computeModuleCompletion("gas_program", {
        segments: [{ flow_sccm: "30" }],
      }),
    ).toEqual({ state: "complete", percent: 100 });
  });

  it("overrides completion with warning or error validation state", () => {
    const issue: ExperimentValidationIssue = {
      module_key: "gas_program",
      field_path: "segments.0.flow_sccm",
      message: "流量缺失",
    };

    expect(
      computeModuleCompletion(
        "gas_program",
        { segments: [{ flow_sccm: 30 }] },
        [{ ...issue, severity: "warning" }],
      ),
    ).toEqual({ state: "warning", percent: 100, warnings: 1 });

    expect(
      computeModuleCompletion(
        "gas_program",
        { segments: [{ flow_sccm: 30 }] },
        [{ ...issue, severity: "error" }],
      ),
    ).toEqual({ state: "error", percent: 100, errors: 1 });
  });
});
