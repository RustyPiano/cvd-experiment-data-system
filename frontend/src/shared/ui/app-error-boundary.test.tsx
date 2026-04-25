import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppErrorBoundary } from "./app-error-boundary";

function BrokenChild(): ReactElement {
  throw new Error("render failed");
}

describe("AppErrorBoundary", () => {
  it("renders a recovery message when a child throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <BrokenChild />
      </AppErrorBoundary>,
    );

    expect(screen.getByText("页面渲染失败")).toBeInTheDocument();
    expect(screen.getByText("请刷新页面后重试，或返回实验列表继续操作。")).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
