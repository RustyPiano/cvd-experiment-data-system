import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BasicInfoValues, VocabularySelectOption } from "../editor-types";
import { ExperimentMainFields } from "./experiment-main-fields";

const materialSystemOptions: VocabularySelectOption[] = [
  { label: "MoS2", value: "MoS2" },
  { label: "WS2", value: "WS2" },
];

function createValue(): BasicInfoValues {
  return {
    experimentType: "cvd_2zone",
    materialSystem: "MoS2",
    experimentDate: "2026-05-12",
    layerCount: "",
    objective: "baseline",
  };
}

describe("ExperimentMainFields", () => {
  afterEach(() => {
    cleanup();
  });

  it("lets users select layer count from the fixed options", () => {
    const onChange = vi.fn();
    render(
      <ExperimentMainFields
        disabled={false}
        materialSystemOptions={materialSystemOptions}
        onChange={onChange}
        value={createValue()}
      />,
    );

    fireEvent.mouseDown(screen.getByLabelText("层数"));
    fireEvent.click(screen.getByText("多层"));

    expect(onChange).toHaveBeenCalledWith({
      ...createValue(),
      layerCount: "多层",
    });
  });
});
