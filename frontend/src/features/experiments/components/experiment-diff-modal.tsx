import { Alert, Empty, Modal, Space, Switch, Typography } from "antd";
import { useMemo, useState } from "react";

import type { EditorSectionKey } from "../editor-types";
import { buildExperimentModuleDiffs } from "../diff-utils";
import { DiffSection } from "./diff-section";

export function ExperimentDiffModal({
  currentModules,
  errorMessage,
  loading,
  onClose,
  open,
  sourceModules,
  sourceRunCode,
}: {
  currentModules: Record<EditorSectionKey, Record<string, unknown>>;
  errorMessage?: string | null;
  loading?: boolean;
  onClose: () => void;
  open: boolean;
  sourceModules: Partial<Record<EditorSectionKey, Record<string, unknown>>>;
  sourceRunCode?: string | null;
}) {
  const [collapseSame, setCollapseSame] = useState(true);
  const moduleDiffs = useMemo(
    () =>
      buildExperimentModuleDiffs({
        sourceModules,
        currentModules,
      }),
    [currentModules, sourceModules],
  );
  const visibleModuleDiffs = collapseSame
    ? moduleDiffs.filter((moduleDiff) => moduleDiff.status !== "same")
    : moduleDiffs;

  return (
    <Modal
      aria-label="实验差异"
      footer={null}
      onCancel={onClose}
      open={open}
      title="实验差异"
      width={960}
    >
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          对比来源实验{sourceRunCode ? ` ${sourceRunCode}` : ""}与当前编辑内容。
        </Typography.Text>
        <Switch
          checked={collapseSame}
          checkedChildren="折叠相同"
          onChange={setCollapseSame}
          unCheckedChildren="显示全部"
        />
        {loading ? <Alert title="正在加载来源模块..." showIcon type="info" /> : null}
        {errorMessage ? <Alert title={errorMessage} showIcon type="error" /> : null}
        {!loading && !errorMessage && visibleModuleDiffs.length === 0 ? (
          <Empty description="没有差异" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : null}
        {!loading && !errorMessage
          ? visibleModuleDiffs.map((moduleDiff) => (
              <DiffSection
                collapseSame={collapseSame}
                key={moduleDiff.moduleKey}
                moduleDiff={moduleDiff}
              />
            ))
          : null}
      </Space>
    </Modal>
  );
}
