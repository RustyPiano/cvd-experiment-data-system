import { cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorStepper, type StepperItem } from "./editor-stepper";

const items: StepperItem[] = [
  { key: "basic_info", label: "基础信息", status: "current" },
  { key: "environment", label: "环境条件", status: "empty" },
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
});
