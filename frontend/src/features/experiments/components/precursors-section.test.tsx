import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyPrecursorItem, type PrecursorsValues, type VocabularySelectOption } from "../editor-types";
import { PrecursorsSection } from "./precursors-section";

const precursorMethodOptions: VocabularySelectOption[] = [
  { label: "溶液", value: "solution" },
  { label: "旋涂", value: "spin_coating" },
  { label: "熔融", value: "melting" },
  { label: "粉末", value: "powder" },
];

function renderSection(value: PrecursorsValues, onChange = vi.fn()) {
  render(
    <PrecursorsSection
      disabled={false}
      onChange={onChange}
      precursorMethodOptions={precursorMethodOptions}
      value={value}
    />,
  );
  return onChange;
}

describe("PrecursorsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows spin parameters and hides mass/preparation time for solution method", () => {
    renderSection({
      items: [
        {
          ...createEmptyPrecursorItem(),
          method: "solution",
        },
      ],
    });

    expect(screen.getByLabelText("预旋涂转速 1")).toBeInTheDocument();
    expect(screen.getByLabelText("预旋涂时长 1")).toBeInTheDocument();
    expect(screen.getByLabelText("旋涂转速 1")).toBeInTheDocument();
    expect(screen.getByLabelText("旋涂时长 1")).toBeInTheDocument();
    expect(screen.getByLabelText("浓度 1")).toBeInTheDocument();
    expect(screen.getByLabelText("浓度单位 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("前驱体质量 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("制备时长 1")).not.toBeInTheDocument();
  });

  it("shows spin parameters and hides mass/preparation time for spin_coating method", () => {
    renderSection({
      items: [
        {
          ...createEmptyPrecursorItem(),
          method: "spin_coating",
        },
      ],
    });

    expect(screen.getByLabelText("预旋涂转速 1")).toBeInTheDocument();
    expect(screen.getByLabelText("预旋涂时长 1")).toBeInTheDocument();
    expect(screen.getByLabelText("旋涂转速 1")).toBeInTheDocument();
    expect(screen.getByLabelText("旋涂时长 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("前驱体质量 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("制备时长 1")).not.toBeInTheDocument();
  });

  it("shows mass field and hides spin parameters for melting method", () => {
    renderSection({
      items: [
        {
          ...createEmptyPrecursorItem(),
          method: "melting",
        },
      ],
    });

    expect(screen.getByLabelText("前驱体质量 1")).toBeInTheDocument();
    expect(screen.getByLabelText("熔融温度 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("预旋涂转速 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("旋涂转速 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("浓度 1")).not.toBeInTheDocument();
  });

  it("shows mass field by default when no method is selected", () => {
    renderSection({
      items: [createEmptyPrecursorItem()],
    });

    expect(screen.getByLabelText("前驱体质量 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("浓度 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("预旋涂转速 1")).not.toBeInTheDocument();
  });

  it("clears method-inapplicable stale values when switching to solution", () => {
    const onChange = renderSection({
      items: [
        {
          ...createEmptyPrecursorItem(),
          method: "powder",
          massMg: "abc",
          preparationTimeMin: "20",
          meltingTemperatureC: "750",
        },
      ],
    });

    fireEvent.change(screen.getByLabelText("制备方法 1"), {
      target: { value: "溶液" },
    });

    expect(onChange).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          method: "solution",
          massMg: "",
          preparationTimeMin: "",
          meltingTemperatureC: "",
        }),
      ],
    });
  });
});
