import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorSectionCard } from "./editor-section-card";

describe("EditorSectionCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not show local save status tags", () => {
    const { getByText, queryByText } = render(
      <EditorSectionCard
        state={{ status: "idle", message: null }}
        subtitle="记录实验基础信息。"
        title="基础信息"
      >
        <div>表单内容</div>
      </EditorSectionCard>,
    );

    expect(getByText("基础信息")).toBeTruthy();
    expect(queryByText("待保存")).toBeNull();
    expect(queryByText("已保存")).toBeNull();
  });

  it("keeps section save failures visible", () => {
    const { getByText, queryByText } = render(
      <EditorSectionCard
        state={{ status: "error", message: "自动保存失败" }}
        subtitle="记录实验基础信息。"
        title="基础信息"
      >
        <div>表单内容</div>
      </EditorSectionCard>,
    );

    expect(getByText("自动保存失败")).toBeTruthy();
    expect(queryByText("保存失败")).toBeNull();
  });

  it("keeps saved warning details visible", () => {
    const { getByText } = render(
      <EditorSectionCard
        state={{ status: "saved", message: "已自动保存：模板 Setup 图未能自动附加，请手动上传" }}
        subtitle="记录 Setup / Methods。"
        title="Setup / Methods"
      >
        <div>表单内容</div>
      </EditorSectionCard>,
    );

    expect(getByText("已自动保存：模板 Setup 图未能自动附加，请手动上传")).toBeTruthy();
  });
});
