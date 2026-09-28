# 文档索引

现状入口：[`standard/STATUS.md`](standard/STATUS.md)，与其他文档冲突时以它为准。

## 现行文档

| 类别 | 文档 | 作用 |
|---|---|---|
| 现状 | [`standard/STATUS.md`](standard/STATUS.md) | 当前版本、已定决策、下一步 |
| 标准 | [`standard/cvd-2d-process-data-standard-v2.0.md`](standard/cvd-2d-process-data-standard-v2.0.md) | CVD-2D 元数据规则书 |
| 字段 | [`standard/field-source.yaml`](standard/field-source.yaml) | 字段、词表和必填规则的唯一机器源 |
| 字段表 | [`standard/字段草案-v3.xlsx`](standard/字段草案-v3.xlsx) | 由字段单一源生成的人读表格 |
| 设计依据 | [`standard/metadata-v2-review-and-redesign.md`](standard/metadata-v2-review-and-redesign.md) | 国际对标、文献和字段设计理由 |
| 产品 | [`product/run-first-workflow-and-copy-design.md`](product/run-first-workflow-and-copy-design.md) | 炉次优先工作流（2026-07-16 确认） |
| 字段术语审核 | [`reviews/2026-09-21-field-terminology-taxonomy-review.md`](reviews/2026-09-21-field-terminology-taxonomy-review.md) | 字段名称、前端文字与分类体系的 30 项问题 |
| SHG | [审查](reviews/2026-09-11-shg-field-review.md) · [实施](reviews/2026-09-13-shg-implementation.md) | 检测方式与变化参数、设备目录、功率、偏振角、预设、校准（alpha.48） |
| PL | [审查](reviews/2026-09-11-pl-field-review.md) · [实施](reviews/2026-09-11-pl-implementation.md) | 设备配置、扫描/偏振、光谱单位、逐文件校正（alpha.47） |
| Raman | [审查](reviews/2026-09-10-raman-field-review.md) · [实施](reviews/2026-09-11-raman-implementation.md) | 设备配置、功率与序列、峰来源、校准适用性（alpha.46） |
| OM | [审查](reviews/2026-09-10-om-field-review.md) · [实施](reviews/2026-09-10-om-implementation.md) | 设备目录、采集表单、图像校验（alpha.45） |
| AFM | [审查](reviews/2026-09-11-afm-field-review.md) | 探针、模式联动、扫描尺寸单位、处理字段归位 |
| 表征元数据 | [审查](reviews/2026-09-09-characterization-metadata-audit.md) · [实施](reviews/2026-09-09-characterization-metadata-implementation.md) | 采集参数与文件来源（alpha.43） |
| 制备字段 | [`reviews/2026-09-09-preparation-field-review.md`](reviews/2026-09-09-preparation-field-review.md) | 目标结构形式、形态、装置附加能力、溶液用量（alpha.41） |
| 前端 | [复核](reviews/2026-09-10-frontend-design-audit-verification.md) · [修复计划](engineering/2026-09-10-frontend-design-remediation-plan.md) | 前端审计核实与 A～D 修复 |
| 制备模块终版 | [`product/2026-07-27-preparation-module-finalization-plan.md`](product/2026-07-27-preparation-module-finalization-plan.md) | 制备模块实施边界与专业待确认项 |
| 导师走查整改 | [计划](product/2026-07-24-meeting-remediation-plan.md) · [报告](reviews/2026-07-24-teacher-meeting-remediation.md) | M/A/F 与 U-01—U-32 整改、11 项专业待裁定问题 |
| v4 深度审查 | [`reviews/2026-07-28-deep-audit-remediation.md`](reviews/2026-07-28-deep-audit-remediation.md) | P0-1—P0-9 科学模型整改 |
| 生产部署 | [`operations/production-deployment-report-2026-07-24.md`](operations/production-deployment-report-2026-07-24.md) | 香港生产切换、各次发布、旧库归档与线上验收 |
| 生产切换 | [`engineering/v2-single-track-plan.md`](engineering/v2-single-track-plan.md) | v1 拆除与批8 生产切换 |
| 技术决策 | [`engineering/v2-implementation-plan.md`](engineering/v2-implementation-plan.md) | P0–P4 与 D1–D12 |
| 操作检查 | [`operations/e2e-walkthrough-checklist.md`](operations/e2e-walkthrough-checklist.md) | 浏览器端到端走查工单 |
| 历史验收 | [加固报告](operations/e2e-comprehensive-hardening-report-2026-07-24.md) · [全库审查](reviews/2026-07-24-comprehensive-audit-remediation.md) · [首次 E2E](operations/e2e-run-first-report-2026-07-17.md) | 2026-07 加固与主线 E2E 证据 |
| 精简评审 | [`reviews/2026-07-08-simplify-review.md`](reviews/2026-07-08-simplify-review.md) | 代码精简评审与执行记录 |
| 研究输入 | [`research/`](research/) | 导师批注原件、会议纪要、国际对标表和调研附件 |

## 目录约定

- `standard/`：现行标准、字段单一源、生成物和研究依据。
- `product/`：已确认的产品工作流与交互设计。
- `engineering/`：工程决策、实施历史和生产切换计划。
- `operations/`：可直接执行的运行、验收和部署检查单。
- `reviews/`：评审报告。
- `research/`：支撑标准设计的原始评审和调研材料，不是权威规范。
- `archive/`：v1 与早期历史，只供追溯。

## 维护规则

1. 实质改动完成后更新 `standard/STATUS.md` 的日期、进展和下一步。
2. 字段改动只修改 `standard/field-source.yaml`，随后重跑全部生成器和字段源校验。
3. 产品决策写入 `product/`，工程执行记录写入 `engineering/`，操作步骤写入 `operations/`。
4. 已失效文档移入 `archive/` 并在文件开头注明历史状态，不在现行目录保留重复真相。
5. 不再使用 `docs/superpowers/` 文档结构。
