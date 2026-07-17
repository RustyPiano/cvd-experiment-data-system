# 文档索引

本目录只保留一个现状入口：[`standard/STATUS.md`](standard/STATUS.md)。任何文档与它冲突时，以 `STATUS.md` 为准。

## 现行文档

| 类别 | 文档 | 作用 |
|---|---|---|
| 现状 | [`standard/STATUS.md`](standard/STATUS.md) | 当前代码、生产状态、已定决策和下一步 |
| 产品 | [`product/run-first-workflow-and-copy-design.md`](product/run-first-workflow-and-copy-design.md) | 2026-07-16 已确认的炉次优先工作流；阶段 1–3 已完成，待全流程 E2E 验收 |
| 标准 | [`standard/cvd-2d-process-data-standard-v2.0.md`](standard/cvd-2d-process-data-standard-v2.0.md) | CVD-2D 元数据规则书 |
| 字段 | [`standard/field-source.yaml`](standard/field-source.yaml) | 字段、词表和必填规则的唯一机器源 |
| 字段表 | [`standard/字段草案-v3.xlsx`](standard/字段草案-v3.xlsx) | 由字段单一源生成的人读表格 |
| 设计依据 | [`standard/metadata-v2-review-and-redesign.md`](standard/metadata-v2-review-and-redesign.md) | 国际对标、文献和字段设计理由 |
| 研究输入 | [`research/`](research/) | 导师批注原件、会议纪要、国际对标表和调研附件 |
| 生产切换 | [`engineering/v2-single-track-plan.md`](engineering/v2-single-track-plan.md) | v1 拆除记录与待执行的批8人工切换 |
| 技术决策 | [`engineering/v2-implementation-plan.md`](engineering/v2-implementation-plan.md) | P0–P4 与 D1–D12 的历史技术决策 |
| 操作检查 | [`operations/e2e-walkthrough-checklist.md`](operations/e2e-walkthrough-checklist.md) | 浏览器端到端走查工单 |
| 评审 | [`reviews/2026-07-08-simplify-review.md`](reviews/2026-07-08-simplify-review.md) | 代码精简评审与执行记录 |

## 目录约定

- `standard/`：现行标准、字段单一源、生成物和研究依据。
- `product/`：已确认的产品工作流与交互设计。
- `engineering/`：工程决策、实施历史和生产切换计划。
- `operations/`：可直接执行的运行、验收和部署检查单。
- `reviews/`：评审报告。
- `research/`：支撑标准设计的原始评审和调研材料，不是权威规范。
- `archive/`：v1 与早期历史，只供追溯，不代表现状。

## 维护规则

1. 实质改动完成后更新 `standard/STATUS.md` 的日期、进展和下一步。
2. 字段改动只修改 `standard/field-source.yaml`，随后重跑全部生成器和字段源校验。
3. 产品决策写入 `product/`，工程执行记录写入 `engineering/`，操作步骤写入 `operations/`。
4. 已失效文档移入 `archive/` 并在文件开头注明历史状态，不在现行目录保留重复真相。
5. 不再使用 `docs/superpowers/` 文档结构。
