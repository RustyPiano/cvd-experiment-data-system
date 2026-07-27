# 文档索引

本目录只保留一个现状入口：[`standard/STATUS.md`](standard/STATUS.md)。任何文档与它冲突时，以 `STATUS.md` 为准。

## 现行文档

| 类别 | 文档 | 作用 |
|---|---|---|
| 现状 | [`standard/STATUS.md`](standard/STATUS.md) | 已发布 `57a25b7` 基线、本地 U 批次状态、已定决策和下一步 |
| 当前整改计划 | [`product/2026-07-27-preparation-module-finalization-plan.md`](product/2026-07-27-preparation-module-finalization-plan.md) | 制备模块终版第一批的实施边界、当前结果、下一批交互收口与专业待确认项 |
| 历史整改计划 | [`product/2026-07-24-meeting-remediation-plan.md`](product/2026-07-24-meeting-remediation-plan.md) | M-01—M-24、A-01—A-09、F-01—F-12 历史基线，以及发布后 U-01—U-32 整改与终验定义 |
| 当前整改报告 | [`reviews/2026-07-24-teacher-meeting-remediation.md`](reviews/2026-07-24-teacher-meeting-remediation.md) | M/A/F 历史门禁与主线证据、U 批次逐项状态、生产边界和 11 项专业待裁定问题 |
| 产品 | [`product/run-first-workflow-and-copy-design.md`](product/run-first-workflow-and-copy-design.md) | 2026-07-16 已确认的炉次优先工作流；阶段 0–4 已完成 |
| 标准 | [`standard/cvd-2d-process-data-standard-v2.0.md`](standard/cvd-2d-process-data-standard-v2.0.md) | CVD-2D 元数据规则书 |
| 字段 | [`standard/field-source.yaml`](standard/field-source.yaml) | 字段、词表和必填规则的唯一机器源 |
| 字段表 | [`standard/字段草案-v3.xlsx`](standard/字段草案-v3.xlsx) | 由字段单一源生成的人读表格 |
| 设计依据 | [`standard/metadata-v2-review-and-redesign.md`](standard/metadata-v2-review-and-redesign.md) | 国际对标、文献和字段设计理由 |
| 研究输入 | [`research/`](research/) | 导师批注原件、会议纪要、国际对标表和调研附件 |
| 生产切换 | [`engineering/v2-single-track-plan.md`](engineering/v2-single-track-plan.md) | v1 拆除与批8生产切换的计划及历史依据 |
| 生产部署 | [`operations/production-deployment-report-2026-07-24.md`](operations/production-deployment-report-2026-07-24.md) | 香港生产 v2 切换、旧库归档、恢复与线上验收证据 |
| 技术决策 | [`engineering/v2-implementation-plan.md`](engineering/v2-implementation-plan.md) | P0–P4 与 D1–D12 的历史技术决策 |
| 操作检查 | [`operations/e2e-walkthrough-checklist.md`](operations/e2e-walkthrough-checklist.md) | 浏览器端到端走查工单 |
| 前置验收 | [`operations/e2e-comprehensive-hardening-report-2026-07-24.md`](operations/e2e-comprehensive-hardening-report-2026-07-24.md) | 导师线上走查之前的全库加固门禁、PostgreSQL 与浏览器证据，不替代本轮验收 |
| 历史验收 | [`operations/e2e-run-first-report-2026-07-17.md`](operations/e2e-run-first-report-2026-07-17.md) | 炉次优先 17 项主线首次完整浏览器 E2E |
| 前置评审 | [`reviews/2026-07-24-comprehensive-audit-remediation.md`](reviews/2026-07-24-comprehensive-audit-remediation.md) | 导师线上走查之前的科学、数据、安全、运维与用户体验加固矩阵 |
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
