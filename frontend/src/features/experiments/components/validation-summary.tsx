import { Alert, Button, Card, Space, Tag, Typography } from "antd";

import type { ExperimentValidationIssue, ExperimentValidationResponse } from "../../../shared/types/api";

const moduleLabels: Record<string, string> = {
  basic_info: "基础信息",
  environment: "环境条件",
  precheck: "预检查",
  precursors: "前驱体",
  substrates: "基底",
  furnace_program: "炉温程序",
  gas_program: "气体程序",
  process_observation: "过程观察",
  characterization: "表征结果",
  result_summary: "结果总结",
  files: "实验文件",
};

type ValidationIssueItem = ExperimentValidationIssue & {
  level: "error" | "warning";
};

function getModuleLabel(moduleKey: string) {
  return moduleLabels[moduleKey] ?? moduleKey;
}

export function ValidationSummary({
  result,
  onJumpToModule,
}: {
  result: ExperimentValidationResponse;
  onJumpToModule: (moduleKey: string) => void;
}) {
  const items: ValidationIssueItem[] = [
    ...result.errors.map((issue) => ({ ...issue, level: "error" as const })),
    ...result.warnings.map((issue) => ({ ...issue, level: "warning" as const })),
  ];

  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <Space direction="vertical" size={12} style={{ display: "flex" }}>
        <Alert
          showIcon
          title={`校验发现 ${result.errors.length} 个错误，${result.warnings.length} 个警告`}
          type={result.errors.length > 0 ? "error" : "warning"}
        />
        <div className="editor-validation-list">
          {items.map((issue, index) => (
            <div className="editor-validation-item" key={`${issue.level}-${issue.module_key}-${issue.field_path}-${index}`}>
              <Space align="start" wrap>
                <Tag color={issue.level === "error" ? "error" : "warning"}>
                  {issue.level === "error" ? "错误" : "警告"}
                </Tag>
                <Typography.Text type="secondary">{getModuleLabel(issue.module_key)}</Typography.Text>
                <Button
                  onClick={() => {
                    onJumpToModule(issue.module_key);
                  }}
                  type="link"
                >
                  {issue.message}
                </Button>
              </Space>
            </div>
          ))}
        </div>
      </Space>
    </Card>
  );
}
