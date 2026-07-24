# CLAUDE.md

> **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 它含**全部背景、当前进度、已冻结决策、下一步**；读完即可接手，**无需用户重复交代**。
>
> 一句话现状：**仓库与香港生产均为 v2 单轨；阶段 0–4、全库复核和 2026-07-24 批8切换已完成，旧 v1 数据库离线归档；下一步是第一条真实炉次的导出与 R0 验收**。先按 [`docs/README.md`](docs/README.md) 找文档；产品目标见 [`docs/product/run-first-workflow-and-copy-design.md`](docs/product/run-first-workflow-and-copy-design.md)，生产证据见 [`docs/operations/production-deployment-report-2026-07-24.md`](docs/operations/production-deployment-report-2026-07-24.md)，下一步见 STATUS §6。字段改动只改 `docs/standard/field-source.yaml` 并重跑全部生成器与校验；`docs/archive/` 仅供追溯。

工程约定（工具链、开发流程、测试门禁、部署）见 [`AGENTS.md`](AGENTS.md)。
