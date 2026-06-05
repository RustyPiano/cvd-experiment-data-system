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

  it("requires setup methods fields, diagram, reference/unpublished, and template compliance", () => {
    // 1. Partial: missing setup_key, reference/unpublished (completed: payload, setup_name, diagram, methods_text, deviation because no source => 5/7 = 71%)
    expect(
      computeModuleCompletion("setup_methods", {
        setup_name_snapshot: "Manual setup",
        methods_text_snapshot: "Methods",
        diagram_file_asset_id: "file-1",
      }),
    ).toEqual({ state: "partial", percent: 71 });

    // 2. Complete: has setup_key, setup_name, diagram, methods, reference (no source => deviation check passes)
    expect(
      computeModuleCompletion("setup_methods", {
        setup_key_snapshot: "setup-1",
        setup_name_snapshot: "Manual setup",
        diagram_file_asset_id: "file-1",
        methods_text_snapshot: "Methods",
        reference_paper_url_snapshot: "https://example.com/paper",
      }),
    ).toEqual({ state: "complete", percent: 100 });

    // 3. Complete: has setup_key, setup_name, diagram, methods, unpublished reason instead of reference (no source => deviation check passes)
    expect(
      computeModuleCompletion("setup_methods", {
        setup_key_snapshot: "setup-1",
        setup_name_snapshot: "Manual setup",
        diagram_file_asset_id: "file-1",
        methods_text_snapshot: "Methods",
        unpublished_reason_snapshot: "In-house custom build",
      }),
    ).toEqual({ state: "complete", percent: 100 });

    // 4. Partial: has source but is_same_as_template is false and deviation_note is empty (completed: 6/7 = 86%)
    expect(
      computeModuleCompletion("setup_methods", {
        setup_key_snapshot: "setup-1",
        setup_name_snapshot: "Manual setup",
        diagram_file_asset_id: "file-1",
        methods_text_snapshot: "Methods",
        reference_paper_url_snapshot: "https://example.com/paper",
        source_setup_library_id: "source-1",
        is_same_as_template: false,
        deviation_note: "",
      }),
    ).toEqual({ state: "partial", percent: 86 });

    // 5. Complete: has source, is_same_as_template is false, but has deviation_note (completed: 7/7 = 100%)
    expect(
      computeModuleCompletion("setup_methods", {
        setup_key_snapshot: "setup-1",
        setup_name_snapshot: "Manual setup",
        diagram_file_asset_id: "file-1",
        methods_text_snapshot: "Methods",
        reference_paper_url_snapshot: "https://example.com/paper",
        source_setup_library_id: "source-1",
        is_same_as_template: false,
        deviation_note: "Slight modification to gas lines",
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
