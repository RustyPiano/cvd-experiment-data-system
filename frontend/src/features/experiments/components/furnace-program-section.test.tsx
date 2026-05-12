import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES } from "../data/builtin-templates";
import type { FurnaceProgramValues, PrecursorItemValues } from "../editor-types";
import { FurnaceProgramSection } from "./furnace-program-section";

afterEach(() => {
  cleanup();
});

function createValue(): FurnaceProgramValues {
  return {
    furnaceInfo: {
      zonesCount: "2",
      model: "OTF-1200X",
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
        startTemperatureC: "25",
        note: "",
        segments: [
          { label: "升温", durationMin: "35", targetTemperatureC: "650", note: "升温结束" },
          { label: "保温", durationMin: "15", targetTemperatureC: "650", note: "恒温结束" },
          { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
        ],
      },
      {
        zoneKey: "zone_2",
        startTemperatureC: "25",
        note: "",
        segments: [
          { label: "升温", durationMin: "35", targetTemperatureC: "780", note: "升温结束" },
          { label: "保温", durationMin: "15", targetTemperatureC: "780", note: "恒温结束" },
          { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
        ],
      },
    ],
  };
}

const precursorItems: PrecursorItemValues[] = [
  {
    species: "MoO3",
    brand: "Sigma",
    concentration: "",
    concentrationUnit: "",
    method: "powder",
    meltingTemperatureC: "",
    spinSpeedRpm: "",
    preSpinSpeedRpm: "",
    preparationTimeMin: "",
    massMg: "15",
    batchNo: "",
  },
  {
    species: "S",
    brand: "",
    concentration: "",
    concentrationUnit: "",
    method: "powder",
    meltingTemperatureC: "",
    spinSpeedRpm: "",
    preSpinSpeedRpm: "",
    preparationTimeMin: "",
    massMg: "200",
    batchNo: "",
  },
];

describe("FurnaceProgramSection", () => {
  it("renders zone cards with segment fields", () => {
    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={vi.fn()}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    // Zone titles appear in Card headers (and possibly elsewhere), so use getAllByText
    expect(screen.getAllByText("温区 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("温区 2").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("温区 1 起始温度")).toHaveValue("25");
    expect(screen.getByLabelText("温区 1 区间1 时长")).toHaveValue("35");
    expect(screen.getByLabelText("温区 1 区间1 目标温度")).toHaveValue("650");
    expect(screen.getByLabelText("温区 2 起始温度")).toHaveValue("25");
    expect(screen.getByLabelText("温区 2 区间1 时长")).toHaveValue("35");
    expect(screen.getByLabelText("温区 2 区间1 目标温度")).toHaveValue("780");
  });

  it("does NOT render legacy quick-fill card or advanced node editor", () => {
    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={vi.fn()}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    expect(screen.queryByText("炉温快填")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "高级节点编辑" })).not.toBeInTheDocument();
  });

  it("updates a segment target temperature and passes updated zone to onChange", () => {
    const onChange = vi.fn();

    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={onChange}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    fireEvent.change(screen.getByLabelText("温区 1 区间1 目标温度"), { target: { value: "760" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: expect.arrayContaining([
          expect.objectContaining({
            zoneKey: "zone_1",
            segments: expect.arrayContaining([
              expect.objectContaining({
                label: "升温",
                targetTemperatureC: "760",
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("renders furnace info, precursor placements section", () => {
    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={vi.fn()}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    expect(screen.getByText("炉子信息")).toBeInTheDocument();
    expect(screen.getByLabelText("温区数量")).toHaveValue("2");
    expect(screen.getByText("前驱体放置")).toBeInTheDocument();
    expect(screen.getByText("MoO3")).toBeInTheDocument();
    expect(screen.getByText("zone_1")).toBeInTheDocument();
  });

  it("applies a built-in furnace template via payloadToFurnaceProgramValues and clears alert on manual edit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <FurnaceProgramSection
        disabled={false}
        materialSystem="MoS2"
        onChange={onChange}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));
    await user.click(await screen.findByRole("menuitem", { name: "MoS2 标准两区" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        furnaceInfo: expect.objectContaining({ zonesCount: "2" }),
        zones: expect.arrayContaining([
          expect.objectContaining({
            zoneKey: "zone_1",
            startTemperatureC: "25",
            segments: [
              { label: "升温", durationMin: "35", targetTemperatureC: "650", note: "升温结束" },
              { label: "保温", durationMin: "15", targetTemperatureC: "650", note: "恒温结束" },
              { label: "降温", durationMin: "50", targetTemperatureC: "25", note: "降温结束" },
            ],
          }),
          expect.objectContaining({
            zoneKey: "zone_2",
            segments: expect.arrayContaining([
              expect.objectContaining({ targetTemperatureC: "780" }),
            ]),
          }),
        ]),
      }),
    );

    const appliedValue = onChange.mock.calls[0][0] as FurnaceProgramValues;
    expect(screen.getByText("已应用模板：MoS2 标准两区，请确认或修改。")).toBeInTheDocument();

    rerender(
      <FurnaceProgramSection
        disabled={false}
        materialSystem="MoS2"
        onChange={onChange}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={appliedValue}
      />,
    );

    fireEvent.change(screen.getByLabelText("炉子型号"), { target: { value: "Tube B" } });

    expect(
      screen.queryByText("已应用模板：MoS2 标准两区，请确认或修改。"),
    ).not.toBeInTheDocument();
  });

  it("updates zones and clears removed placement zone when zonesCount changes to 1", () => {
    const onChange = vi.fn();
    const value = createValue();
    value.placements[0].zoneKey = "zone_2";

    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={onChange}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={value}
      />,
    );

    fireEvent.change(screen.getByLabelText("温区数量"), { target: { value: "1" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        furnaceInfo: expect.objectContaining({ zonesCount: "1" }),
        zones: [
          expect.objectContaining({
            zoneKey: "zone_1",
          }),
        ],
        placements: [
          expect.objectContaining({
            zoneKey: "",
          }),
        ],
      }),
    );
  });

  it("adds a new segment to a zone when 添加区间 is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const emptyZoneValue: FurnaceProgramValues = {
      furnaceInfo: { zonesCount: "1", model: "" },
      placements: [],
      zones: [{ zoneKey: "zone_1", startTemperatureC: "25", note: "", segments: [] }],
    };

    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={onChange}
        precursorItems={precursorItems}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={emptyZoneValue}
      />,
    );

    await user.click(screen.getByRole("button", { name: "添加区间" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        zones: [
          expect.objectContaining({
            zoneKey: "zone_1",
            segments: [
              expect.objectContaining({
                label: "区间 1",
                durationMin: "",
                targetTemperatureC: "",
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("shows matching recipe templates and applies their canonical furnace payload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const recipeTemplates: RecipeRead[] = [
      {
        id: "recipe-1",
        name: "MoS2 Recipe Furnace",
        template_version_id: null,
        project_id: null,
        material_system: "MoS2",
        default_payload_json: {
          furnace_program: {
            furnace_info: {
              zones_count: 1,
              model: "Recipe tube",
            },
            placements: [
              {
                precursor_index: 1,
                zone_key: "zone_1",
                position_cm: -25,
                note: "recipe placement",
              },
            ],
            zones: [
              {
                zone_key: "zone_1",
                temperature_program: [
                  { node_index: 1, time_min: 0, temperature_C: 30, note: "" },
                  { node_index: 2, time_min: 20, temperature_C: 700, note: "recipe step" },
                ],
                note: "recipe zone",
              },
            ],
          },
        },
        description: null,
        created_by: "u-1",
        is_active: true,
        created_at: "2026-04-24T00:00:00Z",
        updated_at: "2026-04-24T00:00:00Z",
      },
      {
        id: "recipe-2",
        name: "WS2 Recipe Furnace",
        template_version_id: null,
        project_id: null,
        material_system: "WS2",
        default_payload_json: {
          furnace_program: {
            furnace_info: { zones_count: 1 },
            zones: [],
          },
        },
        description: null,
        created_by: "u-1",
        is_active: true,
        created_at: "2026-04-24T00:00:00Z",
        updated_at: "2026-04-24T00:00:00Z",
      },
    ];

    render(
      <FurnaceProgramSection
        disabled={false}
        materialSystem="MoS2"
        onChange={onChange}
        precursorItems={precursorItems}
        recipeTemplates={recipeTemplates}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));

    expect(await screen.findByRole("menuitem", { name: "MoS2 Recipe Furnace" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "WS2 Recipe Furnace" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "MoS2 Recipe Furnace" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        furnaceInfo: { zonesCount: "1", model: "Recipe tube" },
        placements: [
          {
            precursorIndex: "1",
            zoneKey: "zone_1",
            positionCm: "-25",
            note: "recipe placement",
          },
        ],
        zones: [
          expect.objectContaining({
            zoneKey: "zone_1",
            startTemperatureC: "30",
            note: "recipe zone",
            segments: [
              expect.objectContaining({
                durationMin: "20",
                targetTemperatureC: "700",
                note: "recipe step",
              }),
            ],
          }),
        ],
      }),
    );
  });
});
