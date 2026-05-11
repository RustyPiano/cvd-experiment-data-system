import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeSectionEditor } from "./recipe-section-editor";

describe("RecipeSectionEditor substrates", () => {
  afterEach(() => {
    cleanup();
  });

  it("drops hidden non-top-bottom substrate rows when editing fixed substrates", () => {
    const onChange = vi.fn();

    render(
      <RecipeSectionEditor
        moduleKey="substrates"
        onChange={onChange}
        value={{
          items: [
            {
              role: "control",
              type: "Legacy hidden substrate",
              brand: "Legacy brand",
              size_mm: "legacy",
              treatment_method: "",
              position_mm: null,
            },
          ],
        }}
        vocabularyOptions={{
          substrate_type: [{ label: "硅片单抛N<100>", value: "硅片单抛N<100>" }],
          substrate_brand: [],
          substrate_size: [],
          substrate_treatment_method: [],
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("上基底 类型"), {
      target: { value: "硅片单抛N<100>" },
    });

    expect(onChange).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          role: "top",
          type: "硅片单抛N<100>",
        }),
      ],
    });
  });
});
