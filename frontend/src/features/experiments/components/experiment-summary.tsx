import { Card, Descriptions, Typography } from "antd";
import dayjs from "dayjs";

import { StatusTag } from "../../../shared/ui/status-tag";
import type { ExperimentRead } from "../../../shared/types/api";

export function ExperimentSummary({ experiment }: { experiment: ExperimentRead }) {
  return (
    <Card>
      <Descriptions
        colon={false}
        column={2}
        items={[
          {
            key: "run_code",
            label: "实验编号",
            children: <Typography.Text code>{experiment.run_code}</Typography.Text>,
          },
          {
            key: "status",
            label: "状态",
            children: <StatusTag status={experiment.status} />,
          },
          {
            key: "material_system",
            label: "材料体系",
            children: experiment.material_system || "未填写",
          },
          {
            key: "experiment_date",
            label: "实验日期",
            children: dayjs(experiment.experiment_date).format("YYYY-MM-DD"),
          },
          {
            key: "objective",
            label: "实验目的",
            children: experiment.objective || "未填写",
          },
          {
            key: "quality_label",
            label: "质量标签",
            children: experiment.quality_label,
          },
        ]}
      />
    </Card>
  );
}
