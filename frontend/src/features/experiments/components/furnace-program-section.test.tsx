import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES } from "../data/builtin-templates";
import type { FurnaceProgramValues } from "../editor-types";
import { FurnaceProgramSection } from "./furnace-program-section";

afterEach(() => {
  cleanup();
});

function createValue(): FurnaceProgramValues {
  return {
    furnaceInfo: {
      zonesCount: "2",
      model: "OTF-1200X",
      initialTemperaturesC: { zone_1: "25", zone_2: "25" },
    },
    precursors: [
      {
        material: "MoO3",
        positionCm: "-15",
        massMg: "15",
        note: "upstream",
      },
    ],
    steps: [
      {
        stepName: "升温",
        durationMin: "35",
        isHold: false,
        temperaturesC: { zone_1: "650", zone_2: "780" },
        note: "",
      },
    ],
  };
}

describe("FurnaceProgramSection", () => {
  it("renders furnace info, precursors, and steps sections", () => {
    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={vi.fn()}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    expect(screen.getByText("炉子信息")).toBeInTheDocument();
    expect(screen.getByLabelText("温区数量")).toHaveValue("2");
    expect(screen.getByLabelText("材料 1")).toHaveValue("MoO3");
    expect(screen.getByText("步骤 1")).toBeInTheDocument();
    expect(screen.getByLabelText("温度 1-2")).toHaveValue("780");
  });

  it("applies a built-in furnace template and clears the applied alert on manual edit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <FurnaceProgramSection
        disabled={false}
        materialSystem="MoS2"
        onChange={onChange}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));
    await user.click(await screen.findByRole("menuitem", { name: "MoS2 标准两区" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        furnaceInfo: expect.objectContaining({
          zonesCount: "2",
          initialTemperaturesC: { zone_1: "25", zone_2: "25" },
        }),
        steps: expect.arrayContaining([
          expect.objectContaining({
            durationMin: "35",
            temperaturesC: { zone_1: "650", zone_2: "780" },
          }),
        ]),
      }),
    );

    const appliedValue = onChange.mock.calls[0][0];
    expect(screen.getByText("已应用模板：MoS2 标准两区，请确认或修改。")).toBeInTheDocument();

    rerender(
      <FurnaceProgramSection
        disabled={false}
        materialSystem="MoS2"
        onChange={onChange}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={appliedValue}
      />,
    );

    fireEvent.change(screen.getByLabelText("炉子型号"), { target: { value: "Tube B" } });

    expect(
      screen.queryByText("已应用模板：MoS2 标准两区，请确认或修改。"),
    ).not.toBeInTheDocument();
  });

  it("updates zone temperatures when zonesCount changes", () => {
    const onChange = vi.fn();

    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={onChange}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    fireEvent.change(screen.getByLabelText("温区数量"), { target: { value: "3" } });

    expect(onChange).toHaveBeenCalledWith({
      furnaceInfo: {
        zonesCount: "3",
        model: "OTF-1200X",
        initialTemperaturesC: { zone_1: "25", zone_2: "25", zone_3: "25" },
      },
      precursors: createValue().precursors,
      steps: [
        {
          stepName: "升温",
          durationMin: "35",
          isHold: false,
          temperaturesC: { zone_1: "650", zone_2: "780", zone_3: "" },
          note: "",
        },
      ],
    });
  });

  it("shows matching recipe templates and applies their furnace payload", async () => {
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
              initial_temperatures_C: { zone_1: 30 },
            },
            precursors: [],
            steps: [
              {
                step_index: 1,
                step_name: "Recipe hold",
                duration_min: 20,
                is_hold: true,
                temperatures_C: { zone_1: 700 },
                note: "recipe step",
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
            precursors: [],
            steps: [],
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
        recipeTemplates={recipeTemplates}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={createValue()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));

    expect(await screen.findByRole("menuitem", { name: "MoS2 Recipe Furnace" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "WS2 Recipe Furnace" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "MoS2 Recipe Furnace" }));

    expect(onChange).toHaveBeenCalledWith({
      furnaceInfo: {
        zonesCount: "1",
        model: "Recipe tube",
        initialTemperaturesC: { zone_1: "30" },
      },
      precursors: [],
      steps: [
        {
          sourcePayload: expect.objectContaining({ step_name: "Recipe hold" }),
          stepName: "Recipe hold",
          durationMin: "20",
          isHold: true,
          temperaturesC: { zone_1: "700" },
          note: "recipe step",
        },
      ],
    });
  });
});
