# CLAUDE.md

> **先读 [`docs/standard/STATUS.md`](docs/standard/STATUS.md)** —— 它含**全部背景、当前进度、已冻结决策、下一步**；读完即可接手，**无需用户重复交代**。
>
> 一句话现状：**线上系统是 v1（`cvd_v1` / 68 字段）**；v2/v3 是元数据重构设计、未落代码（实现期已启动，路线见 `docs/v2-implementation-plan.md`）；两份交付物（`字段草案-v3.xlsx` + `cvd-2d-process-data-standard-v2.0.md`）经 3 轮评审 + 导师书面评审已 freeze-ready；**字段改动改单一源 `docs/standard/field-source.yaml`，再跑 `build_field_tables.py` 重新生成 xlsx、`check_field_source.py` 校验（CI 强制），别手改 xlsx**；`docs/archive/` 里都是历史，别当真相。

工程约定（工具链、开发流程、测试门禁、部署）见 [`AGENTS.md`](AGENTS.md)。
