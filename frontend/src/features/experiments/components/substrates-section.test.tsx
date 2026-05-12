import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubstratesValues, VocabularySelectOption } from "../editor-types";
import { SubstratesSection } from "./substrates-section";

const substrateTypeOptions: VocabularySelectOption[] = [
  { label: "硅片单抛N<100>", value: "硅片单抛N<100>" },
  { label: "蓝宝石双抛C<0001>", value: "蓝宝石双抛C<0001>" },
];
const substrateBrandOptions: VocabularySelectOption[] = [
  { label: "华赫硅材料", value: "华赫硅材料" },
  { label: "合肥科晶", value: "合肥科晶" },
];
const substrateSizeOptions: VocabularySelectOption[] = [
  { label: "5x5", value: "5x5" },
  { label: "5x10", value: "5x10" },
];
const substrateTreatmentMethodOptions: VocabularySelectOption[] = [
  { label: "无", value: "none" },
  { label: "退火", value: "annealing" },
  { label: "等离子清洗", value: "plasma_cleaning" },
];

function renderSection(value: SubstratesValues, onChange = vi.fn()) {
  render(
    <SubstratesSection
      disabled={false}
      gasOptions={[]}
      onChange={onChange}
      substrateBrandOptions={substrateBrandOptions}
      substrateSizeOptions={substrateSizeOptions}
      substrateTreatmentMethodOptions={substrateTreatmentMethodOptions}
      substrateTypeOptions={substrateTypeOptions}
      value={value}
    />,
  );

  return onChange;
}

describe("SubstratesSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders fixed upper and lower substrate rows and writes the role automatically", () => {
    const onChange = renderSection({ items: [] });

    expect(screen.getByText("上基底")).toBeInTheDocument();
    expect(screen.getByText("下基底")).toBeInTheDocument();
    expect(screen.getAllByText("基底类型")).toHaveLength(2);
    expect(screen.queryByText("基底类型 上基底")).not.toBeInTheDocument();
    expect(screen.queryByText("基底类型 下基底")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "添加基底" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("基底角色 上基底")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("基底类型 下基底"), {
      target: { value: "蓝宝石双抛C<0001>" },
    });

    expect(onChange).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          role: "bottom",
          type: "蓝宝石双抛C<0001>",
        }),
      ],
    });
  });

  it("records substrate batch number for each fixed substrate", () => {
    const onChange = renderSection({ items: [] });

    fireEvent.change(screen.getByLabelText("基底批次 上基底"), {
      target: { value: "SUB-2026-05-A" },
    });

    expect(onChange).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          role: "top",
          batchNo: "SUB-2026-05-A",
        }),
      ],
    });
  });

  it("shows the vocabulary label for stored substrate treatment values", () => {
    renderSection({
      items: [
        {
          role: "top",
          type: "",
          brand: "",
          sizeMm: "",
          batchNo: "",
          treatmentMethod: "plasma_cleaning",
          positionMm: "",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
      ],
    });

    expect(screen.getByLabelText("处理方式 上基底")).toHaveValue("等离子清洗");
  });

  it("clears only the selected substrate role", () => {
    const onChange = renderSection({
      items: [
        {
          role: "top",
          type: "硅片单抛N<100>",
          brand: "华赫硅材料",
          sizeMm: "5x10",
          batchNo: "",
          treatmentMethod: "none",
          positionMm: "1",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
        {
          role: "bottom",
          type: "蓝宝石双抛C<0001>",
          brand: "合肥科晶",
          sizeMm: "5x5",
          batchNo: "",
          treatmentMethod: "annealing",
          positionMm: "-1",
          treatmentTemperatureC: "",
          treatmentDurationMin: "",
          treatmentPowerW: "",
          treatmentGas: "",
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "清空下基底" }));

    expect(onChange).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          role: "top",
          type: "硅片单抛N<100>",
        }),
      ],
    });
  });

  it("drops hidden non-top-bottom items when editing a fixed substrate", () => {
    const onChange = renderSection({
      items: [
        {
          role: "control",
          type: "Legacy hidden substrate",
          brand: "Legacy brand",
          sizeMm: "legacy",
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

    fireEvent.change(screen.getByLabelText("基底类型 上基底"), {
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
