# CLAUDE.md

> **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 它含**全部背景、当前进度、已冻结决策、下一步**；读完即可接手，**无需用户重复交代**。
>
> 一句话现状：**仓库已 v2 单轨，收尾批 F1–F9 基线已于 `52bc560` 提交；2026-07-16 确认的炉次优先工作流与全量双语文案重构正按阶段实施；线上仍是切换前旧部署，批8 前禁止 `deploy.sh`**。先按 [`docs/README.md`](docs/README.md) 找文档；产品目标见 [`docs/product/run-first-workflow-and-copy-design.md`](docs/product/run-first-workflow-and-copy-design.md)，生产切换见 [`docs/engineering/v2-single-track-plan.md`](docs/engineering/v2-single-track-plan.md)，下一步见 STATUS §6。字段改动只改 `docs/standard/field-source.yaml` 并重跑全部生成器与校验；`docs/archive/` 仅供追溯。

工程约定（工具链、开发流程、测试门禁、部署）见 [`AGENTS.md`](AGENTS.md)。
