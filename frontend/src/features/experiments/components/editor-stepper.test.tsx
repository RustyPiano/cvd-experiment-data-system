import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorStepper, type StepperItem } from "./editor-stepper";

const items: StepperItem[] = [
  {
    key: "basic_info",
    label: "基础信息",
    status: "current",
    completion: { state: "complete", percent: 100 },
  },
  {
    key: "environment",
    label: "环境条件",
    status: "empty",
    completion: { state: "empty", percent: 0 },
  },
];

describe("EditorStepper", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses keyboard-accessible controls for mobile stepper items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { container } = render(
      <EditorStepper currentKey="basic_info" items={items} onChange={onChange} />,
    );

    const mobileItems = container.querySelectorAll(".editor-stepper-mobile-item");
    expect(mobileItems[1]?.tagName).toBe("BUTTON");

    (mobileItems[1] as HTMLElement).focus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("environment");
  });

  it("renders completion state indicators on step dots", () => {
    const { container, getByLabelText } = render(
      <EditorStepper
        currentKey="environment"
        items={[
          {
            key: "basic_info",
            label: "基础信息",
            status: "empty",
            completion: { state: "complete", percent: 100 },
          },
          {
            key: "environment",
            label: "环境条件",
            status: "current",
            completion: { state: "partial", percent: 50 },
          },
          {
            key: "precheck",
            label: "预检查",
            status: "empty",
            completion: { state: "warning", percent: 100, warnings: 2 },
          },
          {
            key: "gas_program",
            label: "气体程序",
            status: "empty",
            completion: { state: "error", percent: 50, errors: 1 },
          },
        ]}
        onChange={() => undefined}
      />,
    );

    expect(container.querySelector(".editor-stepper-dot.complete")).not.toBeNull();
    expect(container.querySelector(".editor-stepper-dot.partial.high")).not.toBeNull();
    expect(getByLabelText("预检查：提示 2 项，完成度 100%")).toBeTruthy();
    expect(getByLabelText("气体程序：阻塞 1 项，完成度 50%")).toBeTruthy();
  });
});
