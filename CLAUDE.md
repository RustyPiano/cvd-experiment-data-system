# CLAUDE.md

> **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 它含**全部背景、当前进度、已冻结决策、下一步**；读完即可接手，**无需用户重复交代**。
>
> 一句话现状：**线上运行 = v1（`cvd_v1` / 68 字段），v2 代码已开发完成但未部署未迁移**（P0–P5 全部完成，2026-07-08；路线与红线见 `docs/v2-implementation-plan.md`，剩余步骤见 STATUS §6）；标准经 3 轮评审 + 导师书面评审 freeze-ready，等俊杰对齐后冻结；**字段改动改单一源 `docs/standard/field-source.yaml`，再跑 `build_field_tables.py` 重新生成 xlsx、`check_field_source.py` 校验（CI 强制），别手改 xlsx 和任何生成物**；`docs/archive/` 里都是历史，别当真相。

工程约定（工具链、开发流程、测试门禁、部署）见 [`AGENTS.md`](AGENTS.md)。
