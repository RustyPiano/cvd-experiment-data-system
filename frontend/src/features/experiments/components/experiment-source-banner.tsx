import { Alert, Typography } from "antd";
import { Link } from "react-router-dom";

import type { ExperimentRead } from "../../../shared/types/api";

export function ExperimentSourceBanner({
  experiment,
}: {
  experiment: Pick<ExperimentRead, "derived_from_run_code" | "derived_from_run_id">;
}) {
  if (!experiment.derived_from_run_id && !experiment.derived_from_run_code) {
    return null;
  }

  const sourceLabel = experiment.derived_from_run_code ?? "历史实验";

  return (
    <Alert
      description={
        <div>
          <Typography.Paragraph style={{ marginBottom: 8 }}>
            已自动复制基础工艺参数与计划字段；`environment` 仅保留样品环境，`precheck`
            已重置，`characterization` 仅保留计划字段并清空结果，`result_summary`
            已重置为待重新确认状态。
          </Typography.Paragraph>
          {experiment.derived_from_run_id ? (
            <Typography.Text type="secondary">
              来源实验：
              <Link to={`/experiments/${experiment.derived_from_run_id}`}>{sourceLabel}</Link>
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">来源实验：{sourceLabel}</Typography.Text>
          )}
        </div>
      }
      showIcon
      title={`本实验派生自 ${sourceLabel}`}
      type="info"
    />
  );
}
