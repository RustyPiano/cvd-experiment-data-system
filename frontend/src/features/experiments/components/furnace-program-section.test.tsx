import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILTIN_FURNACE_TEMPLATES } from "../data/builtin-templates";
import { FurnaceProgramSection } from "./furnace-program-section";

afterEach(() => {
  cleanup();
});

describe("FurnaceProgramSection", () => {
  it("keeps the precursor placement switch in a compact row", () => {
    render(
      <FurnaceProgramSection
        disabled={false}
        onChange={vi.fn()}
        value={{
          zones: [
            {
              note: "",
              precursorPlaced: false,
              temperatureProgram: [{ temperatureC: "", timeMin: "" }],
              zoneIndex: "",
            },
          ],
        }}
      />,
    );

    expect(screen.getByLabelText("放置前驱体 1").closest(".editor-switch-row")).not.toBeNull();
  });

  it("applies a built-in furnace template and clears the applied alert on manual edit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <FurnaceProgramSection
        disabled={false}
        onChange={onChange}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={{ zones: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));
    await user.click(await screen.findByRole("menuitem", { name: "MoS2 标准两区" }));

    expect(onChange).toHaveBeenCalledWith({
      zones: [
        {
          note: "MoO3 前驱体温区",
          precursorPlaced: true,
          sourcePayload: expect.objectContaining({ zone_index: 1 }),
          temperatureProgram: [
            expect.objectContaining({ temperatureC: "25", timeMin: "0" }),
            expect.objectContaining({ temperatureC: "650", timeMin: "35" }),
            expect.objectContaining({ temperatureC: "650", timeMin: "50" }),
            expect.objectContaining({ temperatureC: "25", timeMin: "85" }),
          ],
          zoneIndex: "1",
        },
        {
          note: "生长基底温区",
          precursorPlaced: false,
          sourcePayload: expect.objectContaining({ zone_index: 2 }),
          temperatureProgram: [
            expect.objectContaining({ temperatureC: "25", timeMin: "0" }),
            expect.objectContaining({ temperatureC: "780", timeMin: "35" }),
            expect.objectContaining({ temperatureC: "780", timeMin: "50" }),
            expect.objectContaining({ temperatureC: "25", timeMin: "85" }),
          ],
          zoneIndex: "2",
        },
      ],
    });

    const appliedValue = onChange.mock.calls[0][0];
    expect(screen.getByText("已应用模板：MoS2 标准两区，请确认或修改。")).toBeInTheDocument();

    rerender(
      <FurnaceProgramSection
        disabled={false}
        onChange={onChange}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={appliedValue}
      />,
    );

    await user.clear(screen.getByLabelText("温区备注 1"));
    await user.type(screen.getByLabelText("温区备注 1"), "调整后温区");

    expect(screen.queryByText("已应用模板：MoS2 标准两区，请确认或修改。")).not.toBeInTheDocument();
  });

  it("shows matching recipe templates and applies their furnace payload", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FurnaceProgramSection
        disabled={false}
        materialSystem="MoS2"
        onChange={onChange}
        recipeTemplates={[
          {
            created_at: "2026-04-28T00:00:00Z",
            created_by: "user-1",
            default_payload_json: {
              furnace_program: {
                zones: [
                  {
                    note: "Recipe zone",
                    precursor_placed: true,
                    temperature_program: [{ temperature_C: 710, time_min: 42 }],
                    zone_index: 1,
                  },
                ],
              },
            },
            description: null,
            id: "recipe-1",
            is_active: true,
            material_system: "MoS2",
            name: "MoS2 saved furnace",
            project_id: null,
            template_version_id: null,
            updated_at: "2026-04-28T00:00:00Z",
          },
          {
            created_at: "2026-04-28T00:00:00Z",
            created_by: "user-1",
            default_payload_json: {
              gas_program: {
                segments: [],
              },
            },
            description: null,
            id: "recipe-2",
            is_active: true,
            material_system: "MoS2",
            name: "Gas only recipe",
            project_id: null,
            template_version_id: null,
            updated_at: "2026-04-28T00:00:00Z",
          },
        ]}
        templates={BUILTIN_FURNACE_TEMPLATES}
        value={{ zones: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByText("用户 Recipe 模板")).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "MoS2 saved furnace" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Gas only recipe" })).not.toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "MoS2 saved furnace" }));

    expect(onChange).toHaveBeenCalledWith({
      zones: [
        {
          note: "Recipe zone",
          precursorPlaced: true,
          sourcePayload: expect.objectContaining({ zone_index: 1 }),
          temperatureProgram: [
            expect.objectContaining({ temperatureC: "710", timeMin: "42" }),
          ],
          zoneIndex: "1",
        },
      ],
    });
  });
});
