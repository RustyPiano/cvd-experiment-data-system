import { describe, expect, it } from "vitest";

import {
  buildExperimentModuleDiffs,
  getDiffStatusLabel,
  getFieldLabel,
} from "./diff-utils";

describe("diff-utils", () => {
  it("recursively compares module payloads and ignores null versus undefined", () => {
    const modules = buildExperimentModuleDiffs({
      sourceModules: {
        environment: {
          indoor_temperature_C: 24,
          indoor_humidity_percent: null,
          nested: {
            unchanged: "same",
            removed: "old",
          },
          items: [{ name: "source" }],
        },
      },
      currentModules: {
        environment: {
          indoor_temperature_C: 26,
          nested: {
            unchanged: "same",
            added: "new",
          },
          items: [{ name: "current" }, { name: "extra" }],
        },
      },
    });

    const environment = modules.find((module) => module.moduleKey === "environment");

    expect(environment?.status).toBe("modified");
    expect(environment?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "indoor_temperature_C",
          status: "modified",
          sourceValue: 24,
          currentValue: 26,
        }),
        expect.objectContaining({
          path: "nested.removed",
          status: "removed",
          sourceValue: "old",
        }),
        expect.objectContaining({
          path: "nested.added",
          status: "added",
          currentValue: "new",
        }),
        expect.objectContaining({
          path: "items[0].name",
          status: "modified",
          sourceValue: "source",
          currentValue: "current",
        }),
        expect.objectContaining({
          path: "items[1].name",
          status: "added",
          currentValue: "extra",
        }),
      ]),
    );
    expect(environment?.rows.some((row) => row.path === "indoor_humidity_percent")).toBe(false);
    expect(environment?.rows.some((row) => row.path === "nested.unchanged")).toBe(true);
  });

  it("classifies added, removed, and same modules by module key", () => {
    const modules = buildExperimentModuleDiffs({
      sourceModules: {
        precheck: { seal_intact: true },
        gas_program: { pre_washing_gas: "Ar" },
      },
      currentModules: {
        gas_program: { pre_washing_gas: "Ar" },
        result_summary: { quality_label: "unknown" },
      },
    });

    expect(modules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ moduleKey: "precheck", status: "removed" }),
        expect.objectContaining({ moduleKey: "gas_program", status: "same" }),
        expect.objectContaining({ moduleKey: "result_summary", status: "added" }),
      ]),
    );
  });

  it("returns readable Chinese labels for common fields and statuses", () => {
    expect(getFieldLabel("indoor_temperature_C")).toBe("室内温度 (C)");
    expect(getFieldLabel("items[0].species")).toBe("前驱体 1 / 种类");
    expect(getDiffStatusLabel("modified")).toBe("已修改");
  });
});
