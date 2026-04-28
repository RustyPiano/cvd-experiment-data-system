import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILTIN_GAS_TEMPLATES } from "../data/builtin-templates";
import { GasProgramSection } from "./gas-program-section";

afterEach(() => {
  cleanup();
});

describe("GasProgramSection", () => {
  it("applies a built-in gas template and clears the applied alert on manual edit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <GasProgramSection
        disabled={false}
        gasOptions={[]}
        onChange={onChange}
        templates={BUILTIN_GAS_TEMPLATES}
        value={{ preWashingGas: "", segments: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "套用模板" }));
    await user.click(await screen.findByRole("menuitem", { name: "Ar 清洗 + Ar 生长" }));

    expect(onChange).toHaveBeenCalledWith({
      preWashingGas: "Ar",
      segments: [
        {
          components: [],
          endMin: "10",
          flowSccm: "200",
          gas: "Ar",
          note: "装样后高流量置换管内空气",
          sourcePayload: expect.objectContaining({ stage: "purge" }),
          stage: "purge",
          startMin: "0",
        },
        {
          components: [],
          endMin: "55",
          flowSccm: "80",
          gas: "Ar",
          note: "生长阶段载气",
          sourcePayload: expect.objectContaining({ stage: "growth" }),
          stage: "growth",
          startMin: "10",
        },
      ],
    });

    const appliedValue = onChange.mock.calls[0][0];
    expect(screen.getByText("已应用模板：Ar 清洗 + Ar 生长，请确认或修改。")).toBeInTheDocument();

    rerender(
      <GasProgramSection
        disabled={false}
        gasOptions={[]}
        onChange={onChange}
        templates={BUILTIN_GAS_TEMPLATES}
        value={appliedValue}
      />,
    );

    await user.clear(screen.getByLabelText("程序段备注 1"));
    await user.type(screen.getByLabelText("程序段备注 1"), "手动调整");

    expect(screen.queryByText("已应用模板：Ar 清洗 + Ar 生长，请确认或修改。")).not.toBeInTheDocument();
  });
});
