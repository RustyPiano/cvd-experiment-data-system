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

function getSummaryValue(value: number | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
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
  const completionScore = getSummaryValue(result.completion_score, items.length === 0 ? 100 : 0);
  const blockingCount = getSummaryValue(result.blocking_count, result.errors.length);
  const warningCount = getSummaryValue(result.warning_count, result.warnings.length);
  const moduleTargets = [...new Set(items.map((issue) => issue.module_key))];

  if (items.length === 0 && completionScore >= 100) {
    return null;
  }

  return (
    <Card>
      <Space orientation="vertical" size={12} style={{ display: "flex" }}>
        <Alert
          showIcon
          title={`校验发现 ${blockingCount} 个错误，${warningCount} 个警告`}
          type={blockingCount > 0 ? "error" : "warning"}
        />
        <Space wrap>
          <Tag color={completionScore >= 90 ? "success" : completionScore >= 70 ? "warning" : "error"}>
            完整度 {completionScore}%
          </Tag>
          <Tag color={blockingCount > 0 ? "error" : "success"}>阻塞项 {blockingCount}</Tag>
          <Tag color={warningCount > 0 ? "warning" : "success"}>提示项 {warningCount}</Tag>
          {moduleTargets.map((moduleKey) => (
            <Button
              key={moduleKey}
              onClick={() => {
                onJumpToModule(moduleKey);
              }}
              size="small"
            >
              跳转到{getModuleLabel(moduleKey)}
            </Button>
          ))}
        </Space>
        <div className="editor-validation-list">
          {items.map((issue, index) => (
            <div className="editor-validation-item" key={`${issue.level}-${issue.module_key}-${issue.field_path}-${index}`}>
              <Space align="start" wrap>
                <Tag color={issue.level === "error" ? "error" : "warning"}>
                  {issue.level === "error" ? "错误" : "警告"}
                </Tag>
                <Typography.Text type="secondary">{getModuleLabel(issue.module_key)}</Typography.Text>
                <Typography.Text>{issue.message}</Typography.Text>
              </Space>
            </div>
          ))}
        </div>
      </Space>
    </Card>
  );
}
